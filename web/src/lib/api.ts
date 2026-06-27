import type { GraphData } from "./data";

export const ATLAS_API_URL =
  process.env.NEXT_PUBLIC_ATLAS_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:3001";

export const ATLAS_WORKSPACE_ID =
  process.env.NEXT_PUBLIC_ATLAS_WORKSPACE_ID?.trim() || "default";

export interface ScanRecord {
  id: string;
  workspaceId: string;
  repositoryId: string;
  repoUrl: string;
  commitSha?: string | null;
  status: "queued" | "running" | "completed" | "failed";
  error?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  backboardAssistantId?: string | null;
  backboardThreadId?: string | null;
  backboardRunId?: string | null;
}

export interface RepositoryRecord {
  id: string;
  workspaceId: string;
  owner: string;
  name: string;
  url: string;
  cloneUrl: string;
  packageName?: string | null;
  lastCommitSha?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceGraph extends GraphData {
  workspaceId: string;
  repositories: RepositoryRecord[];
  crossRepoConnections: Array<{
    id: string;
    sourceRepositoryId: string;
    targetRepositoryId: string;
    sourcePackage: string;
    targetPackage: string;
    summary: string;
  }>;
}

export interface ScanEvent {
  id?: number;
  scanId: string;
  type: "queued" | "clone" | "scan" | "backboard" | "persist" | "complete" | "error";
  message: string;
  createdAt: string;
}

export interface ExportResponse {
  scanId: string;
  files: Array<{ path: string; markdown: string }>;
  combinedMarkdown: string;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${ATLAS_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.text();
  const parsed = body ? JSON.parse(body) : {};
  if (!response.ok) {
    throw new Error(parsed?.message ?? `Atlas API returned ${response.status}`);
  }
  return parsed as T;
}

export function createScan(repoUrl: string): Promise<ScanRecord> {
  return apiJson<ScanRecord>("/api/scans", {
    method: "POST",
    body: JSON.stringify({ repoUrl }),
  });
}

export function getScan(scanId: string): Promise<ScanRecord> {
  return apiJson<ScanRecord>(`/api/scans/${encodeURIComponent(scanId)}`);
}

export function getScanEvents(scanId: string): Promise<{ scanId: string; events: ScanEvent[] }> {
  return apiJson<{ scanId: string; events: ScanEvent[] }>(`/api/scans/${encodeURIComponent(scanId)}/events`);
}

export function getScanGraph(scanId: string): Promise<GraphData> {
  return apiJson<GraphData>(`/api/scans/${encodeURIComponent(scanId)}/graph`);
}

export function getWorkspaceGraph(workspaceId = ATLAS_WORKSPACE_ID): Promise<WorkspaceGraph> {
  return apiJson<WorkspaceGraph>(`/api/workspaces/${encodeURIComponent(workspaceId)}/graph`);
}

export function getScanExport(scanId: string): Promise<ExportResponse> {
  return apiJson<ExportResponse>(`/api/scans/${encodeURIComponent(scanId)}/export`);
}
