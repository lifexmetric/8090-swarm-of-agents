"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getScan, getScanEvents, type ScanEvent } from "@/lib/api";
import { SCAN_FEED } from "@/lib/data";

const TONE_COLOR: Record<string, string> = {
  info: "#555",
  find: "#22c55e",
  warn: "#f59e0b",
};

function toneForEvent(event: ScanEvent): "info" | "find" | "warn" {
  if (event.type === "error") return "warn";
  if (event.type === "complete" || event.type === "persist") return "find";
  return "info";
}

export function ScanOverlay({ repo, scanId }: { repo: string; scanId?: string | null }) {
  const router = useRouter();
  const [visible, setVisible] = React.useState(0);
  const [events, setEvents] = React.useState<ScanEvent[]>([]);
  const [status, setStatus] = React.useState<"mock" | "queued" | "running" | "completed" | "failed">(
    scanId ? "queued" : "mock",
  );
  const [error, setError] = React.useState<string | null>(null);
  const feedRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scanId) return;
    if (visible >= SCAN_FEED.length) {
      const done = setTimeout(() => router.push("/explore"), 700);
      return () => clearTimeout(done);
    }
    const t = setTimeout(() => setVisible((v) => v + 1), 380);
    return () => clearTimeout(t);
  }, [visible, router, scanId]);

  React.useEffect(() => {
    if (!scanId) return;
    let cancelled = false;

    async function poll() {
      try {
        const [scan, eventResponse] = await Promise.all([getScan(scanId!), getScanEvents(scanId!)]);
        if (cancelled) return;
        setStatus(scan.status);
        setEvents(eventResponse.events);
        if (scan.status === "completed") {
          setTimeout(() => router.push(`/explore?scanId=${encodeURIComponent(scanId!)}`), 700);
          return;
        }
        if (scan.status === "failed") {
          setError(scan.error ?? "Scan failed");
          return;
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("failed");
          setError(err instanceof Error ? err.message : "Unable to reach Atlas API");
        }
        return;
      }
      setTimeout(poll, 1200);
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [router, scanId]);

  React.useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [visible]);

  const usingBackend = Boolean(scanId);
  const feed = usingBackend
    ? events.map((event) => ({ text: event.message, tone: toneForEvent(event) }))
    : SCAN_FEED.slice(0, visible);
  const progress = usingBackend
    ? status === "completed"
      ? 100
      : Math.min(95, Math.max(8, events.length * 12))
    : Math.min(100, Math.round((visible / SCAN_FEED.length) * 100));
  const finished = usingBackend ? status === "completed" : visible >= SCAN_FEED.length;
  const failed = status === "failed";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl border border-[#2a2a2a] bg-[#111] animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2a2a2a] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className={finished ? "text-[#22c55e]" : "text-[#555]"}>
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                {finished ? (
                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207z" clipRule="evenodd" />
                ) : (
                  <path fillRule="evenodd" d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm.75 4.75a.75.75 0 0 0-1.5 0v3.5c0 .199.079.390.22.530l2.25 2.25a.75.75 0 1 0 1.06-1.06L8.75 8.69V5.75z" clipRule="evenodd" />
                )}
              </svg>
            </span>
            <span className="font-mono text-[13px] text-[#888]">
              {failed ? "Scan failed" : finished ? "Scan complete" : "Scanning repository"}
            </span>
          </div>
          <span className="font-mono text-[12px] tabular-nums text-[#555]">{progress}%</span>
        </div>

        {/* Repo */}
        <div className="border-b border-[#2a2a2a] px-4 py-2">
          <span className="font-mono text-[12px] text-[#555]">{repo}</span>
        </div>

        {/* Progress bar */}
        <div className="h-px bg-[#2a2a2a]">
          <div
            className="h-full bg-[#3b82f6] transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Feed */}
        <div
          ref={feedRef}
          className="scroll-thin h-52 overflow-y-auto bg-[#0a0a0a] p-4 font-mono text-[12px]"
        >
          {feed.map((line, i) => (
            <div key={i} className="mb-1.5 flex items-start gap-2.5">
              <span className="mt-px shrink-0" style={{ color: TONE_COLOR[line.tone] }}>›</span>
              <span style={{ color: TONE_COLOR[line.tone] === "#555" ? "#888" : TONE_COLOR[line.tone] }}>
                {line.text}
              </span>
            </div>
          ))}
          {error && (
            <div className="mb-1.5 flex items-start gap-2.5">
              <span className="mt-px shrink-0 text-[#f59e0b]">›</span>
              <span className="text-[#f59e0b]">{error}</span>
            </div>
          )}
          {!finished && !failed && (
            <span className="inline-block h-3.5 w-1.5 bg-[#555] align-middle animate-blink" />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#2a2a2a] px-4 py-2.5 text-[12px] text-[#555]">
          {failed ? "Check backend scan events for details" : finished ? "Opening system map…" : "Building node and edge model"}
        </div>
      </div>
    </div>
  );
}
