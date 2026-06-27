"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { Logo, CodeBlock, cn, colorAlpha } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getScanExport } from "@/lib/api";

// ── Context file model ───────────────────────────────────────────────────────

interface ContextFile {
  id: string;
  name: string;
  group: "brief" | "risk" | "node" | "link";
  content: string;
  nodeId?: string;
}

const DEMO_FILES: ContextFile[] = [
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
    <h1 className="mb-4 mt-1 text-lg font-semibold text-ink" {...p} />
  ),
  h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="mb-2 mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-faint" {...p} />
  ),
  h3: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="mb-2 mt-5 font-mono text-[13px] font-semibold text-muted" {...p} />
  ),
  p: (p: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-3 text-[13px] leading-relaxed text-muted" {...p} />
  ),
  ul: (p: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="mb-3 space-y-1.5 text-[13px] text-muted" {...p} />
  ),
  li: (p: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="ml-4 list-disc marker:text-faint" {...p} />
  ),
  code: (p: React.HTMLAttributes<HTMLElement>) => (
    <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-node-infra" {...p} />
  ),
  pre: (p: React.HTMLAttributes<HTMLPreElement>) => (
    <pre className="scroll-thin mb-3 overflow-x-auto border border-line bg-code-bg p-3 font-mono text-[12px] text-code" {...p} />
  ),
  blockquote: (p: React.HTMLAttributes<HTMLElement>) => (
    <blockquote
      className="my-3 border-l-2 border-warn/60 bg-warn/5 py-2 pl-3 pr-2 text-[12.5px] text-warn/90"
      {...p}
    />
  ),
  hr: () => <hr className="my-4 border-line" />,
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
                  ? "var(--color-err)"
                  : value >= 4
                  ? "var(--color-warn)"
                  : "var(--color-node-infra)"
                : "var(--color-surface-2)",
          }}
        />
      ))}
      <span className="ml-1 font-mono text-[10px] text-faint">{value}/5</span>
    </div>
  );
}

function groupForPath(path: string): ContextFile["group"] {
  if (path.includes("risk")) return "risk";
  if (path.startsWith("node-context/")) return "node";
  if (path.startsWith("link-context/")) return "link";
  return "brief";
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
        isHigh ? "border-warn/20 bg-warn/[0.03]" : "border-line bg-bg",
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
            if (peer) onJumpToNode(peer.id);
          }}
          className="min-w-0 flex-1 cursor-pointer text-left hover:underline"
        >
          <span className="font-mono text-[12.5px] font-semibold text-ink">
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
            style={{ color: meta.color, borderColor: colorAlpha(meta.color, 27) }}
          >
            {meta.label}
          </span>
          <CriticalityBar value={link.criticality} />
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-faint" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-faint" />
          )}
        </div>
      </button>

      {/* Card body */}
      {open && (
        <div className="space-y-3 border-t border-line px-3 pt-3 pb-3">
          {/* Summary */}
          <p className="text-[12.5px] leading-relaxed text-muted">
            {link.summary}
          </p>

          {/* Contract */}
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              Contract
            </p>
            <pre className="scroll-thin overflow-x-auto border border-line bg-code-bg p-2.5 font-mono text-[11.5px] leading-relaxed text-code">
              {link.contract}
            </pre>
          </div>

          {/* Failure */}
          <div className="flex items-start gap-2 rounded border border-err/20 bg-err/5 px-2.5 py-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-err" />
            <div>
              <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-err/60">
                Failure
              </p>
              <p className="text-[12px] leading-relaxed text-err/80">
                {link.failure}
              </p>
            </div>
          </div>

          {/* Before you change */}
          {link.beforeYouChange && (
            <div className="rounded border border-warn/30 bg-warn/5 px-2.5 py-2">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em] text-warn/70">
                Before you change this
              </p>
              <p className="text-[12px] leading-relaxed text-warn/80">
                {link.beforeYouChange}
              </p>
            </div>
          )}

          {/* Code snippet */}
          {link.code && (
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <Code className="h-3 w-3 text-faint" />
                <span className="font-mono text-[10px] text-faint">
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
                <li key={r} className="flex items-start gap-2 text-[12px] text-muted">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
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
            <span className="font-mono text-[10px] text-faint">
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
      <div className="mb-6 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center border"
            style={{
              borderColor: colorAlpha(meta.color, 27),
              backgroundColor: colorAlpha(meta.color, 6),
            }}
          >
            <span className="font-mono text-[11px] font-bold" style={{ color: meta.color }}>
              {node.label.slice(0, 2).toUpperCase()}
            </span>
          </span>
          <div>
            <h1 className="font-mono text-[16px] font-semibold text-ink">
              {node.label}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="rounded border px-1.5 py-0.5 font-mono text-[10px]"
                style={{ color: meta.color, borderColor: colorAlpha(meta.color, 27) }}
              >
                {meta.group}
              </span>
              <span className="font-mono text-[11px] text-faint">
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
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          Connections — click any node to jump to it
        </p>
        <div className="rounded border border-line bg-bg py-2">
          <SubGraph node={node} graphData={GRAPH} onSelectNode={onJumpToNode} />
        </div>
      </div>

      {/* What it is / Why it exists */}
      <div className="mb-4">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          What it is
        </p>
        <p className="text-[13px] leading-relaxed text-muted">{node.whatItIs}</p>
      </div>
      <div className="mb-6">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          Why it exists
        </p>
        <p className="text-[13px] leading-relaxed text-muted">{node.whyItExists}</p>
      </div>

      {/* Owns */}
      {node.owns.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            Owns
          </p>
          <div className="flex flex-wrap gap-1.5">
            {node.owns.map((o) => (
              <span
                key={o}
                className="border border-line bg-bg px-2 py-0.5 font-mono text-[11px] text-muted"
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
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
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
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
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
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            Risk flags
          </p>
          <ul className="space-y-1.5">
            {node.risks.map((r) => (
              <li key={r} className="flex items-start gap-2 text-[13px] text-muted">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
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
    <div className="border-b border-line py-3">
      <div className="mb-1 flex items-center gap-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
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
        active ? "bg-accent text-white" : "text-muted hover:bg-surface hover:text-ink",
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-bg" : "bg-line-2")} />
      <span className="truncate">{short}</span>
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function ExportPageContent() {
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scanId");
  const repoLabel = searchParams.get("repo") ?? "acme/payments-platform";
  const [files, setFiles] = React.useState<ContextFile[]>(DEMO_FILES);
  const [activeId, setActiveId] = React.useState(DEMO_FILES[0].id);
  const [copied, setCopied] = React.useState(false);
  const [loadingExport, setLoadingExport] = React.useState(Boolean(scanId));
  const [exportError, setExportError] = React.useState<string | null>(null);
  const active = files.find((f) => f.id === activeId) ?? files[0] ?? DEMO_FILES[0];

  React.useEffect(() => {
    if (!scanId) return;

    let cancelled = false;
    getScanExport(scanId)
      .then((bundle) => {
        if (cancelled) return;
        const nextFiles = bundle.files.map((file): ContextFile => ({
          id: file.path,
          name: file.path,
          group: groupForPath(file.path),
          content: file.markdown,
          nodeId: file.path.startsWith("node-context/")
            ? file.path.replace(/^node-context\//, "").replace(/\.md$/, "")
            : undefined,
        }));
        setFiles(nextFiles.length ? nextFiles : DEMO_FILES);
        setActiveId(nextFiles[0]?.id ?? DEMO_FILES[0].id);
      })
      .catch((err) => {
        if (cancelled) return;
        setExportError(err instanceof Error ? err.message : "Unable to load export package.");
        setFiles(DEMO_FILES);
        setActiveId(DEMO_FILES[0].id);
      })
      .finally(() => {
        if (!cancelled) setLoadingExport(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scanId]);

  const jumpToNode = React.useCallback((nodeId: string) => {
    const file = files.find((f) => f.nodeId === nodeId);
    if (file) setActiveId(file.id);
  }, [files]);

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
    const combined = files.map(
      (f) => `\n\n<!-- ===== ${f.name} ===== -->\n\n${f.content}`,
    ).join("\n");
    downloadBlob(
      `${repoLabel.replace(/[^a-z0-9._-]+/gi, "-")}.context-package.md`,
      `# Context Package — ${repoLabel}\n${combined}`,
    );
  }

  const nodeFiles = files.filter((f) => f.group === "node");
  const linkFiles = files.filter((f) => f.group === "link");
  const activeNode =
    !scanId && active.nodeId ? GRAPH.nodes.find((n) => n.id === active.nodeId) ?? null : null;

  return (
    <main className="flex h-screen flex-col bg-bg">
      {/* Header */}
      <header className="border-b border-line">
        <div className="mx-auto flex h-11 max-w-[1600px] items-center gap-3 px-4">
          <Link
            href="/explore"
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[13px] text-muted transition-colors duration-150 hover:border-line-2 hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <Logo />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden font-mono text-[12px] text-faint md:inline">
              {files.length} files · {nodeFiles.length} nodes · {linkFiles.length} links
            </span>
            <button
              onClick={downloadPackage}
              className="flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white transition-opacity duration-150 hover:opacity-90"
            >
              <Package className="h-3.5 w-3.5" />
              Download package
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 overflow-hidden">
        {/* File tree */}
        <aside className="scroll-thin w-64 shrink-0 overflow-y-auto border-r border-line">
          <FileGroup icon={<FileText className="h-3 w-3" />} label="Overview">
            {files.filter((f) => f.group === "brief").map((f) => (
              <FileItem key={f.id} file={f} active={f.id === activeId} onClick={() => setActiveId(f.id)} />
            ))}
          </FileGroup>
          <FileGroup icon={<ShieldAlert className="h-3 w-3 text-warn" />} label="Risk surface">
            {files.filter((f) => f.group === "risk").map((f) => (
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
          {(loadingExport || exportError) && (
            <div className="border-b border-line px-4 py-2 font-mono text-[12px] text-faint">
              {loadingExport ? "Loading backend export package…" : `Demo fallback · ${exportError}`}
            </div>
          )}

          {/* Tab bar */}
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="truncate font-mono text-[12px] text-faint">{active.name}</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={copyActive}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-muted transition-colors duration-150 hover:border-line-2 hover:text-ink"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy .md"}
              </button>
              <button
                onClick={() =>
                  downloadBlob(active.name.split("/").pop()!, active.content)
                }
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-muted transition-colors duration-150 hover:border-line-2 hover:text-ink"
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

export default function ExportPage() {
  return (
    <React.Suspense fallback={<main className="h-screen bg-bg" />}>
      <ExportPageContent />
    </React.Suspense>
  );
}
