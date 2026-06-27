const BASE = 'http://localhost:3001';

export interface CalmCtx {
  node: {
    id: string; name: string; nodeType: string;
    description?: string; technology?: string;
    language?: string; port?: number; criticality?: string;
  };
  outbound: { targetName: string; protocol: string; criticality: string; description: string }[];
  inbound:  { sourceName: string; protocol: string }[];
}

export interface Commit {
  hash: string; shortHash: string; author: string;
  date: string; message: string; diff: string;
}

export interface Diagnosis {
  root_cause: string;
  file_path: string;
  fixed_content: string;
  explanation: string;
}

// ── Config ────────────────────────────────────────────────────────────────────
export async function getConfig(): Promise<Record<string, string | null>> {
  const r = await fetch(`${BASE}/config`);
  return (await r.json()).keys;
}

export async function saveConfig(updates: Record<string, string>): Promise<void> {
  await fetch(`${BASE}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

// ── Evidence ──────────────────────────────────────────────────────────────────
export async function fetchLogs(serviceId: string): Promise<{ available: boolean; content?: string; note?: string }> {
  const r = await fetch(`${BASE}/evidence/logs/${serviceId}`);
  return r.json();
}

export async function fetchCommits(serviceId: string): Promise<Commit[]> {
  const r = await fetch(`${BASE}/evidence/commits/${serviceId}`);
  return (await r.json()).commits;
}

// ── Sessions ──────────────────────────────────────────────────────────────────
export async function createSession(nodeId: string, nodeName: string, calmCtx: CalmCtx): Promise<{ id: string; commitCount: number; logsAvailable: boolean }> {
  const r = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId, nodeName, systemId: 'banking-system', calmCtx }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getSession(id: string) {
  const r = await fetch(`${BASE}/sessions/${id}`);
  return r.json();
}

export async function listSessions() {
  const r = await fetch(`${BASE}/sessions`);
  return (await r.json()).sessions as Array<{ id: string; node_name: string; status: string; created_at: string }>;
}

// ── Agent ─────────────────────────────────────────────────────────────────────
// Returns an EventSource-compatible stream — caller handles SSE events
export function streamDiagnosis(sessionId: string): EventSource {
  // POST via EventSource workaround: platform accepts GET too for streaming
  return new EventSource(`${BASE}/sessions/${sessionId}/diagnose-stream`);
}

// Trigger diagnosis via POST, then read the SSE stream
export async function diagnose(
  sessionId: string,
  onText: (t: string) => void,
  onDiagnosis: (d: Diagnosis) => void,
  onError: (e: string) => void,
): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/diagnose`, { method: 'POST' });
  if (!res.ok) { onError(await res.text()); return; }
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
          if (evt.type === 'text')      onText(evt.text);
          if (evt.type === 'diagnosis') onDiagnosis(evt.result);
          if (evt.type === 'error')     onError(evt.message);
        } catch {}
      }
    }
  }
}

export async function createPR(sessionId: string, diagnosis: Diagnosis): Promise<{ prUrl: string; branch: string }> {
  const r = await fetch(`${BASE}/sessions/${sessionId}/pr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filePath: diagnosis.file_path,
      fixedContent: diagnosis.fixed_content,
      rootCause: diagnosis.root_cause,
      explanation: diagnosis.explanation,
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
