"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Share2, ShieldAlert, FileCode2, Boxes, GitPullRequest, Loader2, Bot } from "lucide-react";
import { Logo, GithubMark } from "@/components/ui";
import { ScanOverlay } from "@/components/ScanOverlay";
import { ChatPanel } from "@/components/ChatPanel";
import { createHandoffFromPr, createScan, type PullRequestHandoffRecord } from "@/lib/api";

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
  const [prUrl, setPrUrl] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [scanId, setScanId] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [handoff, setHandoff] = React.useState<PullRequestHandoffRecord | null>(null);
  const [handoffPending, setHandoffPending] = React.useState(false);
  const [handoffError, setHandoffError] = React.useState<string | null>(null);
  const [handoffChatOpen, setHandoffChatOpen] = React.useState(false);

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
      setSubmitError(err instanceof Error ? err.message : "Unable to start a real repository scan");
      setScanning(false);
    }
  }

  async function startHandoff(url?: string) {
    const target = (url ?? prUrl).trim();
    if (!target || handoffPending) return;
    setPrUrl(target);
    setHandoff(null);
    setHandoffChatOpen(false);
    setHandoffError(null);
    setHandoffPending(true);
    try {
      const result = await createHandoffFromPr(target);
      setHandoff(result);
    } catch (err) {
      setHandoffError(err instanceof Error ? err.message : "Unable to build PR handoff");
    } finally {
      setHandoffPending(false);
    }
  }

  function briefList(title: string, items: string[]) {
    return (
      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#5c5e6a]">{title}</p>
        <ul className="space-y-1.5 text-[13px] leading-relaxed text-[#b7b9c3]">
          {items.slice(0, 5).map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <main className="flex min-h-full flex-col bg-[#0c0d10]">
      {/* ── Nav ── */}
      <header className="border-b border-[#2a2c36]">
        <nav className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
          <Logo />
          <div className="flex items-center gap-1">
            <Link
              href="/explore"
              className="px-3 py-1.5 text-sm text-[#8b8d98] transition-colors duration-150 hover:text-[#e8e9ed]"
            >
              Live demo
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="flex cursor-pointer items-center gap-2 rounded rounded-lg border border-[#2a2c36] px-3 py-1.5 text-sm text-[#8b8d98] transition-colors duration-150 hover:border-[#3a3c48] hover:text-[#e8e9ed]"
            >
              <GithubMark className="h-3.5 w-3.5" />
              GitHub
            </a>
          </div>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start px-6 pt-20 pb-16">
        <div className="mb-8 inline-flex items-center gap-2 rounded-lg border border-[#2a2c36] px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#34d399]" />
          <span className="font-mono text-[12px] text-[#5c5e6a]">Demo build — sample payments-platform</span>
        </div>

        <h1 className="mb-5 max-w-2xl text-[48px] font-semibold leading-[1.06] tracking-tight text-[#e8e9ed]">
          Understand any codebase before you touch it.
        </h1>

        <p className="mb-10 max-w-xl text-[17px] leading-relaxed text-[#8b8d98]">
          Paste a GitHub repo and Atlas turns the full system — services, queues, databases,
          external APIs — into a navigable 3D graph with agent-ready context for every connection.
        </p>

        {/* ── Repo Input ── */}
        <form
          onSubmit={(e) => { e.preventDefault(); void start(); }}
          className="mb-4 flex w-full max-w-xl items-center gap-0 rounded-lg border border-[#2a2c36] bg-[#181a22] focus-within:border-[#818cf8]/50"
        >
          <label htmlFor="repo" className="sr-only">GitHub repository URL</label>
          <div className="flex flex-1 items-center gap-2.5 pl-4">
            <GithubMark className="h-4 w-4 shrink-0 text-[#5c5e6a]" />
            <input
              id="repo"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="github.com/acme/payments-platform"
              className="w-full bg-transparent py-3 text-[14px] text-[#e8e9ed] placeholder:text-[#5c5e6a] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={scanning}
            className="flex shrink-0 cursor-pointer items-center gap-2 rounded-r-lg bg-[#818cf8] px-4 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#6366f1] disabled:pointer-events-none disabled:opacity-50"
          >
            Visualize
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {submitError && (
          <p className="mb-4 max-w-xl text-[12px] text-[#fbbf24]">
            {submitError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#5c5e6a]">
          <span>Try:</span>
          {SAMPLES.map((s) => (
            <button
              key={s}
              onClick={() => void start(s)}
              className="cursor-pointer rounded-md border border-[#2a2c36] bg-[#181a22] px-2.5 py-1 font-mono text-[#8b8d98] transition-colors duration-150 hover:border-[#3a3c48] hover:text-[#e8e9ed]"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-10 w-full max-w-4xl border-t border-[#2a2c36] pt-8">
          <div className="mb-4 flex items-center gap-2">
            <GitPullRequest className="h-4 w-4 text-[#34d399]" />
            <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-[#8b8d98]">Unfinished PR handoff</p>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); void startHandoff(); }}
            className="flex w-full max-w-2xl items-center gap-0 rounded-lg border border-[#2a2c36] bg-[#181a22] focus-within:border-[#34d399]/50"
          >
            <label htmlFor="pr-url" className="sr-only">GitHub pull request URL</label>
            <div className="flex flex-1 items-center gap-2.5 pl-4">
              <GitPullRequest className="h-4 w-4 shrink-0 text-[#5c5e6a]" />
              <input
                id="pr-url"
                data-testid="pr-handoff-input"
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/pull/123"
                className="w-full bg-transparent py-3 text-[14px] text-[#e8e9ed] placeholder:text-[#5c5e6a] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={handoffPending}
              data-testid="build-pr-handoff"
              className="flex shrink-0 cursor-pointer items-center gap-2 rounded-r-lg bg-[#34d399] px-4 py-3 text-sm font-semibold text-[#07110d] transition-colors duration-150 hover:bg-[#10b981] disabled:pointer-events-none disabled:opacity-50"
            >
              {handoffPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              Build handoff
            </button>
          </form>
          {handoffError && (
            <p className="mt-3 max-w-2xl text-[12px] text-[#fbbf24]">{handoffError}</p>
          )}

          {handoff && (
            <section data-testid="pr-handoff-review" className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-lg border border-[#2a2c36] bg-[#11131a] p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[12px] text-[#5c5e6a]">{handoff.owner}/{handoff.repo}#{handoff.number}</p>
                    <h2 className="mt-1 text-lg font-semibold text-[#e8e9ed]">{handoff.title}</h2>
                  </div>
                  <div className="rounded-md border border-[#2a2c36] px-2.5 py-1 font-mono text-[11px] text-[#34d399]">
                    {handoff.publicAccess ? "public/no token" : "access uncertain"}
                  </div>
                </div>
                <p className="mb-5 text-[13px] leading-relaxed text-[#b7b9c3]">{handoff.humanBrief.summary}</p>
                <div className="grid gap-5 sm:grid-cols-2">
                  {briefList("Task state", handoff.humanBrief.taskState)}
                  {briefList("Impacted graph", handoff.humanBrief.impactedArchitecture)}
                  {briefList("Risks", handoff.humanBrief.risks)}
                  {briefList("Missing tests", handoff.humanBrief.missingTests)}
                  {briefList("Next steps", handoff.humanBrief.nextSteps)}
                  {briefList("Uncertainty", handoff.humanBrief.uncertainty)}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-[#2a2c36] bg-[#11131a] p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#5c5e6a]">Agent packet</p>
                    <button
                      type="button"
                      data-testid="handoff-chat-open"
                      onClick={() => setHandoffChatOpen(true)}
                      className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[#2a2c36] px-2 py-1 text-[12px] text-[#b7b9c3] transition-colors duration-150 hover:border-[#3a3c48] hover:text-[#e8e9ed]"
                    >
                      <Bot className="h-3.5 w-3.5" />
                      Ask
                    </button>
                  </div>
                  <div className="space-y-2 font-mono text-[12px] leading-relaxed text-[#b7b9c3]">
                    <p>base {handoff.base.ref}@{handoff.base.sha.slice(0, 12)}</p>
                    <p>head {handoff.head.ref}@{handoff.head.sha.slice(0, 12)}</p>
                    <p>{handoff.changedFiles.length} file(s), {handoff.hunks.length} hunk(s), {handoff.commits.length} commit(s)</p>
                    <p>memory {handoff.memoryStatus?.operationId ?? handoff.memoryStatus?.error ?? "not written"}</p>
                  </div>
                </div>
                <div className="max-h-[360px] overflow-y-auto rounded-lg border border-[#2a2c36] bg-[#11131a] p-4">
                  <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[#5c5e6a]">Files, hunks, evidence</p>
                  <div className="space-y-3">
                    {handoff.mappings.slice(0, 8).map((mapping) => (
                      <div key={mapping.hunkId} data-testid="pr-hunk-mapping" className="border-t border-[#2a2c36] pt-3 first:border-t-0 first:pt-0">
                        <p className="truncate font-mono text-[12px] text-[#e8e9ed]">{mapping.filePath}</p>
                        <p className="mt-1 font-mono text-[11px] text-[#5c5e6a]">{mapping.hunkId}</p>
                        <div className="mt-2 space-y-1 text-[12px] text-[#b7b9c3]">
                          {mapping.nodes.slice(0, 3).map((node) => (
                            <p key={`${mapping.hunkId}-${node.nodeId}`}>node {node.label} - {node.reason}</p>
                          ))}
                          {mapping.edges.slice(0, 3).map((edge) => (
                            <p key={`${mapping.hunkId}-${edge.edgeId}`}>edge {edge.source} {"->"} {edge.target} - {edge.reason}</p>
                          ))}
                          {mapping.nodes.length === 0 && mapping.edges.length === 0 && <p>No graph evidence mapped.</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="border-t border-[#2a2c36]" />

      {/* ── Features ── */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <div className="grid gap-px overflow-hidden rounded-xl border border-[#2a2c36] bg-[#2a2c36] sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-[#0c0d10] p-8">
              <f.icon className="mb-4 h-5 w-5 text-[#5c5e6a]" />
              <h3 className="mb-2 text-[15px] font-semibold text-[#e8e9ed]">{f.title}</h3>
              <p className="text-sm leading-relaxed text-[#8b8d98]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#2a2c36]">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
          <span className="font-mono text-[12px] text-[#5c5e6a]">Atlas · hackathon build · 2026</span>
          <Link href="/explore" className="flex items-center gap-1.5 text-[13px] text-[#5c5e6a] transition-colors duration-150 hover:text-[#e8e9ed]">
            Open demo <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </footer>

      {scanning && <ScanOverlay repo={repo} scanId={scanId} />}
      <ChatPanel
        open={handoffChatOpen}
        scanId={handoff?.scanId ?? null}
        handoffId={handoff?.id ?? null}
        selectedNode={null}
        selectedLink={null}
        onClose={() => setHandoffChatOpen(false)}
        onSelectNode={() => {}}
        onSelectLink={() => {}}
      />
    </main>
  );
}
