"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  FileText,
  Boxes,
  Share2,
  Copy,
  Check,
  Download,
  Package,
  ShieldAlert,
  Database,
} from "lucide-react";
import {
  GRAPH,
  SYSTEM_BRIEF,
  linkContextMarkdown,
  linkEndpoints,
  nodeContextMarkdown,
  riskSurfaceMarkdown,
  dependenciesOf,
  dependentsOf,
  type GraphNode,
} from "@/lib/data";
import { getScanExport } from "@/lib/api";
import { SubGraph } from "@/components/SubGraph";
import { Logo, cn } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

interface ContextFile {
  id: string;
  name: string;
  group: "brief" | "risk" | "node" | "link" | "metadata";
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
  ...GRAPH.nodes.map((node) => ({
    id: `node-${node.id}`,
    name: `node-context/${node.id}.md`,
    group: "node" as const,
    content: nodeContextMarkdown(node),
    nodeId: node.id,
  })),
  ...GRAPH.links.map((link) => {
    const { source, target } = linkEndpoints(link);
    return {
      id: `link-${link.id}`,
      name: `link-context/${source?.id}__${target?.id}.md`,
      group: "link" as const,
      content: linkContextMarkdown(link),
    };
  }),
];

const mdComponents = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="mb-4 mt-1 text-lg font-semibold text-ink" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="mb-2 mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-faint" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="mb-2 mt-5 font-mono text-[13px] font-semibold text-muted" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-3 text-[13px] leading-relaxed text-muted" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="mb-3 space-y-1.5 text-[13px] text-muted" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="ml-4 list-disc marker:text-faint" {...props} />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-node-infra" {...props} />
  ),
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre className="scroll-thin mb-3 overflow-x-auto border border-line bg-code-bg p-3 font-mono text-[12px] text-code" {...props} />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLElement>) => (
    <blockquote className="my-3 border-l-2 border-warn/60 bg-warn/5 py-2 pl-3 pr-2 text-[12.5px] text-warn/90" {...props} />
  ),
  hr: () => <hr className="my-4 border-line" />,
};

function groupForPath(path: string): ContextFile["group"] {
  if (path === "system-brief.md") return "brief";
  if (path.includes("risk")) return "risk";
  if (path.startsWith("node-context/")) return "node";
  if (path.startsWith("link-context/")) return "link";
  return "metadata";
}

function FileGroup({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-line p-3">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
        {icon}
        {label}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function FileItem({
  file,
  active,
  onClick,
}: {
  file: ContextFile;
  active: boolean;
  onClick: () => void;
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

function NodePreview({ node }: { node: GraphNode }) {
  const deps = dependenciesOf(node.id);
  const parents = dependentsOf(node.id);
  return (
    <aside className="hidden w-[360px] shrink-0 border-l border-line xl:block">
      <div className="scroll-thin h-full overflow-y-auto p-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Node preview</p>
        <h2 className="mb-1 text-lg font-semibold text-ink">{node.label}</h2>
        <p className="mb-4 text-[13px] leading-relaxed text-muted">{node.whatItIs}</p>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="font-mono text-lg font-semibold text-ink">{deps.length}</p>
            <p className="font-mono text-[10px] uppercase tracking-wide text-faint">Outgoing</p>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="font-mono text-lg font-semibold text-ink">{parents.length}</p>
            <p className="font-mono text-[10px] uppercase tracking-wide text-faint">Incoming</p>
          </div>
        </div>
        <SubGraph node={node} graphData={GRAPH} onSelectNode={() => undefined} />
      </div>
    </aside>
  );
}

export default function ExportPage() {
  return (
    <React.Suspense fallback={<main className="h-screen bg-bg" />}>
      <ExportPageContent />
    </React.Suspense>
  );
}

function ExportPageContent() {
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scanId");
  const repoLabel = searchParams.get("repo") ?? (scanId ?? "acme/payments-platform");
  const [files, setFiles] = React.useState<ContextFile[]>(DEMO_FILES);
  const [activeId, setActiveId] = React.useState(DEMO_FILES[0].id);
  const [copied, setCopied] = React.useState(false);
  const [loadingExport, setLoadingExport] = React.useState(Boolean(scanId));
  const [exportError, setExportError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!scanId) {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        setFiles(DEMO_FILES);
        setActiveId(DEMO_FILES[0].id);
        setLoadingExport(false);
        setExportError(null);
      });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoadingExport(true);
      setExportError(null);
    });
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

  const active = files.find((file) => file.id === activeId) ?? files[0] ?? DEMO_FILES[0];
  const nodeFiles = files.filter((file) => file.group === "node");
  const linkFiles = files.filter((file) => file.group === "link");
  const riskFiles = files.filter((file) => file.group === "risk");
  const metadataFiles = files.filter((file) => file.group === "metadata");
  const activeNode =
    active.nodeId ? GRAPH.nodes.find((node) => node.id === active.nodeId) ?? null : null;

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
      (file) => `\n\n<!-- ===== ${file.name} ===== -->\n\n${file.content}`,
    ).join("\n");
    downloadBlob(
      `${repoLabel.replace(/[^a-z0-9._-]+/gi, "-")}.context-package.md`,
      `# Context Package - ${repoLabel}\n${combined}`,
    );
  }

  return (
    <main className="flex h-screen flex-col bg-bg">
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

      {(loadingExport || exportError) && (
        <div className="border-b border-line bg-bg-2 px-4 py-2 font-mono text-[12px] text-faint">
          {loadingExport ? "Loading scan export..." : `Demo fallback · ${exportError}`}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 overflow-hidden">
        <aside className="scroll-thin w-64 shrink-0 overflow-y-auto border-r border-line">
          <FileGroup icon={<FileText className="h-3 w-3" />} label="Overview">
            {files.filter((file) => file.group === "brief").map((file) => (
              <FileItem key={file.id} file={file} active={file.id === activeId} onClick={() => setActiveId(file.id)} />
            ))}
          </FileGroup>
          {riskFiles.length > 0 && (
            <FileGroup icon={<ShieldAlert className="h-3 w-3 text-warn" />} label="Risk surface">
              {riskFiles.map((file) => (
                <FileItem key={file.id} file={file} active={file.id === activeId} onClick={() => setActiveId(file.id)} />
              ))}
            </FileGroup>
          )}
          {metadataFiles.length > 0 && (
            <FileGroup icon={<Database className="h-3 w-3" />} label={`Metadata · ${metadataFiles.length}`}>
              {metadataFiles.map((file) => (
                <FileItem key={file.id} file={file} active={file.id === activeId} onClick={() => setActiveId(file.id)} />
              ))}
            </FileGroup>
          )}
          <FileGroup icon={<Boxes className="h-3 w-3" />} label={`Nodes · ${nodeFiles.length}`}>
            {nodeFiles.map((file) => (
              <FileItem key={file.id} file={file} active={file.id === activeId} onClick={() => setActiveId(file.id)} />
            ))}
          </FileGroup>
          <FileGroup icon={<Share2 className="h-3 w-3" />} label={`Links · ${linkFiles.length}`}>
            {linkFiles.map((file) => (
              <FileItem key={file.id} file={file} active={file.id === activeId} onClick={() => setActiveId(file.id)} />
            ))}
          </FileGroup>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div className="min-w-0">
              <p className="truncate font-mono text-[12px] text-faint">{repoLabel}</p>
              <h1 className="truncate text-[15px] font-semibold text-ink">{active.name}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={copyActive}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[13px] text-muted transition-colors duration-150 hover:border-line-2 hover:text-ink"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => downloadBlob(active.name.split("/").pop() ?? "context.md", active.content)}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[13px] text-muted transition-colors duration-150 hover:border-line-2 hover:text-ink"
              >
                <Download className="h-3.5 w-3.5" />
                File
              </button>
            </div>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto px-5 py-5">
            <article className="mx-auto max-w-3xl">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {active.content}
              </ReactMarkdown>
            </article>
          </div>
        </section>

        {activeNode && <NodePreview node={activeNode} />}
      </div>
    </main>
  );
}
