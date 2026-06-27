"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, FileText, Boxes, Share2, Copy, Check, Download, Package } from "lucide-react";
import {
  GRAPH,
  SYSTEM_BRIEF,
  linkContextMarkdown,
  linkEndpoints,
  nodeContextMarkdown,
} from "@/lib/data";
import { getScanExport } from "@/lib/api";
import { Logo, cn } from "@/components/ui";

interface ContextFile {
  id: string;
  name: string;
  group: "brief" | "node" | "link";
  content: string;
}

const FILES: ContextFile[] = [
  { id: "system-brief", name: "system-brief.md", group: "brief", content: SYSTEM_BRIEF },
  ...GRAPH.nodes.map((n) => ({
    id: `node-${n.id}`,
    name: `node-context/${n.id}.md`,
    group: "node" as const,
    content: nodeContextMarkdown(n),
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

const mdComponents = {
  h1: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="mb-4 mt-1 text-lg font-semibold text-[#ededed]" {...p} />
  ),
  h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="mb-2 mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-[#555]" {...p} />
  ),
  p: (p: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-3 text-[13px] leading-relaxed text-[#888]" {...p} />
  ),
  ul: (p: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="mb-3 space-y-1.5 text-[13px] text-[#888]" {...p} />
  ),
  li: (p: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="ml-4 list-disc marker:text-[#555]" {...p} />
  ),
  code: (p: React.HTMLAttributes<HTMLElement>) => (
    <code className="rounded-sm bg-[#1a1a1a] px-1.5 py-0.5 font-mono text-[12px] text-[#3b82f6]" {...p} />
  ),
  pre: (p: React.HTMLAttributes<HTMLPreElement>) => (
    <pre className="scroll-thin mb-3 overflow-x-auto border border-[#2a2a2a] bg-[#0a0a0a] p-3 font-mono text-[12px] text-[#a5b4fc]" {...p} />
  ),
};

export default function ExportPage() {
  return (
    <React.Suspense fallback={<main className="h-screen bg-[#000]" />}>
      <ExportPageContent />
    </React.Suspense>
  );
}

function ExportPageContent() {
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scanId");
  const [activeId, setActiveId] = React.useState(FILES[0].id);
  const [fileLoad, setFileLoad] = React.useState<{
    scanId: string;
    files: ContextFile[] | null;
    apiNotice: string | null;
  } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const activeFileLoad = fileLoad?.scanId === scanId ? fileLoad : null;
  const files = activeFileLoad?.files ?? FILES;
  const apiNotice = activeFileLoad?.apiNotice;
  const active = files.find((f) => f.id === activeId) ?? files[0];

  React.useEffect(() => {
    if (!scanId) return;

    let cancelled = false;
    async function load() {
      try {
        const response = await getScanExport(scanId!);
        if (cancelled) return;
        const mapped = response.files.map((file): ContextFile => ({
          id: file.path,
          name: file.path,
          group: file.path === "system-brief.md" ? "brief" : file.path.startsWith("node-context/") ? "node" : "link",
          content: file.markdown,
        }));
        setFileLoad({ scanId: scanId!, files: mapped, apiNotice: null });
        setActiveId(mapped[0]?.id ?? FILES[0].id);
      } catch (err) {
        if (!cancelled) {
          setFileLoad({
            scanId: scanId!,
            files: null,
            apiNotice: err instanceof Error ? err.message : "Unable to load backend export; showing mock package",
          });
          setActiveId(FILES[0].id);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [scanId]);

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
    downloadBlob(scanId ? `${scanId}.context-package.md` : "payments-platform.context-package.md", `# Context Package\n${combined}`);
  }

  const nodeFiles = files.filter((f) => f.group === "node");
  const linkFiles = files.filter((f) => f.group === "link");

  return (
    <main className="flex h-screen flex-col bg-[#000]">
      {/* Header */}
      <header className="border-b border-[#2a2a2a]">
        <div className="mx-auto flex h-11 max-w-[1600px] items-center gap-3 px-4">
          <Link
            href={scanId ? `/explore?scanId=${encodeURIComponent(scanId)}` : "/explore"}
            className="flex cursor-pointer items-center gap-1.5 border border-[#2a2a2a] px-2.5 py-1.5 text-[13px] text-[#888] transition-colors duration-150 hover:border-[#3a3a3a] hover:text-[#ededed]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <Logo />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden font-mono text-[12px] text-[#555] md:inline">
              {files.length} files · {nodeFiles.length} nodes · {linkFiles.length} links
              {apiNotice ? " · mock fallback" : ""}
            </span>
            <button
              onClick={downloadPackage}
              className="flex cursor-pointer items-center gap-2 bg-[#ededed] px-3 py-1.5 text-[13px] font-semibold text-black transition-colors duration-150 hover:bg-white"
            >
              <Package className="h-3.5 w-3.5" />
              Download package
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 overflow-hidden">
        {/* File tree */}
        <aside className="scroll-thin w-64 shrink-0 overflow-y-auto border-r border-[#2a2a2a]">
          <FileGroup icon={<FileText className="h-3 w-3" />} label="Overview">
            {files.filter((f) => f.group === "brief").map((f) => (
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
          <div className="flex items-center justify-between border-b border-[#2a2a2a] px-4 py-2.5">
            <span className="truncate font-mono text-[12px] text-[#555]">{active.name}</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={copyActive}
                className="flex cursor-pointer items-center gap-1.5 border border-[#2a2a2a] bg-[#111] px-2.5 py-1.5 text-[12px] text-[#888] transition-colors duration-150 hover:border-[#3a3a3a] hover:text-[#ededed]"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => downloadBlob(active.name.split("/").pop()!, active.content)}
                className="flex cursor-pointer items-center gap-1.5 border border-[#2a2a2a] bg-[#111] px-2.5 py-1.5 text-[12px] text-[#888] transition-colors duration-150 hover:border-[#3a3a3a] hover:text-[#ededed]"
              >
                <Download className="h-3.5 w-3.5" />
                .md
              </button>
            </div>
          </div>

          <div className="scroll-thin flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl px-8 py-8">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {active.content}
              </ReactMarkdown>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function FileGroup({
  icon, label, children,
}: {
  icon: React.ReactNode; label: string; children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[#2a2a2a] py-3">
      <div className="mb-1 flex items-center gap-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[#555]">
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
        "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left font-mono text-[12px] transition-colors duration-150",
        active ? "bg-[#ededed] text-[#000]" : "text-[#888] hover:bg-[#111] hover:text-[#ededed]",
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-[#000]" : "bg-[#333]")} />
      <span className="truncate">{short}</span>
    </button>
  );
}
