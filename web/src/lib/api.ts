import type { Confidence, EdgeKind, GraphData, GraphLink, GraphNode, NodeKind } from "./data";

const API_URL = (process.env.NEXT_PUBLIC_ATLAS_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const API_TOKEN = process.env.NEXT_PUBLIC_ATLAS_API_AUTH_TOKEN;
export const DEFAULT_WORKSPACE_ID = process.env.NEXT_PUBLIC_ATLAS_WORKSPACE_ID ?? "local-dev";

const NODE_KINDS = new Set<NodeKind>(["service", "external", "database", "queue", "auth", "config"]);
const EDGE_KINDS = new Set<EdgeKind>(["sync", "async", "db", "package", "config", "auth", "webhook"]);
const CONFIDENCE = new Set<Confidence>(["confirmed", "inferred", "uncertain"]);

export type ScanStatus = "queued" | "running" | "completed" | "failed";

export interface ScanRecord {
  id: string;
  workspaceId: string;
  repositoryId: string;
  repoUrl: string;
  status: ScanStatus;
  error?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
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

  const res = await fetch(`${API_URL}${path}`, {
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
    })),
  };
}

export function createScan(repoUrl: string, workspaceId = DEFAULT_WORKSPACE_ID) {
  return request<ScanRecord>("/api/scans", {
    method: "POST",
    body: JSON.stringify({ repoUrl, workspaceId }),
  });
}

export function getScan(scanId: string) {
  return request<ScanRecord>(`/api/scans/${encodeURIComponent(scanId)}`);
}

export async function getScanEvents(scanId: string) {
  const result = await request<{ scanId: string; events: ScanEvent[] }>(
    `/api/scans/${encodeURIComponent(scanId)}/events`,
  );
  return result.events;
}

export async function getScanGraph(scanId: string) {
  const graph = await request<GraphData>(`/api/scans/${encodeURIComponent(scanId)}/graph`);
  return normalizeGraph(graph);
}

export function getScanExport(scanId: string) {
  return request<ScanExport>(`/api/scans/${encodeURIComponent(scanId)}/export`);
}
