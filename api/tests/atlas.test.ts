import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { AtlasRepository, migrate, openDatabase, type SqliteDatabase } from "../src/db/database.js";
import { buildDurableMemoryFacts } from "../src/backboard/client.js";
import { buildWorkspaceGraph } from "../src/graph/workspace.js";
import { buildHandoffMap, buildScanContext } from "../src/graph/context.js";
import { buildGraphFromArtifacts } from "../src/graph/normalize.js";
import { parseGitHubRepo, repoUrlSchema } from "../src/github/url.js";
import { scanRepository } from "../src/scanner/scanner.js";
import { buildApp } from "../src/server/app.js";
import { ScanService } from "../src/server/scan-service.js";
import type { BackboardSynthesis, GraphData, RepositoryRecord } from "../src/types/domain.js";
import { compactForPrompt, redactSecrets } from "../src/util/redact.js";

const fixtureRoot = path.resolve("tests/fixtures/sample-js");
const FAKE_STRIPE_TOKEN = ["sk", "live", "1234567890", "1234567890", "1234567890"].join("_");
const FAKE_ENV_TOKEN = ["sk", "live", "should_not_be_scanned"].join("_");

function fakeBackboard(): BackboardSynthesis {
  return {
    assistantId: "asst_test",
    threadId: "thread_test",
    runId: "run_test",
    messageId: "msg_test",
    content: "{}",
    memoryMode: "Auto",
    memoryOperationId: "mem_test",
    responseJson: { ok: true },
    synthesized: {
      repoPurpose: "Fixture service for scan tests.",
      riskAreas: ["Database and queue paths need runtime verification."],
    },
  };
}

function repoRecord(id = "repo_fixture", packageName = "@atlas/sample-service"): RepositoryRecord {
  return {
    id,
    workspaceId: "test",
    owner: "atlas",
    name: "sample-service",
    url: "https://github.com/atlas/sample-service",
    cloneUrl: "https://github.com/atlas/sample-service.git",
    packageName,
    lastCommitSha: "abc1234",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

describe("repo URL validation", () => {
  it("normalizes supported public GitHub URLs", () => {
    expect(parseGitHubRepo("github.com/fastify/fastify-plugin").normalizedUrl).toBe(
      "https://github.com/fastify/fastify-plugin",
    );
    expect(parseGitHubRepo("https://github.com/fastify/fastify-autoload.git").cloneUrl).toBe(
      "https://github.com/fastify/fastify-autoload.git",
    );
  });

  it("rejects non-GitHub URLs", () => {
    expect(() => repoUrlSchema.parse("https://gitlab.com/a/b")).toThrow();
    expect(() => repoUrlSchema.parse("not-a-repo")).toThrow();
  });
});

describe("deterministic scanner", () => {
  it("extracts package, imports, HTTP, env, database, queue, config, route, and docs clues", async () => {
    const artifacts = await scanRepository(fixtureRoot, { maxFiles: 100, maxFileBytes: 100_000 });
    const kinds = new Set(artifacts.findings.map((finding) => finding.kind));

    expect(artifacts.package.name).toBe("@atlas/sample-service");
    for (const kind of ["package", "import", "http", "env", "database", "queue", "config", "api-route", "doc"]) {
      expect(kinds.has(kind)).toBe(true);
    }
    expect(artifacts.findings.every((finding) => finding.filePath && finding.lineStart >= 1 && finding.snippet)).toBe(true);
  });

  it("redacts inline secrets and excludes secret files from scan artifacts", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-secret-scan-"));
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "@atlas/secret-fixture", dependencies: { axios: "^1.0.0" } }, null, 2));
    await fs.writeFile(
      path.join(tempDir, "src", "client.ts"),
      `const apiKey = "${FAKE_STRIPE_TOKEN}"; axios.post("https://example.com", { apiKey });\n`,
    );
    await fs.writeFile(path.join(tempDir, ".env.local"), `BACKBOARD_API_KEY=${FAKE_ENV_TOKEN}\n`);

    const artifacts = await scanRepository(tempDir, { maxFiles: 100, maxFileBytes: 100_000 });
    const serialized = JSON.stringify(artifacts);

    expect(redactSecrets(`const apiKey = "${FAKE_STRIPE_TOKEN}";`)).not.toContain(FAKE_STRIPE_TOKEN);
    expect(serialized).not.toContain(FAKE_STRIPE_TOKEN);
    expect(serialized).not.toContain(FAKE_ENV_TOKEN);
    expect(artifacts.files.some((file) => file.path.includes(".env"))).toBe(false);
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});

describe("graph normalization", () => {
  it("builds evidence-backed nodes and edges from scan artifacts", async () => {
    const artifacts = await scanRepository(fixtureRoot, { maxFiles: 100, maxFileBytes: 100_000 });
    const graph = buildGraphFromArtifacts({
      repository: repoRecord(),
      commitSha: "abc1234",
      artifacts,
      backboard: fakeBackboard(),
    });

    expect(graph.nodes.length).toBeGreaterThan(3);
    expect(graph.links.length).toBeGreaterThan(3);
    expect(graph.nodes.every((node) => (node.evidence?.length ?? 0) > 0)).toBe(true);
    expect(graph.links.every((link) => (link.evidence?.length ?? 0) > 0)).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "database")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "queue")).toBe(true);
  });

  it("keeps unsupported Backboard synthesis out of confirmed graph facts", async () => {
    const artifacts = await scanRepository(fixtureRoot, { maxFiles: 100, maxFileBytes: 100_000 });
    const graph = buildGraphFromArtifacts({
      repository: repoRecord(),
      commitSha: "abc1234",
      artifacts,
      backboard: {
        ...fakeBackboard(),
        synthesized: {
          repoPurpose: "UNSUPPORTED LLM PURPOSE",
          nodeSummaries: { src: "UNSUPPORTED NODE SUMMARY" },
          edgeSummaries: { axios: "UNSUPPORTED EDGE SUMMARY" },
          riskAreas: ["UNSUPPORTED RISK"],
        },
      },
    });
    const serialized = JSON.stringify(graph);

    expect(serialized).not.toContain("UNSUPPORTED LLM PURPOSE");
    expect(serialized).not.toContain("UNSUPPORTED NODE SUMMARY");
    expect(serialized).not.toContain("UNSUPPORTED EDGE SUMMARY");
    expect(serialized).not.toContain("UNSUPPORTED RISK");
  });

  it("preserves stable evidence ids and source-to-source relative import edges", async () => {
    const artifacts = await scanRepository(fixtureRoot, { maxFiles: 100, maxFileBytes: 100_000 });
    const graph = buildGraphFromArtifacts({ repository: repoRecord(), commitSha: "abc1234", artifacts, backboard: fakeBackboard() });
    const allEvidence = [...graph.nodes.flatMap((node) => node.evidence ?? []), ...graph.links.flatMap((link) => link.evidence ?? [])];
    const relativeImportLink = graph.links.find((link) => link.contract.startsWith("Relative import path:"));

    expect(allEvidence.every((evidence) => evidence.id)).toBe(true);
    expect(relativeImportLink).toBeTruthy();
    expect(relativeImportLink?.evidence?.[0]?.id).toBeTruthy();
  });

  it("builds a handoff map from evidence files to graph nodes and edges", async () => {
    const artifacts = await scanRepository(fixtureRoot, { maxFiles: 100, maxFileBytes: 100_000 });
    const repository = repoRecord();
    const graph = buildGraphFromArtifacts({
      repository,
      commitSha: "abc1234",
      artifacts,
      backboard: fakeBackboard(),
    });
    const handoff = buildHandoffMap({ repository, graph, commitSha: "abc1234" });

    expect(handoff.files.length).toBeGreaterThan(0);
    expect(handoff.files.some((file) => file.filePath === "src/server.ts")).toBe(true);
    expect(handoff.files.flatMap((file) => file.nodes).every((node) => node.confidence && node.detector && node.evidenceId && node.snippet)).toBe(true);
    expect(handoff.files.flatMap((file) => file.edges).every((edge) => edge.confidence && edge.detector && edge.evidenceId && edge.snippet)).toBe(true);
  });
});

describe("SQLite persistence", () => {
  let tempDir: string;
  let db: SqliteDatabase;
  let repository: AtlasRepository;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-db-"));
    db = openDatabase(path.join(tempDir, "atlas.db"));
    migrate(db);
    repository = new AtlasRepository(db);
    repository.ensureWorkspace("test");
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("stores repositories, scans, nodes, edges, evidence, and Backboard records", async () => {
    const repo = repository.upsertRepository({
      id: "repo_fixture",
      workspaceId: "test",
      owner: "atlas",
      name: "sample-service",
      url: "https://github.com/atlas/sample-service",
      cloneUrl: "https://github.com/atlas/sample-service.git",
      packageName: "@atlas/sample-service",
      lastCommitSha: "abc1234",
    });
    const scan = repository.createScan({
      id: "scan_fixture",
      workspaceId: "test",
      repositoryId: repo.id,
      repoUrl: repo.url,
    });
    const artifacts = await scanRepository(fixtureRoot, { maxFiles: 100, maxFileBytes: 100_000 });
    const graph = buildGraphFromArtifacts({ repository: repo, commitSha: "abc1234", artifacts, backboard: fakeBackboard() });
    const context = buildScanContext({ repository: repo, graph, commitSha: "abc1234" });

    repository.replaceGraphRows({ workspaceId: "test", repositoryId: repo.id, scanId: scan.id, graph });
    repository.completeScan({ scanId: scan.id, commitSha: "abc1234", graph, context, artifacts, backboard: fakeBackboard() });
    repository.recordBackboard({
      workspaceId: "test",
      repositoryId: repo.id,
      scanId: scan.id,
      backboard: fakeBackboard(),
      requestSummary: "fixture",
    });

    expect(repository.countTable("repositories")).toBe(1);
    expect(repository.countTable("scans")).toBe(1);
    expect(repository.countTable("nodes")).toBeGreaterThan(0);
    expect(repository.countTable("edges")).toBeGreaterThan(0);
    expect(repository.countTable("evidence")).toBeGreaterThan(0);
    expect(repository.countTable("backboard_records")).toBe(1);
    expect(repository.getNode(graph.nodes[0].id)?.id).toBe(graph.nodes[0].id);
    expect(repository.getEdge(graph.links[0].id)?.id).toBe(graph.links[0].id);
    const evidenceRow = db.prepare("SELECT stable_id FROM evidence WHERE stable_id IS NOT NULL LIMIT 1").get() as
      | { stable_id: string }
      | undefined;
    expect(evidenceRow?.stable_id).toBeTruthy();
  });
});

describe("Backboard payload safety", () => {
  it("builds redacted prompt and evidence-indexed memory facts", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-memory-safety-"));
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({ name: "@atlas/memory-fixture", dependencies: { axios: "^1.0.0" } }, null, 2));
    await fs.writeFile(
      path.join(tempDir, "src", "client.ts"),
      `const apiKey = "${FAKE_STRIPE_TOKEN}"; axios.post("https://example.com", { apiKey });\n`,
    );

    const artifacts = await scanRepository(tempDir, { maxFiles: 100, maxFileBytes: 100_000 });
    const promptPayload = compactForPrompt({ findings: artifacts.findings, selectedSnippets: artifacts.selectedSnippets }, 20_000);
    const facts = buildDurableMemoryFacts({ repository: repoRecord("repo_memory", "@atlas/memory-fixture"), commitSha: "abc1234", artifacts });
    const serializedFacts = JSON.stringify(facts);

    expect(promptPayload).not.toContain(FAKE_STRIPE_TOKEN);
    expect(serializedFacts).not.toContain(FAKE_STRIPE_TOKEN);
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((fact) => fact.evidenceIds.length > 0 && fact.evidenceRefs.length > 0)).toBe(true);
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});

describe("workspace graph merge", () => {
  it("creates supported package-level cross-repo edges", () => {
    const sourceRepo: RepositoryRecord = {
      ...repoRecord("repo_app", "@atlas/app"),
      name: "app",
      url: "https://github.com/atlas/app",
      cloneUrl: "https://github.com/atlas/app.git",
    };
    const packageRepo: RepositoryRecord = {
      ...repoRecord("repo_plugin", "fastify-plugin"),
      owner: "fastify",
      name: "fastify-plugin",
      url: "https://github.com/fastify/fastify-plugin",
      cloneUrl: "https://github.com/fastify/fastify-plugin.git",
    };
    const graphA: GraphData = {
      nodes: [
        { id: "app-root", label: "atlas/app", kind: "service", domain: "Repository", whatItIs: "app", whyItExists: "test", owns: [], confidence: "confirmed", risks: [], repositoryId: sourceRepo.id, evidence: [{ id: "ev-app-root", filePath: "package.json", lineStart: 1, lineEnd: 1, snippet: "{}", detector: "test", confidenceReason: "test" }] },
        { id: "dep-fastify-plugin", label: "fastify-plugin", kind: "external", domain: "Dependency", whatItIs: "dep", whyItExists: "test", owns: [], confidence: "confirmed", risks: [], repositoryId: sourceRepo.id, evidence: [] },
      ],
      links: [
        {
          id: "app-fastify-plugin",
          source: "app-root",
          target: "dep-fastify-plugin",
          kind: "sync",
          criticality: 3,
          summary: "depends",
          code: "\"fastify-plugin\": \"^5.0.0\"",
          codePath: "package.json:L4",
          contract: "package.json dependency fastify-plugin@^5.0.0",
          failure: "test",
          risks: [],
          confidence: "confirmed",
          repositoryId: sourceRepo.id,
          evidence: [{ id: "ev-source-dep", filePath: "package.json", lineStart: 4, lineEnd: 4, snippet: "\"fastify-plugin\": \"^5.0.0\"", detector: "package-json-dependency", confidenceReason: "test" }],
        },
      ],
    };
    const graphB: GraphData = {
      nodes: [
        { id: "plugin-root", label: "fastify/fastify-plugin", kind: "service", domain: "Repository", whatItIs: "plugin", whyItExists: "test", owns: [], confidence: "confirmed", risks: [], repositoryId: packageRepo.id, evidence: [{ id: "ev-target-package", filePath: "package.json", lineStart: 2, lineEnd: 2, snippet: "\"name\": \"fastify-plugin\"", detector: "package-json-name", confidenceReason: "test" }] },
      ],
      links: [],
    };

    const workspace = buildWorkspaceGraph({
      workspaceId: "test",
      repositories: [sourceRepo, packageRepo],
      scans: [
        { id: "scan_a", workspaceId: "test", repositoryId: sourceRepo.id, repoUrl: sourceRepo.url, status: "completed", graph: graphA, createdAt: "", commitSha: "a" },
        { id: "scan_b", workspaceId: "test", repositoryId: packageRepo.id, repoUrl: packageRepo.url, status: "completed", graph: graphB, createdAt: "", commitSha: "b" },
      ],
    });

    expect(workspace.crossRepoConnections).toHaveLength(1);
    expect(workspace.crossRepoConnections[0].sourceEvidence.map((item) => item.id)).toContain("ev-source-dep");
    expect(workspace.crossRepoConnections[0].targetEvidence.map((item) => item.id)).toContain("ev-target-package");
    expect(workspace.links.some((link) => link.contract.includes("Cross-repo package relationship"))).toBe(true);
  });
});

describe("API route schemas", () => {
  it("enforces optional API auth on scan and export endpoints", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-api-auth-"));
    const db = openDatabase(path.join(tempDir, "atlas.db"));
    migrate(db);
    const repository = new AtlasRepository(db);
    repository.ensureWorkspace("test");
    const app = await buildApp({
      config: loadConfig({
        rootDir: tempDir,
        databaseUrl: `file:${path.join(tempDir, "atlas.db")}`,
        databasePath: path.join(tempDir, "atlas.db"),
        workspaceId: "test",
        backboardApiKey: "test",
        apiAuthToken: "local-token",
      }),
      repository,
    });

    const unauthorized = await app.inject({ method: "POST", url: "/api/scans", payload: { repoUrl: "https://github.com/fastify/fastify-plugin" } });
    const authorizedInvalid = await app.inject({
      method: "POST",
      url: "/api/scans",
      headers: { authorization: "Bearer local-token" },
      payload: { repoUrl: "https://gitlab.com/not/github" },
    });
    const exportUnauthorized = await app.inject({ method: "GET", url: "/api/scans/missing/export" });

    expect(unauthorized.statusCode).toBe(401);
    expect(authorizedInvalid.statusCode).toBe(400);
    expect(exportUnauthorized.statusCode).toBe(401);
    await app.close();
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("enforces configured GitHub allowed owners before cloning", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-allowed-orgs-"));
    const db = openDatabase(path.join(tempDir, "atlas.db"));
    migrate(db);
    const repository = new AtlasRepository(db);
    const service = new ScanService(
      loadConfig({
        rootDir: tempDir,
        databaseUrl: `file:${path.join(tempDir, "atlas.db")}`,
        databasePath: path.join(tempDir, "atlas.db"),
        workspaceId: "test",
        backboardApiKey: "test",
        githubAllowedOrgs: ["fastify"],
      }),
      repository,
    );

    await expect(service.startScan({ repoUrl: "https://github.com/not-fastify/example" })).rejects.toThrow(
      /not allowed/,
    );
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns 400 for invalid scan requests", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-api-"));
    const db = openDatabase(path.join(tempDir, "atlas.db"));
    migrate(db);
    const repository = new AtlasRepository(db);
    repository.ensureWorkspace("test");
    const app = await buildApp({
      config: loadConfig({
        rootDir: tempDir,
        databaseUrl: `file:${path.join(tempDir, "atlas.db")}`,
        databasePath: path.join(tempDir, "atlas.db"),
        workspaceId: "test",
        backboardApiKey: "test",
      }),
      repository,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/scans",
      payload: { repoUrl: "https://gitlab.com/not/github" },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns the handoff map for completed scans", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-api-"));
    const db = openDatabase(path.join(tempDir, "atlas.db"));
    migrate(db);
    const repository = new AtlasRepository(db);
    repository.ensureWorkspace("test");
    const repo = repository.upsertRepository({
      id: "repo_fixture",
      workspaceId: "test",
      owner: "atlas",
      name: "sample-service",
      url: "https://github.com/atlas/sample-service",
      cloneUrl: "https://github.com/atlas/sample-service.git",
      packageName: "@atlas/sample-service",
      lastCommitSha: "abc1234",
    });
    const scan = repository.createScan({
      id: "scan_fixture",
      workspaceId: "test",
      repositoryId: repo.id,
      repoUrl: repo.url,
    });
    const artifacts = await scanRepository(fixtureRoot, { maxFiles: 100, maxFileBytes: 100_000 });
    const graph = buildGraphFromArtifacts({ repository: repo, commitSha: "abc1234", artifacts, backboard: fakeBackboard() });
    const context = buildScanContext({ repository: repo, graph, commitSha: "abc1234" });
    repository.replaceGraphRows({ workspaceId: "test", repositoryId: repo.id, scanId: scan.id, graph });
    repository.completeScan({ scanId: scan.id, commitSha: "abc1234", graph, context, artifacts, backboard: fakeBackboard() });
    const app = await buildApp({
      config: loadConfig({
        rootDir: tempDir,
        databaseUrl: `file:${path.join(tempDir, "atlas.db")}`,
        databasePath: path.join(tempDir, "atlas.db"),
        workspaceId: "test",
        backboardApiKey: "test",
      }),
      repository,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/scans/scan_fixture/handoff",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.commitSha).toBe("abc1234");
    expect(body.files.length).toBeGreaterThan(0);
    await app.close();
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("exports handoff map and sanitized snippets for completed scans", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-api-export-"));
    const fixtureDir = path.join(tempDir, "fixture");
    await fs.mkdir(path.join(fixtureDir, "src"), { recursive: true });
    await fs.writeFile(path.join(fixtureDir, "package.json"), JSON.stringify({ name: "@atlas/export-fixture", dependencies: { axios: "^1.0.0" } }, null, 2));
    await fs.writeFile(
      path.join(fixtureDir, "src", "client.ts"),
      `const apiKey = "${FAKE_STRIPE_TOKEN}"; axios.post("https://example.com", { apiKey });\n`,
    );
    const db = openDatabase(path.join(tempDir, "atlas.db"));
    migrate(db);
    const repository = new AtlasRepository(db);
    repository.ensureWorkspace("test");
    const repo = repository.upsertRepository({
      id: "repo_export",
      workspaceId: "test",
      owner: "atlas",
      name: "export-fixture",
      url: "https://github.com/atlas/export-fixture",
      cloneUrl: "https://github.com/atlas/export-fixture.git",
      packageName: "@atlas/export-fixture",
      lastCommitSha: "abc1234",
    });
    const scan = repository.createScan({ id: "scan_export", workspaceId: "test", repositoryId: repo.id, repoUrl: repo.url });
    const artifacts = await scanRepository(fixtureDir, { maxFiles: 100, maxFileBytes: 100_000 });
    const graph = buildGraphFromArtifacts({ repository: repo, commitSha: "abc1234", artifacts, backboard: fakeBackboard() });
    const context = buildScanContext({ repository: repo, graph, commitSha: "abc1234", backboard: { assistantId: "asst", threadId: "thread", runId: "run", memoryMode: "Auto", memoryOperationId: "mem", memoryStatus: { attempted: true, succeeded: true, operationId: "mem", factCount: 1 } } });
    repository.replaceGraphRows({ workspaceId: "test", repositoryId: repo.id, scanId: scan.id, graph });
    repository.completeScan({ scanId: scan.id, commitSha: "abc1234", graph, context, artifacts, backboard: fakeBackboard() });
    const app = await buildApp({
      config: loadConfig({
        rootDir: tempDir,
        databaseUrl: `file:${path.join(tempDir, "atlas.db")}`,
        databasePath: path.join(tempDir, "atlas.db"),
        workspaceId: "test",
        backboardApiKey: "test",
      }),
      repository,
    });

    const response = await app.inject({ method: "GET", url: "/api/scans/scan_export/export" });
    const body = JSON.parse(response.body);
    const serialized = JSON.stringify(body);

    expect(response.statusCode).toBe(200);
    expect(body.files.map((file: { path: string }) => file.path)).toContain("handoff/handoff-map.json");
    expect(body.files.map((file: { path: string }) => file.path)).toContain("backboard/backboard-record.json");
    expect(serialized).not.toContain(FAKE_STRIPE_TOKEN);
    await app.close();
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
