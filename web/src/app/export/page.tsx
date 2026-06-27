"use client";

import * as React from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft, FileText, Boxes, Share2, Copy, Check, Download, Package,
  ShieldAlert, ChevronDown, ChevronRight, Code, AlertTriangle,
} from "lucide-react";
import {
  GRAPH,
  SYSTEM_BRIEF,
  EDGE_KIND_META,
  NODE_KIND_META,
  CONFIDENCE_META,
  linkContextMarkdown,
  linkEndpoints,
  nodeContextMarkdown,
  riskSurfaceMarkdown,
  dependenciesOf,
  dependentsOf,
  nodeById,
  type GraphNode,
  type GraphLink,
} from "@/lib/data";
import { SubGraph } from "@/components/SubGraph";
import { Logo, CodeBlock, cn } from "@/components/ui";

// ── Context file model ───────────────────────────────────────────────────────

interface ContextFile {
  id: string;
  name: string;
  group: "brief" | "risk" | "node" | "link";
  content: string;
  nodeId?: string;
}

const FILES: ContextFile[] = [
  {
    id: "system-brief",
    name: "system-brief.md",
    group: "brief",
    content: SYSTEM_BRIEF,
  },
  {
    id: "risk-surface",
    name: "risk-surface.md",
    group: "risk",
    content: riskSurfaceMarkdown(),
  },
  ...GRAPH.nodes.map((n) => ({
    id: `node-${n.id}`,
    name: `node-context/${n.id}.md`,
    group: "node" as const,
    content: nodeContextMarkdown(n),
    nodeId: n.id,
  })),
  ...GRAPH.links.map((l) => {
    const { source, target } = linkEndpoints(l);
    return {
      id: `link-${l.id}`,
      name: `link-context/${source?.id}__${target?.id}.md`,
      group: "link" as const,
      content: linkContextMarkdown(l),
    };
  }),
];

// ── Markdown renderer ────────────────────────────────────────────────────────

const mdComponents = {
  h1: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="mb-4 mt-1 text-lg font-semibold text-[#e8e9ed]" {...p} />
  ),
  h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="mb-2 mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-[#5c5e6a]" {...p} />
  ),
  h3: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="mb-2 mt-5 font-mono text-[13px] font-semibold text-[#c5c7d0]" {...p} />
  ),
  p: (p: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-3 text-[13px] leading-relaxed text-[#8b8d98]" {...p} />
  ),
  ul: (p: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="mb-3 space-y-1.5 text-[13px] text-[#8b8d98]" {...p} />
  ),
  li: (p: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="ml-4 list-disc marker:text-[#5c5e6a]" {...p} />
  ),
  code: (p: React.HTMLAttributes<HTMLElement>) => (
    <code className="rounded-sm bg-[#1e2028] px-1.5 py-0.5 font-mono text-[12px] text-[#60a5fa]" {...p} />
  ),
  pre: (p: React.HTMLAttributes<HTMLPreElement>) => (
    <pre className="scroll-thin mb-3 overflow-x-auto border border-[#2a2c36] bg-[#12131a] p-3 font-mono text-[12px] text-[#a5b4fc]" {...p} />
  ),
  blockquote: (p: React.HTMLAttributes<HTMLElement>) => (
    <blockquote
      className="my-3 border-l-2 border-[#fbbf24]/60 bg-[#fbbf24]/5 py-2 pl-3 pr-2 text-[12.5px] text-[#fbbf24]/90"
      {...p}
    />
  ),
  hr: () => <hr className="my-4 border-[#2a2c36]" />,
};

// ── Dependency deep-dive card ────────────────────────────────────────────────

function CriticalityBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="h-2 w-2.5 rounded-sm"
          style={{
            backgroundColor:
              i <= value
                ? value >= 5
                  ? "#f87171"
                  : value >= 4
                  ? "#fbbf24"
                  : "#60a5fa"
                : "#1e2028",
          }}
        />
      ))}
      <span className="ml-1 font-mono text-[10px] text-[#5c5e6a]">{value}/5</span>
    </div>
  );
}

function DepCard({
  link,
  direction,
  onJumpToNode,
}: {
  link: GraphLink;
  direction: "out" | "in";
  onJumpToNode: (id: string) => void;
}) {
  const isHigh = link.criticality >= 4;
  const [open, setOpen] = React.useState(isHigh);
  const peer =
    direction === "out" ? nodeById(link.target) : nodeById(link.source);
  const meta = EDGE_KIND_META[link.kind];
  const peerMeta = peer ? NODE_KIND_META[peer.kind] : null;

  return (
    <div
      className={cn(
        "border transition-colors duration-150",
        isHigh ? "border-[#fbbf24]/20 bg-[#fbbf24]/[0.03]" : "border-[#2a2a2a] bg-[#0a0a0a]",
      )}
    >
      {/* Card header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left"
      >
        <span
          className="shrink-0 font-mono text-[12px]"
          style={{ color: meta.color }}
        >
          {direction === "out" ? "→" : "←"}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            peer && onJumpToNode(peer.id);
          }}
          className="min-w-0 flex-1 cursor-pointer text-left hover:underline"
        >
          <span className="font-mono text-[12.5px] font-semibold text-[#e8e9ed]">
            {peer?.label ?? (direction === "out" ? link.target : link.source)}
          </span>
          {peerMeta && (
            <span
              className="ml-2 font-mono text-[10px]"
              style={{ color: peerMeta.color }}
            >
              {peerMeta.group}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="rounded border px-1.5 py-0.5 font-mono text-[10px]"
            style={{ color: meta.color, borderColor: `${meta.color}44` }}
          >
            {meta.label}
          </span>
          <CriticalityBar value={link.criticality} />
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-[#5c5e6a]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[#5c5e6a]" />
          )}
        </div>
      </button>

      {/* Card body */}
      {open && (
        <div className="space-y-3 border-t border-[#2a2a2a] px-3 pt-3 pb-3">
          {/* Summary */}
          <p className="text-[12.5px] leading-relaxed text-[#8b8d98]">
            {link.summary}
          </p>

          {/* Contract */}
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#5c5e6a]">
              Contract
            </p>
            <pre className="scroll-thin overflow-x-auto border border-[#2a2c36] bg-[#12131a] p-2.5 font-mono text-[11.5px] leading-relaxed text-[#a5b4fc]">
              {link.contract}
            </pre>
          </div>

          {/* Failure */}
          <div className="flex items-start gap-2 rounded border border-[#f87171]/20 bg-[#f87171]/5 px-2.5 py-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#f87171]" />
            <div>
              <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#f87171]/60">
                Failure
              </p>
              <p className="text-[12px] leading-relaxed text-[#f87171]/80">
                {link.failure}
              </p>
            </div>
          </div>

          {/* Before you change */}
          {link.beforeYouChange && (
            <div className="rounded border border-[#fbbf24]/30 bg-[#fbbf24]/5 px-2.5 py-2">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[#fbbf24]/70">
                Before you change this
              </p>
              <p className="text-[12px] leading-relaxed text-[#fbbf24]/80">
                {link.beforeYouChange}
              </p>
            </div>
          )}

          {/* Code snippet */}
          {link.code && (
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <Code className="h-3 w-3 text-[#5c5e6a]" />
                <span className="font-mono text-[10px] text-[#5c5e6a]">
                  {link.codePath}
                </span>
              </div>
              <CodeBlock code={link.code} />
            </div>
          )}

          {/* Risks */}
          {link.risks.length > 0 && (
            <ul className="space-y-1">
              {link.risks.map((r) => (
                <li key={r} className="flex items-start gap-2 text-[12px] text-[#8b8d98]">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#fbbf24]" />
                  {r}
                </li>
              ))}
            </ul>
          )}

          {/* Confidence */}
          <div className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: CONFIDENCE_META[link.confidence].color }}
            />
            <span className="font-mono text-[10px] text-[#5c5e6a]">
              {CONFIDENCE_META[link.confidence].label}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Node detail view ─────────────────────────────────────────────────────────

function NodeDocView({
  node,
  onJumpToNode,
}: {
  node: GraphNode;
  onJumpToNode: (id: string) => void;
}) {
  const meta = NODE_KIND_META[node.kind];
  const deps = dependenciesOf(node.id);
  const dependents = dependentsOf(node.id);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 border-b border-[#2a2c36] pb-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center border"
            style={{
              borderColor: `${meta.color}44`,
              backgroundColor: `${meta.color}10`,
            }}
          >
            <span className="font-mono text-[11px] font-bold" style={{ color: meta.color }}>
              {node.label.slice(0, 2).toUpperCase()}
            </span>
          </span>
          <div>
            <h1 className="font-mono text-[16px] font-semibold text-[#e8e9ed]">
              {node.label}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="rounded border px-1.5 py-0.5 font-mono text-[10px]"
                style={{ color: meta.color, borderColor: `${meta.color}44` }}
              >
                {meta.group}
              </span>
              <span className="font-mono text-[11px] text-[#5c5e6a]">
                {node.domain}
              </span>
              <span
                className="flex items-center gap-1 font-mono text-[10px]"
                style={{ color: CONFIDENCE_META[node.confidence].color }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: CONFIDENCE_META[node.confidence].color }}
                />
                {CONFIDENCE_META[node.confidence].label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-graph */}
      <div className="mb-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#5c5e6a]">
          Connections — click any node to jump to it
        </p>
        <div className="rounded border border-[#2a2c36] bg-[#0a0a0a] py-2">
          <SubGraph node={node} onSelectNode={onJumpToNode} />
        </div>
      </div>

      {/* What it is / Why it exists */}
      <div className="mb-4">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#5c5e6a]">
          What it is
        </p>
        <p className="text-[13px] leading-relaxed text-[#8b8d98]">{node.whatItIs}</p>
      </div>
      <div className="mb-6">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#5c5e6a]">
          Why it exists
        </p>
        <p className="text-[13px] leading-relaxed text-[#8b8d98]">{node.whyItExists}</p>
      </div>

      {/* Owns */}
      {node.owns.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#5c5e6a]">
            Owns
          </p>
          <div className="flex flex-wrap gap-1.5">
            {node.owns.map((o) => (
              <span
                key={o}
                className="border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-0.5 font-mono text-[11px] text-[#888]"
              >
                {o}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Dependencies — deep-dive cards */}
      {deps.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#5c5e6a]">
            Depends on · {deps.length} outbound
          </p>
          <div className="space-y-2">
            {deps
              .sort((a, b) => b.criticality - a.criticality)
              .map((l) => (
                <DepCard
                  key={l.id}
                  link={l}
                  direction="out"
                  onJumpToNode={onJumpToNode}
                />
              ))}
          </div>
        </div>
      )}

      {/* Dependents */}
      {dependents.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#5c5e6a]">
            Depended on by · {dependents.length} inbound
          </p>
          <div className="space-y-2">
            {dependents
              .sort((a, b) => b.criticality - a.criticality)
              .map((l) => (
                <DepCard
                  key={l.id}
                  link={l}
                  direction="in"
                  onJumpToNode={onJumpToNode}
                />
              ))}
          </div>
        </div>
      )}

      {/* Risk flags */}
      {node.risks.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#5c5e6a]">
            Risk flags
          </p>
          <ul className="space-y-1.5">
            {node.risks.map((r) => (
              <li key={r} className="flex items-start gap-2 text-[13px] text-[#8b8d98]">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#fbbf24]" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Sidebar components ───────────────────────────────────────────────────────

function FileGroup({
  icon, label, children,
}: {
  icon: React.ReactNode; label: string; children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[#2a2c36] py-3">
      <div className="mb-1 flex items-center gap-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[#5c5e6a]">
        {icon}{label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function FileItem({
  file, active, onClick,
}: {
  file: ContextFile; active: boolean; onClick: () => void;
}) {
  const short = file.name.split("/").pop();
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-left font-mono text-[12px] transition-colors duration-150",
        active ? "bg-[#818cf8] text-white" : "text-[#8b8d98] hover:bg-[#181a22] hover:text-[#e8e9ed]",
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-[#0c0d10]" : "bg-[#3a3c48]")} />
      <span className="truncate">{short}</span>
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ExportPage() {
  const [activeId, setActiveId] = React.useState(FILES[0].id);
  const [copied, setCopied] = React.useState(false);
  const active = FILES.find((f) => f.id === activeId) ?? FILES[0];

  const jumpToNode = React.useCallback((nodeId: string) => {
    const file = FILES.find((f) => f.nodeId === nodeId);
    if (file) setActiveId(file.id);
  }, []);

  async function copyActive() {
    await navigator.clipboard.writeText(active.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function downloadBlob(name: string, content: string) {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPackage() {
    const combined = FILES.map(
      (f) => `\n\n<!-- ===== ${f.name} ===== -->\n\n${f.content}`,
    ).join("\n");
    downloadBlob(
      "payments-platform.context-package.md",
      `# Context Package — acme/payments-platform\n${combined}`,
    );
  }

  const nodeFiles = FILES.filter((f) => f.group === "node");
  const linkFiles = FILES.filter((f) => f.group === "link");
  const activeNode =
    active.nodeId ? GRAPH.nodes.find((n) => n.id === active.nodeId) ?? null : null;

  return (
    <main className="flex h-screen flex-col bg-[#0c0d10]">
      {/* Header */}
      <header className="border-b border-[#2a2c36]">
        <div className="mx-auto flex h-11 max-w-[1600px] items-center gap-3 px-4">
          <Link
            href="/explore"
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#2a2c36] px-2.5 py-1.5 text-[13px] text-[#8b8d98] transition-colors duration-150 hover:border-[#3a3c48] hover:text-[#e8e9ed]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <Logo />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden font-mono text-[12px] text-[#5c5e6a] md:inline">
              {FILES.length} files · {nodeFiles.length} nodes · {linkFiles.length} links
            </span>
            <button
              onClick={downloadPackage}
              className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#818cf8] px-3 py-1.5 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-[#6366f1]"
            >
              <Package className="h-3.5 w-3.5" />
              Download package
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 overflow-hidden">
        {/* File tree */}
        <aside className="scroll-thin w-64 shrink-0 overflow-y-auto border-r border-[#2a2c36]">
          <FileGroup icon={<FileText className="h-3 w-3" />} label="Overview">
            {FILES.filter((f) => f.group === "brief").map((f) => (
              <FileItem key={f.id} file={f} active={f.id === activeId} onClick={() => setActiveId(f.id)} />
            ))}
          </FileGroup>
          <FileGroup icon={<ShieldAlert className="h-3 w-3 text-[#fbbf24]" />} label="Risk surface">
            {FILES.filter((f) => f.group === "risk").map((f) => (
              <FileItem key={f.id} file={f} active={f.id === activeId} onClick={() => setActiveId(f.id)} />
            ))}
          </FileGroup>
          <FileGroup icon={<Boxes className="h-3 w-3" />} label={`Nodes · ${nodeFiles.length}`}>
            {nodeFiles.map((f) => (
              <FileItem key={f.id} file={f} active={f.id === activeId} onClick={() => setActiveId(f.id)} />
            ))}
          </FileGroup>
          <FileGroup icon={<Share2 className="h-3 w-3" />} label={`Links · ${linkFiles.length}`}>
            {linkFiles.map((f) => (
              <FileItem key={f.id} file={f} active={f.id === activeId} onClick={() => setActiveId(f.id)} />
            ))}
          </FileGroup>
        </aside>

        {/* Preview */}
        <section className="flex min-w-0 flex-1 flex-col">
          {/* Tab bar */}
          <div className="flex items-center justify-between border-b border-[#2a2c36] px-4 py-2.5">
            <span className="truncate font-mono text-[12px] text-[#5c5e6a]">{active.name}</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={copyActive}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#2a2c36] bg-[#181a22] px-2.5 py-1.5 text-[12px] text-[#8b8d98] transition-colors duration-150 hover:border-[#3a3c48] hover:text-[#e8e9ed]"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy .md"}
              </button>
              <button
                onClick={() =>
                  downloadBlob(active.name.split("/").pop()!, active.content)
                }
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#2a2c36] bg-[#181a22] px-2.5 py-1.5 text-[12px] text-[#8b8d98] transition-colors duration-150 hover:border-[#3a3c48] hover:text-[#e8e9ed]"
              >
                <Download className="h-3.5 w-3.5" />
                .md
              </button>
            </div>
          </div>

          <div className="scroll-thin flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl px-8 py-8">
              {/* Node files get the rich structured view */}
              {activeNode ? (
                <NodeDocView node={activeNode} onJumpToNode={jumpToNode} />
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {active.content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
