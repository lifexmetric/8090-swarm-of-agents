import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { AtlasRepository, migrate, openDatabase, type SqliteDatabase } from "../src/db/database.js";
import { buildWorkspaceGraph } from "../src/graph/workspace.js";
import { buildHandoffMap, buildScanContext } from "../src/graph/context.js";
import { buildGraphFromArtifacts } from "../src/graph/normalize.js";
import { parseGitHubRepo, repoUrlSchema } from "../src/github/url.js";
import { scanRepository } from "../src/scanner/scanner.js";
import { buildApp } from "../src/server/app.js";
import type { BackboardSynthesis, GraphData, RepositoryRecord } from "../src/types/domain.js";

const fixtureRoot = path.resolve("tests/fixtures/sample-js");

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
    expect(handoff.files.flatMap((file) => file.nodes).every((node) => node.confidence && node.detector)).toBe(true);
    expect(handoff.files.flatMap((file) => file.edges).every((edge) => edge.confidence && edge.detector)).toBe(true);
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
        { id: "app-root", label: "atlas/app", kind: "service", domain: "Repository", whatItIs: "app", whyItExists: "test", owns: [], confidence: "confirmed", risks: [], repositoryId: sourceRepo.id, evidence: [{ filePath: "package.json", lineStart: 1, lineEnd: 1, snippet: "{}", detector: "test", confidenceReason: "test" }] },
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
          evidence: [{ filePath: "package.json", lineStart: 4, lineEnd: 4, snippet: "\"fastify-plugin\": \"^5.0.0\"", detector: "package-json-dependency", confidenceReason: "test" }],
        },
      ],
    };
    const graphB: GraphData = {
      nodes: [
        { id: "plugin-root", label: "fastify/fastify-plugin", kind: "service", domain: "Repository", whatItIs: "plugin", whyItExists: "test", owns: [], confidence: "confirmed", risks: [], repositoryId: packageRepo.id, evidence: [{ filePath: "package.json", lineStart: 1, lineEnd: 1, snippet: "{}", detector: "test", confidenceReason: "test" }] },
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
    expect(workspace.links.some((link) => link.contract.includes("Cross-repo package relationship"))).toBe(true);
  });
});

describe("API route schemas", () => {
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
});
