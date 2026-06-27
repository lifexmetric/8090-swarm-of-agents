"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search, Maximize2, FileDown, X, ShieldAlert, Plus, Minus, GitMerge,
} from "lucide-react";
import {
  GRAPH,
  NODE_KIND_META,
  EDGE_KIND_META,
  CONFIDENCE_META,
  NODE_GROUPS,
  nodeById,
  dependenciesOf,
  dependentsOf,
  type GraphData,
  type GraphNode,
  type NodeKind,
} from "@/lib/data";
import { Graph3D, type Graph3DHandle } from "@/components/Graph3D";
import { NodePanel } from "@/components/NodePanel";
import { LinkPanel } from "@/components/LinkPanel";
import { Logo, GithubMark, cn } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NODE_ICON } from "@/components/icons";
import { getScanGraph } from "@/lib/api";

const ALL_KINDS = Object.keys(NODE_KIND_META) as NodeKind[];

// The primary money-path through the system — used for critical-path mode
const CRITICAL_PATH_NODE_IDS = new Set([
  "api-gateway",
  "orders-module",
  "rabbitmq",
  "payments-service",
  "rbc-rail-adapter",
]);

function ExplorePageContent() {
  const graphRef = React.useRef<Graph3DHandle>(null);
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scanId");
  const repoLabel = searchParams.get("repo") ?? "acme/payments-platform";

  const [graphData, setGraphData] = React.useState<GraphData>(GRAPH);
  const [loadingGraph, setLoadingGraph] = React.useState(Boolean(scanId));
  const [graphError, setGraphError] = React.useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [activeKinds, setActiveKinds] = React.useState<Set<NodeKind>>(new Set(ALL_KINDS));
  const [highRiskOnly, setHighRiskOnly] = React.useState(false);
  const [criticalPathMode, setCriticalPathMode] = React.useState(false);

  // Navigation history for drill-down exploration
  const [nodeHistory, setNodeHistory] = React.useState<GraphNode[]>([]);
  const [panelView, setPanelView] = React.useState<"overview" | "subgraph">("overview");

  React.useEffect(() => {
    if (!scanId) return;

    let cancelled = false;
    getScanGraph(scanId)
      .then((graph) => {
        if (cancelled) return;
        setGraphData(graph);
        setSelectedNodeId(null);
        setSelectedLinkId(null);
        setNodeHistory([]);
        setPanelView("overview");
      })
      .catch((err) => {
        if (cancelled) return;
        setGraphError(err instanceof Error ? err.message : "Unable to load scan graph.");
        setGraphData(GRAPH);
      })
      .finally(() => {
        if (!cancelled) setLoadingGraph(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scanId]);

  const criticalPathNodeIds = React.useMemo(() => {
    const demoNodesPresent = [...CRITICAL_PATH_NODE_IDS].every((id) =>
      graphData.nodes.some((node) => node.id === id),
    );
    if (demoNodesPresent) return CRITICAL_PATH_NODE_IDS;
    return new Set(
      graphData.links
        .filter((link) => link.criticality >= 5)
        .flatMap((link) => [link.source, link.target]),
    );
  }, [graphData]);

  const criticalPathLinkIds = React.useMemo(
    () =>
      new Set(
        graphData.links
          .filter((link) => criticalPathNodeIds.has(link.source) && criticalPathNodeIds.has(link.target))
          .map((link) => link.id),
      ),
    [criticalPathNodeIds, graphData.links],
  );

  // Select from main graph — resets drill history and critical path mode
  const selectNode = React.useCallback((id: string) => {
    setNodeHistory([]);
    setPanelView("overview");
    setCriticalPathMode(false);
    if (!id) { setSelectedNodeId(null); setSelectedLinkId(null); return; }
    setSelectedLinkId(null);
    setSelectedNodeId(id);
  }, []);

  // Drill down from sub-graph — adds current node to breadcrumb history
  const drillDown = React.useCallback((id: string) => {
    setSelectedNodeId((current) => {
      if (current) {
        const currentNode = nodeById(current, graphData);
        if (currentNode) {
          setNodeHistory((h) => [...h, currentNode]);
        }
      }
      return id;
    });
    setPanelView("subgraph");
    setSelectedLinkId(null);
  }, [graphData]);

  // Go back one level in drill history
  const goBack = React.useCallback(() => {
    setNodeHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setSelectedNodeId(prev.id);
      setSelectedLinkId(null);
      return h.slice(0, -1);
    });
  }, []);

  // Double-click a node → open sub-graph tab directly
  const handleDoubleClickNode = React.useCallback((id: string) => {
    setNodeHistory([]);
    setCriticalPathMode(false);
    setSelectedLinkId(null);
    setSelectedNodeId(id);
    setPanelView("subgraph");
    graphRef.current?.focusNode(id);
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

  // ── Keyboard navigation ──────────────────────────────────────────────────
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't intercept when typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;

      if (e.key === "Escape") {
        selectNode("");
        return;
      }

      if (!selectedNodeId) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const deps = dependenciesOf(selectedNodeId, graphData);
        if (deps.length > 0) {
          const next = deps[0].target;
          setSelectedNodeId(next);
          setSelectedLinkId(null);
          setNodeHistory([]);
          setPanelView("overview");
          graphRef.current?.focusNode(next);
        }
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        const parents = dependentsOf(selectedNodeId, graphData);
        if (parents.length > 0) {
          const prev = parents[0].source;
          setSelectedNodeId(prev);
          setSelectedLinkId(null);
          setNodeHistory([]);
          setPanelView("overview");
          graphRef.current?.focusNode(prev);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [graphData, selectedNodeId, selectNode]);

  const filtered: GraphData = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const nodes = graphData.nodes.filter((n) => {
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
    return { nodes, links: graphData.links.filter((l) => ids.has(l.source) && ids.has(l.target)) };
  }, [graphData, query, activeKinds, highRiskOnly]);

  const selectedNode = selectedNodeId ? graphData.nodes.find((n) => n.id === selectedNodeId) ?? null : null;
  const selectedLink = selectedLinkId ? graphData.links.find((l) => l.id === selectedLinkId) ?? null : null;
  const panelOpen = Boolean(selectedNode || selectedLink);
  const highRiskCount = graphData.nodes.filter((n) => n.risks.length > 0).length;
  const exportHref = scanId
    ? `/export?scanId=${encodeURIComponent(scanId)}&repo=${encodeURIComponent(repoLabel)}`
    : "/export";

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-bg">
      {/* Graph canvas */}
      <div className="absolute inset-0">
        <Graph3D
          ref={graphRef}
          data={filtered}
          selectedNodeId={selectedNodeId}
          selectedLinkId={selectedLinkId}
          onSelectNode={selectNode}
          onSelectLink={selectLink}
          onDoubleClickNode={handleDoubleClickNode}
          criticalPathMode={criticalPathMode}
          criticalPathNodeIds={criticalPathNodeIds}
          criticalPathLinkIds={criticalPathLinkIds}
        />
      </div>

      {(loadingGraph || graphError) && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2">
          <div className="rounded-lg border border-line bg-bg/90 px-4 py-2.5 font-mono text-[12px] text-faint backdrop-blur-sm">
            {loadingGraph ? "Loading scanned graph…" : `Demo fallback · ${graphError}`}
          </div>
        </div>
      )}

      {/* ── Top toolbar ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
        {/* Primary bar */}
        <div className="pointer-events-auto border-b border-line bg-bg/90 backdrop-blur-sm">
          <div className="mx-auto flex h-11 max-w-[1600px] items-center gap-3 px-4">
            <Logo />
            <div className="h-4 w-px bg-line" />
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-faint">
              <GithubMark className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden truncate font-mono sm:inline">{repoLabel}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-line bg-surface">
                <Search className="ml-2.5 h-3.5 w-3.5 shrink-0 text-faint" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search nodes…"
                  className="w-36 bg-transparent py-1.5 pr-2 text-[13px] text-ink placeholder:text-faint focus:outline-none sm:w-48"
                />
                {query && (
                  <button onClick={() => setQuery("")} aria-label="Clear" className="cursor-pointer px-1.5 text-faint hover:text-muted">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex rounded-lg border border-line bg-surface">
                <button
                  onClick={() => graphRef.current?.zoomOut()}
                  aria-label="Zoom out"
                  className="flex h-[29px] w-8 cursor-pointer items-center justify-center border-r border-line text-muted transition-colors duration-150 hover:text-ink"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => graphRef.current?.zoomIn()}
                  aria-label="Zoom in"
                  className="flex h-[29px] w-8 cursor-pointer items-center justify-center border-r border-line text-muted transition-colors duration-150 hover:text-ink"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => { selectNode(""); graphRef.current?.resetView(); }}
                  aria-label="Reset zoom"
                  className="flex h-[29px] cursor-pointer items-center gap-1.5 px-2.5 text-[13px] text-muted transition-colors duration-150 hover:text-ink"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              </div>
              <Link
                href={exportHref}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-[13px] font-semibold text-white transition-opacity duration-150 hover:opacity-90"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export context</span>
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="pointer-events-auto border-b border-line bg-bg/80 backdrop-blur-sm">
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
                    "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] transition-colors duration-150",
                    on
                      ? "border-transparent"
                      : "border-line text-faint hover:text-muted",
                  )}
                  style={on ? { backgroundColor: meta.color, color: meta.group === "Internal" ? "var(--color-bg)" : "#fff" } : undefined}
                >
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </button>
              );
            })}
            <div className="h-4 w-px shrink-0 bg-line" />
            <button
              onClick={() => setHighRiskOnly((v) => !v)}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] transition-colors duration-150",
                highRiskOnly
                  ? "border-warn/40 bg-warn/10 text-warn"
                  : "border-line text-faint hover:text-muted",
              )}
            >
              <ShieldAlert className="h-3 w-3" />
              High-risk · {highRiskCount}
            </button>
            {/* Critical path mode */}
            <button
              onClick={() => {
                setCriticalPathMode((v) => !v);
                setSelectedNodeId(null);
                setSelectedLinkId(null);
              }}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] transition-colors duration-150",
                criticalPathMode
                  ? "border-err/40 bg-err/10 text-err"
                  : "border-line text-faint hover:text-muted",
              )}
              title="Highlight the critical money path through the system"
            >
              <GitMerge className="h-3 w-3" />
              Critical path
            </button>
          </div>
        </div>
      </div>

      {/* ── Compact side legend ── */}
      <div className="pointer-events-none absolute left-3 top-28 z-20">
        <div className="pointer-events-auto w-44 rounded-lg border border-line bg-bg/90 p-2.5 backdrop-blur-sm">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">Groups</p>
          <div className="space-y-1.5">
            {NODE_GROUPS.map((g) => (
              <div key={g.key} className="group relative flex items-center gap-2">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                <span className="text-[11px] font-medium" style={{ color: g.color }}>{g.key}</span>
                <span className="ml-auto font-mono text-[10px] text-faint">
                  {g.key === "Internal" ? "code" : g.key === "Infrastructure" ? "data" : "apis"}
                </span>
                <span className="pointer-events-none absolute left-full top-1/2 ml-2 hidden w-56 -translate-y-1/2 rounded-lg border border-line bg-bg-2 p-2 text-[11px] leading-relaxed text-muted group-hover:block">
                  {g.desc}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2.5 border-t border-line pt-2">
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">Edges</p>
            <div className="space-y-1">
              {(Object.keys(EDGE_KIND_META) as Array<keyof typeof EDGE_KIND_META>).map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="h-px w-3 shrink-0" style={{ backgroundColor: EDGE_KIND_META[k].color }} />
                  <span className="truncate text-[10px] text-muted">{EDGE_KIND_META[k].label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2">
            {(Object.keys(CONFIDENCE_META) as Array<keyof typeof CONFIDENCE_META>).map((k) => (
              <div key={k} className="flex items-center gap-1 text-[10px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CONFIDENCE_META[k].color }} />
                {CONFIDENCE_META[k].label}
              </div>
            ))}
          </div>

          {/* Keyboard shortcuts */}
          <div className="mt-2.5 border-t border-line pt-2">
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">Keys</p>
            <div className="space-y-1">
              {[
                { key: "↑ / ↓", label: "Traverse" },
                { key: "Dbl-click", label: "Sub-graph" },
                { key: "Esc", label: "Deselect" },
              ].map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-2">
                  <span className="rounded bg-surface-2 px-1 font-mono text-[9px] text-faint">{s.key}</span>
                  <span className="text-[10px] text-faint">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom-center hint ── */}
      {!panelOpen && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
          <div className="rounded-lg border border-line bg-bg/80 px-3.5 py-2 font-mono text-[12px] text-faint backdrop-blur-sm">
            {criticalPathMode
              ? "Critical path highlighted · click any node to explore · Esc to clear"
              : selectedNodeId
              ? "↑ parent  ↓ next dep  dbl-click sub-graph  Esc deselect"
              : "Top-down flow · drag to pan · scroll to zoom · click any node"}
          </div>
        </div>
      )}

      {/* ── Stats ── */}
      <div className={cn(
        "pointer-events-none absolute right-3 top-28 z-10 transition-opacity duration-200",
        panelOpen && "opacity-0",
      )}>
        <div className="rounded-lg border border-line bg-bg/90 p-3 backdrop-blur-sm">
          <div className="flex gap-5">
            {[
              { label: "Nodes", value: filtered.nodes.length },
              { label: "Edges", value: filtered.links.length },
              { label: "External", value: filtered.nodes.filter((n) => n.kind === "external").length },
            ].map((s) => (
              <div key={s.label}>
                <p className="font-mono text-xl font-semibold tabular-nums text-ink">{s.value}</p>
                <p className="font-mono text-[10px] uppercase tracking-wide text-faint">{s.label}</p>
              </div>
            ))}
          </div>
          {criticalPathMode && (
            <p className="mt-2 font-mono text-[10px] text-err">
              Critical path active
            </p>
          )}
        </div>
      </div>

      {/* ── Right detail panel ── */}
      {panelOpen && (
        <div className="absolute right-0 top-0 z-30 h-full w-full max-w-[400px] border-l border-line">
          <div className="h-full overflow-hidden rounded-l-xl bg-surface animate-slide-right">
            {selectedNode && (
              <NodePanel
                node={selectedNode}
                graphData={graphData}
                onClose={() => selectNode("")}
                onFocus={() => graphRef.current?.focusNode(selectedNode.id)}
                onSelectLink={selectLink}
                onDrillDown={drillDown}
                nodeHistory={nodeHistory}
                onGoBack={goBack}
                view={panelView}
                onViewChange={setPanelView}
              />
            )}
            {selectedLink && (
              <LinkPanel
                link={selectedLink}
                graphData={graphData}
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

export default function ExplorePage() {
  return (
    <React.Suspense fallback={<main className="h-screen w-screen bg-bg" />}>
      <ExplorePageContent />
    </React.Suspense>
  );
}
