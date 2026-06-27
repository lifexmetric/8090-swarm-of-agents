import { loadConfig } from "../config.js";
import { AtlasRepository, openDatabase } from "../db/database.js";
import type { ScanRecord, WorkspaceGraph } from "../types/domain.js";

const repos = [
  "https://github.com/fastify/fastify-plugin",
  "https://github.com/fastify/fastify-autoload",
];

function argValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status} ${JSON.stringify(parsed)}`);
  }
  return parsed as T;
}

async function waitForScan(baseUrl: string, scanId: string): Promise<ScanRecord> {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const scan = await request<ScanRecord>(baseUrl, `/api/scans/${scanId}`);
    if (scan.status === "completed") return scan;
    if (scan.status === "failed") throw new Error(`Scan ${scanId} failed: ${scan.error}`);
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error(`Timed out waiting for scan ${scanId}`);
}

const baseUrl = argValue("--base", process.env.ATLAS_API_BASE ?? "http://127.0.0.1:3001");
const workspaceId = argValue("--workspace", process.env.ATLAS_WORKSPACE_ID ?? "default");

const health = await request<{ backboardConfigured: boolean }>(baseUrl, "/api/health");
if (!health.backboardConfigured) {
  throw new Error("Backend reports Backboard is not configured. Set BACKBOARD_API_KEY before real verification.");
}

const scans: ScanRecord[] = [];
for (const repoUrl of repos) {
  const queued = await request<ScanRecord>(baseUrl, "/api/scans", {
    method: "POST",
    body: JSON.stringify({ repoUrl, workspaceId }),
  });
  console.log(`queued ${repoUrl}: ${queued.id}`);
  const scan = await waitForScan(baseUrl, queued.id);
  console.log(`completed ${repoUrl}: ${scan.id} @ ${scan.commitSha}`);
  scans.push(scan);
}

const graph = await request<WorkspaceGraph>(baseUrl, `/api/workspaces/${workspaceId}/graph`);
console.log(`workspace graph: ${graph.nodes.length} nodes, ${graph.links.length} edges, ${graph.repositories.length} repositories`);
if (graph.crossRepoConnections.length > 0) {
  for (const connection of graph.crossRepoConnections) {
    console.log(`cross-repo: ${connection.summary}`);
  }
} else {
  console.log("cross-repo: no supported connection found");
}

const config = loadConfig();
const db = openDatabase(config.databasePath);
const repository = new AtlasRepository(db);
console.log(
  `sqlite counts: repositories=${repository.countTable("repositories")} scans=${repository.countTable("scans")} nodes=${repository.countTable("nodes")} edges=${repository.countTable("edges")} evidence=${repository.countTable("evidence")} backboard_records=${repository.countTable("backboard_records")}`,
);
db.close();

if (scans.some((scan) => !scan.backboardAssistantId || !scan.backboardThreadId)) {
  throw new Error("Expected Backboard assistant/thread ids on completed scans");
}
