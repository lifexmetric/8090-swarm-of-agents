"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft, FileText, Boxes, Share2, Copy, Check, Download, Package,
  Eye, FileCode, Search,
} from "lucide-react";
import {
  GRAPH,
  SYSTEM_BRIEF,
  linkContextMarkdown,
  linkEndpoints,
  nodeContextMarkdown,
  riskSurfaceMarkdown,
  type GraphData,
} from "@/lib/data";
import { Logo, cn } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LinkDocView, NodeDocView, SystemBriefView } from "@/components/DocViews";
import { getScanExport, getScanGraph } from "@/lib/api";

// ── Context file model ───────────────────────────────────────────────────────

interface ContextFile {
  id: string;
  name: string;
  group: "brief" | "risk" | "node" | "link";
  content: string;
  nodeId?: string;
  linkId?: string;
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
      linkId: l.id,
    };
  }),
];

// ── Markdown renderer (raw fallback) ──────────────────────────────────────────

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
  table: (p: React.HTMLAttributes<HTMLTableElement>) => (
    <table className="mb-3 w-full border-collapse text-[12.5px]" {...p} />
  ),
  th: (p: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th className="border border-line bg-surface px-2 py-1 text-left font-mono text-[11px] text-faint" {...p} />
  ),
  td: (p: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td className="border border-line px-2 py-1 text-muted" {...p} />
  ),
  hr: () => <hr className="my-4 border-line" />,
};

function groupForPath(path: string): ContextFile["group"] {
  if (path.includes("risk")) return "risk";
  if (path.startsWith("node-context/")) return "node";
  if (path.startsWith("link-context/")) return "link";
  return "brief";
}

/** Human-friendly document name a developer can actually scan for. */
function friendlyName(file: ContextFile, graph: GraphData): string {
  if (file.group === "node" && file.nodeId) {
    const n = graph.nodes.find((x) => x.id === file.nodeId);
    if (n) return n.label;
  }
  if (file.group === "link" && file.linkId) {
    const l = graph.links.find((x) => x.id === file.linkId);
    if (l) {
      const s = graph.nodes.find((x) => x.id === l.source);
      const t = graph.nodes.find((x) => x.id === l.target);
      return `${s?.label ?? l.source} → ${t?.label ?? l.target}`;
    }
  }
  if (file.name.includes("system-brief")) return "System brief";
  if (file.name.includes("handoff")) return "Handoff map";
  if (file.name.includes("backboard")) return "Backboard record";
  if (file.name.includes("risk")) return "Risk surface";
  return (file.name.split("/").pop() ?? file.name).replace(/\.(md|json)$/, "");
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
  file, label, active, onClick,
}: {
  file: ContextFile; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={file.name}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-left font-mono text-[12px] transition-colors duration-150",
        active ? "bg-accent text-white" : "text-muted hover:bg-surface hover:text-ink",
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-bg" : "bg-line-2")} />
      <span className="truncate">{label}</span>
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function ExportPageContent() {
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scanId");
  const repoLabel = searchParams.get("repo") ?? "acme/payments-platform";
  const [files, setFiles] = React.useState<ContextFile[]>(DEMO_FILES);
  const [graph, setGraph] = React.useState<GraphData>(GRAPH);
  const [activeId, setActiveId] = React.useState(DEMO_FILES[0].id);
  const [copied, setCopied] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"visual" | "raw">("visual");
  const [loadingExport, setLoadingExport] = React.useState(Boolean(scanId));
  const [exportError, setExportError] = React.useState<string | null>(null);
  const active = files.find((f) => f.id === activeId) ?? files[0] ?? DEMO_FILES[0];

  React.useEffect(() => {
    if (!scanId) return;
    let cancelled = false;

    getScanGraph(scanId)
      .then((g) => {
        if (!cancelled) setGraph(g);
      })
      .catch(() => {
        /* keep demo graph as a fallback */
      });

    getScanExport(scanId)
      .then((bundle) => {
        if (cancelled) return;
        const nextFiles = bundle.files.map((file): ContextFile => {
          const group = groupForPath(file.path);
          return {
            id: file.path,
            name: file.path,
            group,
            content: file.markdown,
            nodeId:
              group === "node"
                ? file.path.replace(/^node-context\//, "").replace(/\.md$/, "")
                : undefined,
            linkId:
              group === "link"
                ? file.path.replace(/^link-context\//, "").replace(/\.md$/, "")
                : undefined,
          };
        });
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

  const jumpToNode = React.useCallback(
    (nodeId: string) => {
      const file = files.find((f) => f.nodeId === nodeId);
      if (file) {
        setActiveId(file.id);
        setViewMode("visual");
      }
    },
    [files],
  );

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

  const named = React.useMemo(
    () => files.map((f) => ({ file: f, label: friendlyName(f, graph) })),
    [files, graph],
  );
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
  const q = query.trim().toLowerCase();
  const matches = (x: { label: string }) => !q || x.label.toLowerCase().includes(q);
  const nodeFiles = named.filter((x) => x.file.group === "node" && matches(x)).sort(byLabel);
  const linkFiles = named.filter((x) => x.file.group === "link" && matches(x)).sort(byLabel);
  const otherFiles = named.filter((x) => (x.file.group === "brief" || x.file.group === "risk") && matches(x));
  const activeLabel = friendlyName(active, graph);

  // Resolve the structured object backing the active document.
  const activeNode =
    active.group === "node" && active.nodeId
      ? graph.nodes.find((n) => n.id === active.nodeId) ?? null
      : null;
  const activeLink =
    active.group === "link" && active.linkId
      ? graph.links.find((l) => l.id === active.linkId) ?? null
      : null;
  const isBrief = active.name.includes("system-brief");
  const isJson = active.name.endsWith(".json");
  const hasVisual = isBrief || Boolean(activeNode) || Boolean(activeLink);

  function renderVisual() {
    if (isBrief) return <SystemBriefView graph={graph} repoLabel={repoLabel} />;
    if (activeNode) return <NodeDocView node={activeNode} graph={graph} onJumpToNode={jumpToNode} />;
    if (activeLink) return <LinkDocView link={activeLink} graph={graph} onJumpToNode={jumpToNode} />;
    return renderRaw();
  }

  function renderRaw() {
    if (isJson) {
      return (
        <pre className="scroll-thin overflow-x-auto rounded-md border border-line bg-code-bg p-3 font-mono text-[12px] leading-relaxed text-code">
          {active.content}
        </pre>
      );
    }
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {active.content}
      </ReactMarkdown>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-bg">
      {/* Header */}
      <header className="border-b border-line">
        <div className="mx-auto flex h-11 max-w-[1600px] items-center gap-3 px-4">
          <Link
            href={scanId ? `/explore?scanId=${encodeURIComponent(scanId)}` : "/explore"}
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
          <div className="border-b border-line p-2">
            <div className="flex items-center gap-2 rounded-md border border-line bg-bg px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documents…"
                className="w-full bg-transparent font-mono text-[12px] text-ink placeholder:text-faint focus:outline-none"
              />
            </div>
          </div>
          <FileGroup icon={<FileText className="h-3 w-3" />} label="Overview">
            {otherFiles.map(({ file, label }) => (
              <FileItem key={file.id} file={file} label={label} active={file.id === activeId} onClick={() => setActiveId(file.id)} />
            ))}
          </FileGroup>
          <FileGroup icon={<Boxes className="h-3 w-3" />} label={`Nodes · ${nodeFiles.length}`}>
            {nodeFiles.map(({ file, label }) => (
              <FileItem key={file.id} file={file} label={label} active={file.id === activeId} onClick={() => setActiveId(file.id)} />
            ))}
          </FileGroup>
          <FileGroup icon={<Share2 className="h-3 w-3" />} label={`Links · ${linkFiles.length}`}>
            {linkFiles.map(({ file, label }) => (
              <FileItem key={file.id} file={file} label={label} active={file.id === activeId} onClick={() => setActiveId(file.id)} />
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
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <span className="truncate font-mono text-[12.5px] text-ink" title={active.name}>{activeLabel}</span>
            <div className="flex items-center gap-1.5">
              {hasVisual && (
                <div className="mr-1 flex items-center rounded-lg border border-line p-0.5">
                  <button
                    onClick={() => setViewMode("visual")}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] transition-colors duration-150",
                      viewMode === "visual" ? "bg-surface-2 text-ink" : "text-faint hover:text-muted",
                    )}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Visual
                  </button>
                  <button
                    onClick={() => setViewMode("raw")}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] transition-colors duration-150",
                      viewMode === "raw" ? "bg-surface-2 text-ink" : "text-faint hover:text-muted",
                    )}
                  >
                    <FileCode className="h-3.5 w-3.5" />
                    Markdown
                  </button>
                </div>
              )}
              <button
                onClick={copyActive}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-muted transition-colors duration-150 hover:border-line-2 hover:text-ink"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy .md"}
              </button>
              <button
                onClick={() => downloadBlob(active.name.split("/").pop()!, active.content)}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-muted transition-colors duration-150 hover:border-line-2 hover:text-ink"
              >
                <Download className="h-3.5 w-3.5" />
                .md
              </button>
            </div>
          </div>

          <div className="scroll-thin flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-8 py-8">
              {hasVisual && viewMode === "visual" ? renderVisual() : renderRaw()}
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
