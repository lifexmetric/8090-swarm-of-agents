"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Share2, ShieldAlert, FileCode2, Boxes } from "lucide-react";
import { Logo, GithubMark } from "@/components/ui";
import { ScanOverlay } from "@/components/ScanOverlay";
import { createScan } from "@/lib/api";

const SAMPLES = ["fastify/fastify-plugin", "fastify/fastify-autoload", "stripe/stripe-node"];

const FEATURES = [
  {
    icon: Boxes,
    title: "See the whole system",
    body: "Every service, queue, database, and external API rendered as a navigable 3D graph, clustered by domain.",
  },
  {
    icon: Share2,
    title: "Connections over nodes",
    body: "Click any edge: exact code, request/response contract, failure behavior, and where the real risk sits.",
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

export default function LandingPage() {
  const [repo, setRepo] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [scanId, setScanId] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  async function start(url?: string) {
    const target = (url ?? repo).trim();
    if (!target) return;
    setRepo(target);
    setSubmitError(null);
    setScanId(null);

    try {
      const scan = await createScan(target);
      setScanId(scan.id);
      setScanning(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Backend unavailable; opening mock demo");
      setScanning(true);
    }
  }

  return (
    <main className="flex min-h-full flex-col bg-[#000]">
      {/* ── Nav ── */}
      <header className="border-b border-[#2a2a2a]">
        <nav className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
          <Logo />
          <div className="flex items-center gap-1">
            <Link
              href="/explore"
              className="px-3 py-1.5 text-sm text-[#888] transition-colors duration-150 hover:text-[#ededed]"
            >
              Live demo
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="flex cursor-pointer items-center gap-2 rounded border border-[#2a2a2a] px-3 py-1.5 text-sm text-[#888] transition-colors duration-150 hover:border-[#3a3a3a] hover:text-[#ededed]"
            >
              <GithubMark className="h-3.5 w-3.5" />
              GitHub
            </a>
          </div>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start px-6 pt-24 pb-20">
        <div className="mb-8 inline-flex items-center gap-2 rounded-sm border border-[#2a2a2a] px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
          <span className="font-mono text-[12px] text-[#555]">Demo build — sample payments-platform</span>
        </div>

        <h1 className="mb-5 max-w-2xl text-[48px] font-semibold leading-[1.06] tracking-tight text-[#ededed]">
          Understand any codebase before you touch it.
        </h1>

        <p className="mb-10 max-w-xl text-[17px] leading-relaxed text-[#888]">
          Paste a GitHub repo and Atlas turns the full system — services, queues, databases,
          external APIs — into a navigable 3D graph with agent-ready context for every connection.
        </p>

        {/* ── Input ── */}
        <form
          onSubmit={(e) => { e.preventDefault(); void start(); }}
          className="mb-4 flex w-full max-w-xl items-center gap-0 border border-[#2a2a2a] bg-[#111] focus-within:border-[#3a3a3a]"
        >
          <label htmlFor="repo" className="sr-only">GitHub repository URL</label>
          <div className="flex flex-1 items-center gap-2.5 pl-4">
            <GithubMark className="h-4 w-4 shrink-0 text-[#555]" />
            <input
              id="repo"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="github.com/acme/payments-platform"
              className="w-full bg-transparent py-3 text-[14px] text-[#ededed] placeholder:text-[#555] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={scanning}
            className="flex shrink-0 cursor-pointer items-center gap-2 bg-[#ededed] px-4 py-3 text-sm font-semibold text-black transition-colors duration-150 hover:bg-white disabled:pointer-events-none disabled:opacity-50"
          >
            Visualize
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {submitError && (
          <p className="mb-4 max-w-xl text-[12px] text-[#f59e0b]">
            {submitError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#555]">
          <span>Try:</span>
          {SAMPLES.map((s) => (
            <button
              key={s}
              onClick={() => void start(s)}
              className="cursor-pointer rounded-sm border border-[#2a2a2a] bg-[#111] px-2.5 py-1 font-mono text-[#888] transition-colors duration-150 hover:border-[#3a3a3a] hover:text-[#ededed]"
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="border-t border-[#2a2a2a]" />

      {/* ── Features ── */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <div className="grid gap-px border border-[#2a2a2a] bg-[#2a2a2a] sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-[#000] p-8">
              <f.icon className="mb-4 h-5 w-5 text-[#555]" />
              <h3 className="mb-2 text-[15px] font-semibold text-[#ededed]">{f.title}</h3>
              <p className="text-sm leading-relaxed text-[#888]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#2a2a2a]">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
          <span className="font-mono text-[12px] text-[#555]">Atlas · hackathon build · 2026</span>
          <Link href="/explore" className="flex items-center gap-1.5 text-[13px] text-[#555] transition-colors duration-150 hover:text-[#ededed]">
            Open demo <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </footer>

      {scanning && <ScanOverlay repo={repo} scanId={scanId} />}
    </main>
  );
}
