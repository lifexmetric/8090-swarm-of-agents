import type { Confidence, EdgeKind, Evidence, GraphData, GraphLink, GraphNode, NodeKind } from "./data";

export const ATLAS_API_URL = (process.env.NEXT_PUBLIC_ATLAS_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const API_TOKEN = process.env.NEXT_PUBLIC_ATLAS_API_AUTH_TOKEN?.trim();
export const DEFAULT_WORKSPACE_ID = process.env.NEXT_PUBLIC_ATLAS_WORKSPACE_ID?.trim() || "local-dev";
export const ATLAS_WORKSPACE_ID = DEFAULT_WORKSPACE_ID;

const NODE_KINDS = new Set<NodeKind>(["service", "external", "database", "queue", "auth", "config"]);
const EDGE_KINDS = new Set<EdgeKind>(["sync", "async", "db", "package", "config", "auth", "webhook"]);
const CONFIDENCE = new Set<Confidence>(["confirmed", "inferred", "uncertain"]);

export type ScanStatus = "queued" | "running" | "completed" | "failed";

export interface ScanRecord {
  id: string;
  workspaceId: string;
  repositoryId: string;
  repoUrl: string;
  commitSha?: string | null;
  status: ScanStatus;
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

export interface ScanExportFile {
  path: string;
  markdown: string;
}

export interface ScanExport {
  scanId: string;
  files: ScanExportFile[];
  combinedMarkdown: string;
}

export type ExportResponse = ScanExport;

export interface ChatCitation {
  id: string;
  stableId?: string;
  label: string;
  subjectType: "node" | "edge" | "repo" | "workspace";
  subjectId?: string;
  repositoryId?: string;
  scanId?: string;
  commitSha?: string | null;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  snippet?: string;
  detector?: string;
  confidenceReason?: string;
  confidence?: Confidence;
}

export interface ChatSession {
  id: string;
  workspaceId: string;
  title: string;
  assistantId: string;
  threadId?: string | null;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  citations: ChatCitation[];
  backboardRunId?: string | null;
  backboardMessageId?: string | null;
  memoryOperationId?: string | null;
  memoryError?: string | null;
  createdAt: string;
}

export class AtlasApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AtlasApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (API_TOKEN) headers.set("Authorization", `Bearer ${API_TOKEN}`);

  const res = await fetch(`${ATLAS_API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      // Keep the HTTP status text when the API does not return JSON.
    }
    throw new AtlasApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}

function confidence(value: unknown): Confidence {
  return typeof value === "string" && CONFIDENCE.has(value as Confidence)
    ? (value as Confidence)
    : "inferred";
}

function nodeKind(value: unknown): NodeKind {
  return typeof value === "string" && NODE_KINDS.has(value as NodeKind)
    ? (value as NodeKind)
    : "service";
}

function edgeKind(value: unknown): EdgeKind {
  return typeof value === "string" && EDGE_KINDS.has(value as EdgeKind)
    ? (value as EdgeKind)
    : "sync";
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function evidence(value: unknown): Evidence[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item): Evidence => ({
      id: typeof item.id === "string" ? item.id : undefined,
      filePath: text(item.filePath, "unknown"),
      lineStart: Number.isFinite(item.lineStart) ? Number(item.lineStart) : 1,
      lineEnd: Number.isFinite(item.lineEnd) ? Number(item.lineEnd) : Number(item.lineStart) || 1,
      snippet: typeof item.snippet === "string" ? item.snippet : "",
      detector: text(item.detector, "scanner"),
      confidenceReason: typeof item.confidenceReason === "string" ? item.confidenceReason : "",
    }));
  return items.length > 0 ? items : undefined;
}

export function normalizeGraph(graph: GraphData): GraphData {
  return {
    nodes: graph.nodes.map((node): GraphNode => ({
      ...node,
      id: text(node.id, "unknown-node"),
      label: text(node.label, node.id),
      kind: nodeKind(node.kind),
      domain: text(node.domain, "Scanned repo"),
      whatItIs: text(node.whatItIs, "Detected from repository scan evidence."),
      whyItExists: text(node.whyItExists, "Part of the scanned repository structure."),
      owns: Array.isArray(node.owns) ? node.owns : [],
      confidence: confidence(node.confidence),
      risks: Array.isArray(node.risks) ? node.risks : [],
      evidence: evidence((node as { evidence?: unknown }).evidence),
    })),
    links: graph.links.map((link): GraphLink => ({
      ...link,
      id: text(link.id, `${link.source}-${link.target}`),
      source: text(link.source, ""),
      target: text(link.target, ""),
      kind: edgeKind(link.kind),
      criticality: Number.isFinite(link.criticality) ? link.criticality : 3,
      summary: text(link.summary, "Detected relationship from repository scan evidence."),
      code: text(link.code, "// No snippet available for this relationship yet."),
      codePath: text(link.codePath, "No code path available"),
      contract: text(link.contract, "No contract inferred yet."),
      failure: text(link.failure, "No failure mode inferred yet."),
      risks: Array.isArray(link.risks) ? link.risks : [],
      confidence: confidence(link.confidence),
      evidence: evidence((link as { evidence?: unknown }).evidence),
    })),
  };
}

export function createScan(repoUrl: string, workspaceId = DEFAULT_WORKSPACE_ID): Promise<ScanRecord> {
  return request<ScanRecord>("/api/scans", {
    method: "POST",
    body: JSON.stringify({ repoUrl, workspaceId }),
  });
}

export function getScan(scanId: string): Promise<ScanRecord> {
  return request<ScanRecord>(`/api/scans/${encodeURIComponent(scanId)}`);
}

export async function getScanEvents(scanId: string): Promise<ScanEvent[]> {
  const result = await request<{ scanId: string; events: ScanEvent[] }>(
    `/api/scans/${encodeURIComponent(scanId)}/events`,
  );
  return result.events;
}

export async function getScanGraph(scanId: string): Promise<GraphData> {
  const graph = await request<GraphData>(`/api/scans/${encodeURIComponent(scanId)}/graph`);
  return normalizeGraph(graph);
}

export async function getWorkspaceGraph(workspaceId = ATLAS_WORKSPACE_ID): Promise<WorkspaceGraph> {
  const graph = await request<WorkspaceGraph>(`/api/workspaces/${encodeURIComponent(workspaceId)}/graph`);
  return {
    ...graph,
    ...normalizeGraph(graph),
    workspaceId: graph.workspaceId,
    repositories: Array.isArray(graph.repositories) ? graph.repositories : [],
    crossRepoConnections: Array.isArray(graph.crossRepoConnections) ? graph.crossRepoConnections : [],
  };
}

export function getScanExport(scanId: string): Promise<ScanExport> {
  return request<ScanExport>(`/api/scans/${encodeURIComponent(scanId)}/export`);
}

export function createChatSession(input: {
  title?: string;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
}): Promise<ChatSession> {
  return request<ChatSession>("/api/chat/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getChatMessages(sessionId: string): Promise<{ sessionId: string; messages: ChatMessage[] }> {
  return request<{ sessionId: string; messages: ChatMessage[] }>(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
  );
}

export function sendChatMessage(
  sessionId: string,
  input: { content: string; nodeId?: string | null; edgeId?: string | null; scanId?: string | null },
): Promise<{ session: ChatSession; userMessage: ChatMessage; assistantMessage: ChatMessage }> {
  return request<{ session: ChatSession; userMessage: ChatMessage; assistantMessage: ChatMessage }>(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}
