"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Share2,
  ShieldAlert,
  FileCode2,
  Boxes,
  GitBranch,
  Workflow,
  BarChart2,
} from "lucide-react";
import { Logo, GithubMark } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ScanOverlay } from "@/components/ScanOverlay";
import { createScan } from "@/lib/api";

const SAMPLES = ["fastify/fastify-plugin", "fastify/fastify-autoload", "stripe/stripe-node"];

const FEATURES = [
  {
    icon: Boxes,
    title: "See the whole system",
    body: "Every service, queue, database, and external API rendered as a navigable graph — clustered by domain, not file tree.",
  },
  {
    icon: Share2,
    title: "Connections over nodes",
    body: "Click any edge: exact code location, request/response contract, failure behavior, and where the real risk lives.",
  },
  {
    icon: ShieldAlert,
    title: "Confidence, not assumptions",
    body: "Every node and link tagged confirmed, inferred, or uncertain. You never walk away with false certainty.",
  },
  {
    icon: FileCode2,
    title: "Agent-ready context",
    body: "One markdown file per node and link — a structured package your agents can operate on without guessing.",
  },
];

const SCAN_STEPS = [
  {
    icon: GitBranch,
    step: "01",
    title: "Parse",
    body: "Scans import graphs, module boundaries, and directory conventions. Groups internal services into domains and maps what each one owns.",
  },
  {
    icon: Workflow,
    step: "02",
    title: "Connect",
    body: "Traces API calls, queue publish/consume pairs, webhook callbacks, auth flows, and shared config references to draw every edge.",
  },
  {
    icon: BarChart2,
    step: "03",
    title: "Score",
    body: "Tags each node and link as confirmed, inferred, or uncertain. Flags coupling density, missing circuit breakers, and blast radius if a service changes.",
  },
];

function FeatureList() {
  const [hovered, setHovered] = React.useState<number | null>(null);

  return (
    <div>
      {FEATURES.map((f, i) => (
        <div
          key={f.title}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          className="flex cursor-default items-start gap-8 border-l-2 py-7 pl-5 transition-colors duration-200"
          style={{
            borderLeftColor:
              hovered === i ? "var(--color-accent)" : "transparent",
            borderBottom:
              i < FEATURES.length - 1
                ? "1px solid var(--color-line)"
                : "none",
          }}
        >
          {/* Index */}
          <span
            className="w-8 shrink-0 pt-px font-mono text-[22px] font-semibold leading-none transition-colors duration-200"
            style={{
              color:
                hovered === i ? "var(--color-accent)" : "var(--color-line-2)",
            }}
          >
            {String(i + 1).padStart(2, "0")}
          </span>

          {/* Content */}
          <div className="flex-1">
            <h3
              className="mb-2 text-[16px] font-semibold tracking-tight transition-colors duration-200"
              style={{ color: "var(--color-ink)" }}
            >
              {f.title}
            </h3>
            <p
              className="max-w-lg text-sm leading-relaxed"
              style={{ color: "var(--color-muted)" }}
            >
              {f.body}
            </p>
          </div>

          {/* Icon */}
          <f.icon
            className="mt-0.5 h-4 w-4 shrink-0 transition-colors duration-200"
            style={{
              color:
                hovered === i ? "var(--color-accent)" : "var(--color-faint)",
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default function LandingPage() {
  const [repo, setRepo] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [creatingScan, setCreatingScan] = React.useState(false);
  const [scanId, setScanId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function start(url?: string) {
    const target = (url ?? repo).trim();
    if (!target || creatingScan) return;
    setError(null);
    setRepo(target);
    setScanId(null);
    setScanning(false);
    setCreatingScan(true);
    try {
      const scan = await createScan(target);
      setScanId(scan.id);
      setScanning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start scan.");
    } finally {
      setCreatingScan(false);
    }
  }

  return (
    <main
      className="hero-ambient flex min-h-full flex-col"
    >
      {/* ── Nav ── */}
      <header
        className="border-b"
        style={{ borderColor: "var(--color-line)" }}
      >
        <nav className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <Link
              href="/explore"
              className="px-3 py-1.5 text-sm transition-colors duration-150"
              style={{ color: "var(--color-muted)" }}
              onMouseEnter={(e) =>
                ((e.target as HTMLElement).style.color = "var(--color-ink)")
              }
              onMouseLeave={(e) =>
                ((e.target as HTMLElement).style.color = "var(--color-muted)")
              }
            >
              Workspace
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors duration-150"
              style={{
                borderColor: "var(--color-line)",
                color: "var(--color-muted)",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.borderColor = "var(--color-line-2)";
                el.style.color = "var(--color-ink)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.borderColor = "var(--color-line)";
                el.style.color = "var(--color-muted)";
              }}
            >
              <GithubMark className="h-3.5 w-3.5" />
              GitHub
            </a>
            <ThemeToggle />
          </div>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start px-6 pt-24 pb-20">
        <div
          className="mb-8 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5"
          style={{ borderColor: "var(--color-line)" }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />
          <span
            className="font-mono text-[12px]"
            style={{ color: "var(--color-faint)" }}
          >
            Real repo scans · workspace graph
          </span>
        </div>

        <h1
          className="mb-5 max-w-2xl text-[52px] font-semibold leading-[1.05] tracking-tight"
          style={{ color: "var(--color-ink)" }}
        >
          Understand any codebase
          <br />
          before you touch it.
        </h1>

        <p
          className="mb-10 max-w-lg text-[17px] leading-relaxed"
          style={{ color: "var(--color-muted)" }}
        >
          Paste a GitHub URL. Atlas maps every service, queue, database, and
          external connection — then exports structured context your agents can
          operate on without guessing.
        </p>

        {/* ── Input ── */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
          className="mb-4 flex w-full max-w-xl items-center gap-0 rounded-lg border transition-colors duration-150"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-surface)",
          }}
        >
          <label htmlFor="repo" className="sr-only">
            GitHub repository URL
          </label>
          <div className="flex flex-1 items-center gap-2.5 pl-4">
            <span style={{ color: "var(--color-faint)" }} className="flex shrink-0">
              <GithubMark className="h-4 w-4" />
            </span>
            <input
              id="repo"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="github.com/acme/payments-platform"
              className="w-full bg-transparent py-3 text-[14px] focus:outline-none"
              style={{
                color: "var(--color-ink)",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={creatingScan || scanning}
            className="flex shrink-0 cursor-pointer items-center gap-2 rounded-r-lg px-4 py-3 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            {creatingScan ? "Starting" : "Visualize"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {error && (
          <p className="mb-4 max-w-xl text-[13px] text-err">
            {error}
          </p>
        )}

        <div
          className="flex flex-wrap items-center gap-2 text-[13px]"
          style={{ color: "var(--color-faint)" }}
        >
          <span>Try:</span>
          {SAMPLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void start(s)}
              className="cursor-pointer rounded-md border px-2.5 py-1 font-mono transition-colors duration-150"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-muted)",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.borderColor = "var(--color-line-2)";
                el.style.color = "var(--color-ink)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.borderColor = "var(--color-line)";
                el.style.color = "var(--color-muted)";
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="border-t" style={{ borderColor: "var(--color-line)" }} />

      {/* ── Features ── */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <p
          className="mb-10 text-[12px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-faint)" }}
        >
          What you get
        </p>
        <FeatureList />
      </section>

      {/* ── Divider ── */}
      <div className="border-t" style={{ borderColor: "var(--color-line)" }} />

      {/* ── How Atlas reads your system ── */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <p
          className="mb-2 text-[12px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-faint)" }}
        >
          Under the hood
        </p>
        <h2
          className="mb-12 text-[26px] font-semibold tracking-tight"
          style={{ color: "var(--color-ink)" }}
        >
          How Atlas reads your system
        </h2>

        <div className="grid gap-px overflow-hidden rounded-xl border sm:grid-cols-3"
          style={{
            borderColor: "var(--color-line)",
            backgroundColor: "var(--color-line)",
          }}
        >
          {SCAN_STEPS.map((s) => (
            <div
              key={s.step}
              className="flex flex-col gap-5 p-8"
              style={{ backgroundColor: "var(--color-bg)" }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="font-mono text-[11px] font-semibold"
                  style={{ color: "var(--color-faint)" }}
                >
                  {s.step}
                </span>
                <s.icon
                  className="h-4 w-4"
                  style={{ color: "var(--color-accent)" }}
                />
              </div>
              <div>
                <h3
                  className="mb-2 text-[15px] font-semibold"
                  style={{ color: "var(--color-ink)" }}
                >
                  {s.title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--color-muted)" }}
                >
                  {s.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA nudge */}
        <div className="mt-10 flex items-center gap-4">
          <Link
            href="/explore"
            className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors duration-150"
            style={{
              borderColor: "var(--color-accent)",
              color: "var(--color-accent)",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.backgroundColor = "var(--color-accent)";
              el.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.backgroundColor = "transparent";
              el.style.color = "var(--color-accent)";
            }}
          >
            See a live scan <ArrowRight className="h-4 w-4" />
          </Link>
          <span
            className="text-[13px]"
            style={{ color: "var(--color-faint)" }}
          >
            No install. Demo runs in-browser.
          </span>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="border-t"
        style={{ borderColor: "var(--color-line)" }}
      >
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
          <span
            className="font-mono text-[12px]"
            style={{ color: "var(--color-faint)" }}
          >
            Atlas · hackathon build · 2026
          </span>
          <Link
            href="/explore"
            className="flex items-center gap-1.5 text-[13px] transition-colors duration-150"
            style={{ color: "var(--color-faint)" }}
            onMouseEnter={(e) =>
              ((e.target as HTMLElement).style.color = "var(--color-ink)")
            }
            onMouseLeave={(e) =>
              ((e.target as HTMLElement).style.color = "var(--color-faint)")
            }
          >
            Open workspace <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </footer>

      {scanning && scanId && <ScanOverlay repo={repo} scanId={scanId} />}
    </main>
  );
}
