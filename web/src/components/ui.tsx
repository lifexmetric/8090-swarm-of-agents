import * as React from "react";
import Link from "next/link";
import { CONFIDENCE_META, type Confidence } from "@/lib/data";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Semi-transparent tint for CSS-var or hex colors */
export function colorAlpha(color: string, pct: number) {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

// ── Logo ────────────────────────────────────────────────────────────────────
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("group inline-flex items-center gap-2.5", className)}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <circle cx="12" cy="5"  r="2" fill="var(--color-node-service)" />
        <circle cx="5"  cy="17" r="2" fill="var(--color-accent)" />
        <circle cx="19" cy="17" r="2" fill="var(--color-node-external)" />
        <circle cx="12" cy="12" r="1.5" fill="var(--color-faint)" />
        <path d="M12 12 L12 5 M12 12 L5 17 M12 12 L19 17"
          stroke="var(--color-line-2)" strokeWidth="1.2" />
      </svg>
      <span
        className="text-[15px] font-semibold tracking-tight"
        style={{ color: "var(--color-ink)" }}
      >
        Atlas
      </span>
    </Link>
  );
}

// ── GitHub mark ─────────────────────────────────────────────────────────────
export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.37.5 0 5.78 0 12.292c0 5.211 3.438 9.63 8.205 11.188.6.111.82-.254.82-.567 0-.28-.01-1.022-.015-2.005-3.338.711-4.042-1.582-4.042-1.582-.546-1.361-1.335-1.725-1.335-1.725-1.087-.731.084-.716.084-.716 1.205.082 1.838 1.215 1.838 1.215 1.07 1.803 2.809 1.282 3.495.981.108-.763.417-1.282.76-1.577-2.665-.295-5.466-1.309-5.466-5.827 0-1.287.465-2.339 1.235-3.164-.135-.297-.54-1.497.105-3.121 0 0 1.005-.316 3.3 1.209.96-.262 1.98-.392 3-.398 1.02.006 2.04.136 3 .398 2.28-1.525 3.285-1.209 3.285-1.209.645 1.624.24 2.824.12 3.121.765.825 1.23 1.877 1.23 3.164 0 4.53-2.805 5.527-5.475 5.817.42.354.81 1.077.81 2.171 0 1.568-.015 2.832-.015 3.218 0 .315.21.683.825.566C20.565 21.917 24 17.502 24 12.292 24 5.78 18.627.5 12 .5z" />
    </svg>
  );
}

// ── Button ──────────────────────────────────────────────────────────────────
export function Btn({
  children,
  variant = "primary",
  size = "md",
  onClick,
  type = "button",
  className,
  disabled,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  disabled?: boolean;
}) {
  const base =
    "inline-flex cursor-pointer items-center gap-2 font-medium transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-40 disabled:pointer-events-none";
  const sizes = {
    sm: "px-3 py-1.5 text-[13px] rounded-md",
    md: "px-4 py-2 text-sm rounded-lg",
  };
  const variants = {
    primary:   "bg-accent text-white hover:opacity-90",
    secondary: "border border-line-2 text-muted hover:border-faint hover:text-ink bg-transparent",
    ghost:     "text-muted hover:text-ink bg-transparent",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(base, sizes[size], variants[variant], className)}
    >
      {children}
    </button>
  );
}

// ── Confidence badge ─────────────────────────────────────────────────────────
export function ConfidenceBadge({ value }: { value: Confidence }) {
  const meta = CONFIDENCE_META[value];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide"
      style={{
        color: meta.color,
        borderColor: colorAlpha(meta.color, 27),
        backgroundColor: colorAlpha(meta.color, 7),
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

// ── Pill / tag ───────────────────────────────────────────────────────────────
export function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide"
      style={{ color, borderColor: colorAlpha(color, 27), backgroundColor: colorAlpha(color, 6) }}
    >
      {children}
    </span>
  );
}

// ── Section label ────────────────────────────────────────────────────────────
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
      {children}
    </h4>
  );
}

// ── Risk row ─────────────────────────────────────────────────────────────────
export function RiskRow({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-muted">
      <svg viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l5.57 10.433c.62 1.16-.162 2.52-1.544 2.52H2.43c-1.382 0-2.164-1.36-1.544-2.52zM8 5a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 8 5zm0 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" clipRule="evenodd" />
      </svg>
      <span>{text}</span>
    </li>
  );
}

// ── Code block ───────────────────────────────────────────────────────────────
export function CodeBlock({ code, caption }: { code: string; caption?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-code-bg">
      {caption && (
        <div className="border-b border-line px-3 py-1.5 font-mono text-[11px] text-faint">
          {caption}
        </div>
      )}
      <pre className="scroll-thin overflow-x-auto p-4 text-[12.5px] leading-relaxed">
        <code className="font-mono text-code">{code}</code>
      </pre>
    </div>
  );
}
