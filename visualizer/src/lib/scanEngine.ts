import type { GraphNode, GraphLink } from './calmParser';

const BASE = 'http://localhost:8010';

export interface ScanResult {
  nodes: GraphNode[];
  links: GraphLink[];
  flows: never[];
  meta: {
    repo: string;
    services_found: number;
    nodes: number;
    links: number;
  };
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
