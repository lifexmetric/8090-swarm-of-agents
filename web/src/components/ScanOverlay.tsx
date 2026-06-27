"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getScan, getScanEvents, type ScanEvent, type ScanStatus } from "@/lib/api";

const EVENT_COLOR: Record<ScanEvent["type"], string> = {
  queued: "var(--color-faint)",
  clone: "var(--color-node-infra)",
  scan: "var(--color-node-infra)",
  backboard: "var(--color-accent)",
  persist: "var(--color-warn)",
  complete: "var(--color-ok)",
  error: "var(--color-err)",
};

const STATUS_PROGRESS: Record<ScanStatus, number> = {
  queued: 8,
  running: 58,
  completed: 100,
  failed: 100,
};

export function ScanOverlay({ repo, scanId }: { repo: string; scanId: string }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<ScanStatus>("queued");
  const [events, setEvents] = React.useState<ScanEvent[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const feedRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const [scan, nextEvents] = await Promise.all([
          getScan(scanId),
          getScanEvents(scanId),
        ]);
        if (cancelled) return;
        setStatus(scan.status);
        setEvents(nextEvents);
        setError(scan.error ?? null);

        if (scan.status === "completed") {
          timeout = setTimeout(() => {
            router.push(
              `/explore?scanId=${encodeURIComponent(scanId)}&view=detail&repo=${encodeURIComponent(repo)}`,
            );
          }, 700);
          return;
        }

        if (scan.status === "failed") {
          setError(scan.error ?? "Scan failed.");
          return;
        }

        timeout = setTimeout(poll, 900);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to read scan status.");
        timeout = setTimeout(poll, 1600);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [repo, router, scanId]);

  React.useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  const eventProgress = Math.min(95, 8 + events.length * 12);
  const progress = status === "running" ? Math.max(STATUS_PROGRESS.running, eventProgress) : STATUS_PROGRESS[status];
  const finished = status === "completed";
  const failed = status === "failed";
  const feed = events.length > 0
    ? events
    : [{ scanId, type: "queued" as const, message: "Queued repository scan", createdAt: new Date().toISOString() }];

  return (
    <div
      data-testid="scan-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm"
      style={{ backgroundColor: "var(--color-overlay)" }}
    >
      <div className="w-full max-w-xl animate-fade-in rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className={finished ? "text-ok" : failed ? "text-err" : "text-faint"}>
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                {finished ? (
                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207z" clipRule="evenodd" />
                ) : failed ? (
                  <path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM5.72 5.72a.75.75 0 0 1 1.06 0L8 6.94l1.22-1.22a.75.75 0 1 1 1.06 1.06L9.06 8l1.22 1.22a.75.75 0 1 1-1.06 1.06L8 9.06l-1.22 1.22a.75.75 0 1 1-1.06-1.06L6.94 8 5.72 6.78a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                ) : (
                  <path d="M8 1.5a6.5 6.5 0 0 0-6.5 6.5.75.75 0 0 0 1.5 0A5 5 0 1 1 8 13a.75.75 0 0 0 0 1.5A6.5 6.5 0 0 0 8 1.5Z" />
                )}
              </svg>
            </span>
            <span className="font-mono text-[13px] text-muted">
              {finished ? "Scan complete" : failed ? "Scan failed" : "Scanning repository"}
            </span>
          </div>
          <span className="font-mono text-[12px] tabular-nums text-faint">{progress}%</span>
        </div>

        <div className="border-b border-line px-4 py-3">
          <p className="truncate font-mono text-[12px] text-ink">{repo}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-2">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div
          ref={feedRef}
          className="scroll-thin h-52 overflow-y-auto bg-bg-2 p-4 font-mono text-[12px]"
        >
          {feed.map((line, i) => (
            <div key={line.id ?? `${line.type}-${i}`} className="mb-1.5 flex items-start gap-2.5">
              <span className="mt-px shrink-0" style={{ color: EVENT_COLOR[line.type] }}>›</span>
              <span style={{ color: line.type === "queued" ? "var(--color-muted)" : EVENT_COLOR[line.type] }}>
                {line.message}
              </span>
            </div>
          ))}
          {error && (
            <div className="mt-2 flex items-start gap-2.5 text-err">
              <span className="mt-px shrink-0">!</span>
              <span>{error}</span>
            </div>
          )}
          {!finished && !failed && (
            <span className="inline-block h-3.5 w-1.5 animate-blink bg-faint align-middle" />
          )}
        </div>

        <div className="border-t border-line px-4 py-2.5 text-[12px] text-faint">
          {finished ? "Opening system map..." : failed ? "Check backend logs and try again" : "Building node and edge model"}
        </div>
      </div>
    </div>
  );
}
