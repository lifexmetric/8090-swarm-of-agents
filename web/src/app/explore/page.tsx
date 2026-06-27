"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search, Maximize2, FileDown, X, ShieldAlert, Plus, Minus,
} from "lucide-react";
import {
  GRAPH,
  NODE_KIND_META,
  EDGE_KIND_META,
  CONFIDENCE_META,
  NODE_GROUPS,
  type GraphData,
  type NodeKind,
} from "@/lib/data";
import { getScan, getScanGraph } from "@/lib/api";
import { Graph3D, type Graph3DHandle } from "@/components/Graph3D";
import { NodePanel } from "@/components/NodePanel";
import { LinkPanel } from "@/components/LinkPanel";
import { Logo, GithubMark, cn } from "@/components/ui";
import { NODE_ICON } from "@/components/icons";

const ALL_KINDS = Object.keys(NODE_KIND_META) as NodeKind[];
const MOCK_REPO_LABEL = "acme/payments-platform";
const EMPTY_GRAPH: GraphData = { nodes: [], links: [] };

export default function ExplorePage() {
  return (
    <React.Suspense fallback={<main className="h-screen w-screen bg-[#000]" />}>
      <ExplorePageContent />
    </React.Suspense>
  );
}

function ExplorePageContent() {
  const graphRef = React.useRef<Graph3DHandle>(null);
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scanId");

  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [activeKinds, setActiveKinds] = React.useState<Set<NodeKind>>(new Set(ALL_KINDS));
  const [highRiskOnly, setHighRiskOnly] = React.useState(false);
  const [graphLoad, setGraphLoad] = React.useState<{
    scanId: string;
    graph: GraphData | null;
    repoLabel: string;
    apiNotice: string | null;
  } | null>(null);

  React.useEffect(() => {
    if (!scanId) return;

    let cancelled = false;
    async function load() {
      try {
        const [scan, graph] = await Promise.all([getScan(scanId!), getScanGraph(scanId!)]);
        if (cancelled) return;
        setGraphLoad({
          scanId: scanId!,
          graph,
          repoLabel: scan.repoUrl.replace(/^https:\/\/github\.com\//, ""),
          apiNotice: null,
        });
      } catch (err) {
        if (!cancelled) {
          setGraphLoad({
            scanId: scanId!,
            graph: null,
            repoLabel: scanId!,
            apiNotice: err instanceof Error ? err.message : "Unable to load backend graph",
          });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [scanId]);

  const activeGraphLoad = graphLoad?.scanId === scanId ? graphLoad : null;
  const explicitScanFailed = Boolean(scanId && activeGraphLoad?.apiNotice && !activeGraphLoad.graph);
  const graph = explicitScanFailed ? EMPTY_GRAPH : activeGraphLoad?.graph ?? GRAPH;
  const repoLabel = activeGraphLoad?.repoLabel ?? MOCK_REPO_LABEL;
  const apiNotice = activeGraphLoad?.apiNotice;

  const selectNode = React.useCallback((id: string) => {
    if (!id) { setSelectedNodeId(null); setSelectedLinkId(null); return; }
    setSelectedLinkId(null);
    setSelectedNodeId(id);
  }, []);

  const selectLink = React.useCallback((id: string) => {
    setSelectedNodeId(null);
    setSelectedLinkId(id);
  }, []);

  const toggleKind = (k: NodeKind) =>
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        next.delete(k);
      } else {
        next.add(k);
      }
      return next;
    });

  const filtered: GraphData = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const nodes = graph.nodes.filter((n) => {
      if (!activeKinds.has(n.kind)) return false;
      if (highRiskOnly && n.risks.length === 0) return false;
      if (q && !(
        n.label.toLowerCase().includes(q) ||
        n.domain.toLowerCase().includes(q) ||
        n.whatItIs.toLowerCase().includes(q) ||
        n.kind.toLowerCase().includes(q)
      )) return false;
      return true;
    });
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, links: graph.links.filter((l) => ids.has(l.source) && ids.has(l.target)) };
  }, [query, activeKinds, highRiskOnly, graph]);

  const selectedNode = selectedNodeId ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null : null;
  const selectedLink = selectedLinkId ? graph.links.find((l) => l.id === selectedLinkId) ?? null : null;
  const panelOpen = Boolean(selectedNode || selectedLink);
  const highRiskCount = graph.nodes.filter((n) => n.risks.length > 0).length;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#000]">
      {explicitScanFailed && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#000] px-6">
          <div className="max-w-md border border-[#2a2a2a] bg-[#050505] p-5">
            <p className="mb-2 text-sm font-semibold text-[#ededed]">Real scan unavailable</p>
            <p className="text-[13px] leading-relaxed text-[#888]">{apiNotice}</p>
            <Link href="/" className="mt-4 inline-flex bg-[#ededed] px-3 py-1.5 text-[13px] font-semibold text-black">
              Start another scan
            </Link>
          </div>
        </div>
      )}
      {/* Graph canvas */}
      <div className="absolute inset-0">
        <Graph3D
          ref={graphRef}
          data={filtered}
          selectedNodeId={selectedNodeId}
          selectedLinkId={selectedLinkId}
          onSelectNode={selectNode}
          onSelectLink={selectLink}
        />
      </div>

      {/* ── Top toolbar ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
        {/* Primary bar */}
        <div className="pointer-events-auto border-b border-[#2a2a2a] bg-[#000]/90 backdrop-blur-sm">
          <div className="mx-auto flex h-11 max-w-[1600px] items-center gap-3 px-4">
            <Logo />
            <div className="h-4 w-px bg-[#2a2a2a]" />
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-[#555]">
              <GithubMark className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden font-mono sm:inline">{repoLabel}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-1 border border-[#2a2a2a] bg-[#111]">
                <Search className="ml-2.5 h-3.5 w-3.5 shrink-0 text-[#555]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search nodes…"
                  className="w-36 bg-transparent py-1.5 pr-2 text-[13px] text-[#ededed] placeholder:text-[#555] focus:outline-none sm:w-48"
                />
                {query && (
                  <button onClick={() => setQuery("")} aria-label="Clear" className="cursor-pointer px-1.5 text-[#555] hover:text-[#888]">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex border border-[#2a2a2a] bg-[#111]">
                <button
                  onClick={() => graphRef.current?.zoomOut()}
                  aria-label="Zoom out"
                  className="flex h-[29px] w-8 cursor-pointer items-center justify-center border-r border-[#2a2a2a] text-[#888] transition-colors duration-150 hover:text-[#ededed]"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => graphRef.current?.zoomIn()}
                  aria-label="Zoom in"
                  className="flex h-[29px] w-8 cursor-pointer items-center justify-center border-r border-[#2a2a2a] text-[#888] transition-colors duration-150 hover:text-[#ededed]"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => { selectNode(""); graphRef.current?.resetView(); }}
                  aria-label="Reset zoom"
                  className="flex h-[29px] cursor-pointer items-center gap-1.5 px-2.5 text-[13px] text-[#888] transition-colors duration-150 hover:text-[#ededed]"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              </div>
              <Link
                href={scanId ? `/export?scanId=${encodeURIComponent(scanId)}` : "/export"}
                className="flex cursor-pointer items-center gap-1.5 bg-[#ededed] px-2.5 py-1.5 text-[13px] font-semibold text-black transition-colors duration-150 hover:bg-white"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export context</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="pointer-events-auto border-b border-[#2a2a2a] bg-[#000]/80 backdrop-blur-sm">
          <div className="mx-auto flex h-9 max-w-[1600px] items-center gap-1.5 overflow-x-auto px-4">
            {ALL_KINDS.map((k) => {
              const meta = NODE_KIND_META[k];
              const Icon = NODE_ICON[k];
              const on = activeKinds.has(k);
              return (
                <button
                  key={k}
                  onClick={() => toggleKind(k)}
                  className={cn(
                    "flex shrink-0 cursor-pointer items-center gap-1.5 border px-2.5 py-1 text-[12px] transition-colors duration-150",
                    on
                      ? "border-transparent text-[#111]"
                      : "border-[#2a2a2a] text-[#555] hover:text-[#888]",
                  )}
                  style={on ? { backgroundColor: meta.color, color: meta.color === "#f0f0f0" ? "#000" : "#fff" } : undefined}
                >
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </button>
              );
            })}
            <div className="h-4 w-px shrink-0 bg-[#2a2a2a]" />
            <button
              onClick={() => setHighRiskOnly((v) => !v)}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-1.5 border px-2.5 py-1 text-[12px] transition-colors duration-150",
                highRiskOnly
                  ? "border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]"
                  : "border-[#2a2a2a] text-[#555] hover:text-[#888]",
              )}
            >
              <ShieldAlert className="h-3 w-3" />
              High-risk · {highRiskCount}
            </button>
          </div>
        </div>
      </div>

      {/* ── Compact side legend ── */}
      <div className="pointer-events-none absolute left-3 top-28 z-20">
        <div className="pointer-events-auto w-44 border border-[#2a2a2a] bg-[#000]/90 p-2.5 backdrop-blur-sm">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#555]">Groups</p>
          <div className="space-y-1.5">
            {NODE_GROUPS.map((g) => (
              <div key={g.key} className="group relative flex items-center gap-2">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                <span className="text-[11px] font-medium" style={{ color: g.color }}>{g.key}</span>
                <span className="ml-auto font-mono text-[10px] text-[#555]">
                  {g.key === "Internal" ? "code" : g.key === "Infrastructure" ? "data" : "apis"}
                </span>
                <span className="pointer-events-none absolute left-full top-1/2 ml-2 hidden w-56 -translate-y-1/2 border border-[#2a2a2a] bg-[#050505] p-2 text-[11px] leading-relaxed text-[#888] group-hover:block">
                  {g.desc}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2.5 border-t border-[#2a2a2a] pt-2">
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#555]">Edges</p>
          <div className="space-y-1">
            {(Object.keys(EDGE_KIND_META) as Array<keyof typeof EDGE_KIND_META>).map((k) => (
              <div key={k} className="flex items-center gap-2">
                <span className="h-px w-3 shrink-0" style={{ backgroundColor: EDGE_KIND_META[k].color }} />
                <span className="truncate text-[10px] text-[#777]">{EDGE_KIND_META[k].label}</span>
              </div>
            ))}
          </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-[#2a2a2a] pt-2">
            {(Object.keys(CONFIDENCE_META) as Array<keyof typeof CONFIDENCE_META>).map((k) => (
              <div key={k} className="flex items-center gap-1 text-[10px] text-[#777]">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CONFIDENCE_META[k].color }} />
                {CONFIDENCE_META[k].label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom-center hint ── */}
      {!panelOpen && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
          <div className="border border-[#2a2a2a] bg-[#000]/80 px-3.5 py-2 font-mono text-[12px] text-[#555] backdrop-blur-sm">
            {apiNotice ?? "Top-down flow · drag to pan · scroll to zoom · click any dependency"}
          </div>
        </div>
      )}

      {/* ── Stats ── */}
      <div className={cn(
        "pointer-events-none absolute right-3 top-28 z-10 transition-opacity duration-200",
        panelOpen && "opacity-0",
      )}>
        <div className="border border-[#2a2a2a] bg-[#000]/90 p-3 backdrop-blur-sm">
          <div className="flex gap-5">
            {[
              { label: "Nodes", value: filtered.nodes.length },
              { label: "Edges", value: filtered.links.length },
              { label: "External", value: filtered.nodes.filter((n) => n.kind === "external").length },
            ].map((s) => (
              <div key={s.label}>
                <p className="font-mono text-xl font-semibold tabular-nums text-[#ededed]">{s.value}</p>
                <p className="font-mono text-[10px] uppercase tracking-wide text-[#555]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right detail panel ── */}
      {panelOpen && (
        <div className="absolute right-0 top-0 z-30 h-full w-full max-w-[400px] border-l border-[#2a2a2a]">
          <div className="h-full overflow-hidden bg-[#111] animate-slide-right">
            {selectedNode && (
              <NodePanel
                node={selectedNode}
                graph={graph}
                onClose={() => selectNode("")}
                onFocus={() => graphRef.current?.focusNode(selectedNode.id)}
                onSelectLink={selectLink}
              />
            )}
            {selectedLink && (
              <LinkPanel
                link={selectedLink}
                graph={graph}
                onClose={() => selectNode("")}
                onSelectNode={selectNode}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}
