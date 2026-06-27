"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SCAN_FEED } from "@/lib/data";

const TONE_COLOR: Record<string, string> = {
  info: "#5c5e6a",
  find: "#34d399",
  warn: "#f59e0b",
};

export function ScanOverlay({ repo }: { repo: string }) {
  const router = useRouter();
  const [visible, setVisible] = React.useState(0);
  const feedRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (visible >= SCAN_FEED.length) {
      const done = setTimeout(() => router.push("/explore"), 700);
      return () => clearTimeout(done);
    }
    const t = setTimeout(() => setVisible((v) => v + 1), 380);
    return () => clearTimeout(t);
  }, [visible, router]);

  React.useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [visible]);

  const progress = Math.min(100, Math.round((visible / SCAN_FEED.length) * 100));
  const finished = visible >= SCAN_FEED.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c0d10]/90 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl border border-[#2a2c36] bg-[#181a22] rounded-xl animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2a2c36] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className={finished ? "text-[#34d399]" : "text-[#5c5e6a]"}>
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                {finished ? (
                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207z" clipRule="evenodd" />
                ) : (
                  <path fillRule="evenodd" d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm.75 4.75a.75.75 0 0 0-1.5 0v3.5c0 .199.079.390.22.530l2.25 2.25a.75.75 0 1 0 1.06-1.06L8.75 8.69V5.75z" clipRule="evenodd" />
                )}
              </svg>
            </span>
            <span className="font-mono text-[13px] text-[#8b8d98]">
              {finished ? "Scan complete" : "Scanning repository"}
            </span>
          </div>
          <span className="font-mono text-[12px] tabular-nums text-[#5c5e6a]">{progress}%</span>
        </div>

        {/* Repo */}
        <div className="border-b border-[#2a2c36] px-4 py-2">
          <span className="font-mono text-[12px] text-[#5c5e6a]">{repo}</span>
        </div>

        {/* Progress bar */}
        <div className="h-px bg-[#2a2c36]">
          <div
            className="h-full bg-[#818cf8] transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Feed */}
        <div
          ref={feedRef}
          className="scroll-thin h-52 overflow-y-auto bg-[#12131a] p-4 font-mono text-[12px]"
        >
          {SCAN_FEED.slice(0, visible).map((line, i) => (
            <div key={i} className="mb-1.5 flex items-start gap-2.5">
              <span className="mt-px shrink-0" style={{ color: TONE_COLOR[line.tone] }}>›</span>
              <span style={{ color: TONE_COLOR[line.tone] === "#5c5e6a" ? "#8b8d98" : TONE_COLOR[line.tone] }}>
                {line.text}
              </span>
            </div>
          ))}
          {!finished && (
            <span className="inline-block h-3.5 w-1.5 bg-[#5c5e6a] align-middle animate-blink" />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#2a2c36] px-4 py-2.5 text-[12px] text-[#5c5e6a]">
          {finished ? "Opening system map…" : "Building node and edge model"}
        </div>
      </div>
    </div>
  );
}
