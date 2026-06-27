export type HealthStatus = 'up' | 'down' | 'unknown';

export interface ServiceHealth {
  status: HealthStatus;
  latencyMs: number;
  httpStatus: number;
}

export type HealthMap = Map<string, ServiceHealth>;

export function startHealthPoller(
  onUpdate: (map: HealthMap) => void,
  intervalMs = 5000,
): () => void {
  let cancelled = false;

  const poll = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/health-summary');
      if (!res.ok) return;
      const data = await res.json();
      const map: HealthMap = new Map();
      for (const [nodeId, info] of Object.entries(data.services)) {
        const s = info as { status: string; latencyMs: number; httpStatus: number };
        map.set(nodeId, {
          status: s.status === 'up' ? 'up' : 'down',
          latencyMs: s.latencyMs,
          httpStatus: s.httpStatus,
        });
      }
      if (!cancelled) onUpdate(map);
    } catch {
      // gateway unreachable — leave previous state intact
    }
  };

  poll();
  const id = setInterval(poll, intervalMs);
  return () => {
    cancelled = true;
    clearInterval(id);
  };
}
