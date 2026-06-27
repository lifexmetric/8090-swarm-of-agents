import type { GraphNode, GraphLink } from './calmParser';

const BASE = 'http://localhost:8010';

export interface CodeGraphNode {
  id: string;
  type: 'file' | 'function' | 'class';
  name: string;
  file?: string;
  path?: string;
  language?: string;
  line?: number;
  endLine?: number;
}

export interface CodeGraphEdge {
  source: string;
  target: string;
  type: 'contains' | 'calls' | 'imports';
  file?: string;
  line?: number;
}

export interface ServiceCodeGraph {
  service: string;
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
}

export interface RepoCodeGraph {
  services: Record<string, ServiceCodeGraph>;
  total_nodes: number;
  total_edges: number;
}

export interface RepoSummary {
  total_files: number;
  total_functions: number;
  total_classes: number;
  languages: Record<string, number>;
  services: Array<{
    name: string;
    path: string;
    marker: string;
    files: number;
    functions: number;
    classes: number;
  }>;
}

export interface ScanResult {
  nodes: GraphNode[];
  links: GraphLink[];
  flows: never[];
  meta: {
    repo: string;
    repo_id?: string;
    services_found: number;
    nodes: number;
    links: number;
  };
  summary?: RepoSummary;
  code_graph?: RepoCodeGraph;
}

export interface EmbedResult {
  repo_id: string;
  summary: RepoSummary;
  code_graph: RepoCodeGraph;
}

export async function scanRepo(
  repoUrl: string,
  anthropicApiKey: string,
  githubPat?: string,
): Promise<ScanResult> {
  const r = await fetch(`${BASE}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repo_url: repoUrl,
      anthropic_api_key: anthropicApiKey,
      github_pat: githubPat || undefined,
    }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(body.detail ?? body.error ?? 'Scan failed');
  }
  return r.json();
}

export async function scanRepoStream(
  repoUrl: string,
  anthropicApiKey: string,
  githubPat: string | undefined,
  onProgress: (step: string, message: string) => void,
  onResult: (result: ScanResult) => void,
  onError: (message: string) => void,
): Promise<void> {
  const res = await fetch(`${BASE}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repo_url: repoUrl,
      anthropic_api_key: anthropicApiKey,
      github_pat: githubPat || undefined,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    onError(body.detail ?? body.error ?? 'Scan failed');
    return;
  }
  if (!res.body) { onError('No response body'); return; }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === 'progress') onProgress(evt.step, evt.message);
          if (evt.type === 'result')   onResult(evt.data as ScanResult);
          if (evt.type === 'error')    onError(evt.message);
        } catch {}
      }
    }
  }
}

export async function embedRepo(
  repoUrl: string,
  githubPat?: string,
): Promise<EmbedResult> {
  const r = await fetch(`${BASE}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repo_url: repoUrl,
      github_pat: githubPat || undefined,
    }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(body.detail ?? body.error ?? 'Embed failed');
  }
  return r.json();
}

export async function getServiceCodeGraph(
  repoId: string,
  serviceName: string,
): Promise<ServiceCodeGraph> {
  const r = await fetch(`${BASE}/code-graph/${repoId}/${serviceName}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(body.detail ?? body.error ?? 'Code graph fetch failed');
  }
  return r.json();
}

export async function listRepos(): Promise<Array<{ repo_id: string; chunks: number }>> {
  const r = await fetch(`${BASE}/repos`);
  if (!r.ok) return [];
  const body = await r.json();
  return body.repos ?? [];
}
