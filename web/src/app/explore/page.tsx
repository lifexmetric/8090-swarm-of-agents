"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Maximize2,
  FileDown,
  X,
  ShieldAlert,
  Plus,
  Minus,
  MessageSquare,
  GitBranch,
  FolderTree,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
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
import { ATLAS_WORKSPACE_ID, getScan, getScanGraph, getWorkspaceGraph } from "@/lib/api";
import { Graph3D, type Graph3DHandle, type LayoutMode } from "@/components/Graph3D";
import {
  buildSystemGraph,
  getSystemNodeMeta,
  parentSystemScope,
  type SystemProjection,
  type SystemScope,
} from "@/lib/system-view";
import { ChatPanel } from "@/components/ChatPanel";
import { NodePanel } from "@/components/NodePanel";
import { LinkPanel } from "@/components/LinkPanel";
import { Logo, GithubMark, cn } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NODE_ICON } from "@/components/icons";

const ALL_KINDS = Object.keys(NODE_KIND_META) as NodeKind[];
const EMPTY_GRAPH: GraphData = { nodes: [], links: [] };

export default function ExplorePage() {
  return (
    <React.Suspense fallback={<main className="h-screen w-screen bg-bg" />}>
      <ExplorePageContent />
    </React.Suspense>
  );
}

function ExplorePageContent() {
  const graphRef = React.useRef<Graph3DHandle>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scanId");
  const isSystemDetail = Boolean(scanId && searchParams.get("view") === "detail");

  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = React.useState<string | null>(null);
  const [chatOpen, setChatOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeKinds, setActiveKinds] = React.useState<Set<NodeKind>>(new Set(ALL_KINDS));
  const [highRiskOnly, setHighRiskOnly] = React.useState(false);
  const [layoutMode, setLayoutMode] = React.useState<LayoutMode>("hierarchy");
  const [systemScopeState, setSystemScopeState] = React.useState<{
    graphKey: string | null;
    scope: SystemScope;
  }>({ graphKey: null, scope: { repositoryId: null, path: "" } });
  const [groupsOpen, setGroupsOpen] = React.useState(true);
  const [graphLoad, setGraphLoad] = React.useState<{
    key: string;
    graph: GraphData | null;
    repoLabel: string;
    apiNotice: string | null;
  } | null>(null);

  const [nodeHistory, setNodeHistory] = React.useState<GraphNode[]>([]);
  const [panelView, setPanelView] = React.useState<"overview" | "subgraph">("overview");

  React.useEffect(() => {
    let cancelled = false;
    const key = isSystemDetail && scanId
      ? `detail:${scanId}`
      : scanId
        ? `scan:${scanId}`
        : `workspace:${ATLAS_WORKSPACE_ID}`;

    async function load() {
      try {
        if (isSystemDetail && scanId) {
          const [scan, detailGraph] = await Promise.all([getScan(scanId), getScanGraph(scanId)]);
          if (cancelled) return;
          setGraphLoad({
            key,
            graph: detailGraph,
            repoLabel: `${scan.repoUrl.replace(/^https:\/\/github\.com\//, "")} · detail`,
            apiNotice: null,
          });
          return;
        }

        if (scanId) {
          const [scan, scanGraph] = await Promise.all([getScan(scanId), getScanGraph(scanId)]);
          if (cancelled) return;
          setGraphLoad({
            key,
            graph: scanGraph,
            repoLabel: scan.repoUrl.replace(/^https:\/\/github\.com\//, ""),
            apiNotice: scanGraph.nodes.length === 0 ? "Scan completed but no graph nodes were produced." : null,
          });
          return;
        }

        const workspaceGraph = await getWorkspaceGraph();
        if (cancelled) return;
        const repoCount = workspaceGraph.repositories.length;
        setGraphLoad({
          key,
          graph: workspaceGraph.nodes.length > 0 ? workspaceGraph : GRAPH,
          repoLabel: repoCount === 1
            ? workspaceGraph.repositories[0].url.replace(/^https:\/\/github\.com\//, "")
            : repoCount > 1
              ? `${repoCount} repos · workspace:${workspaceGraph.workspaceId}`
              : "demo · acme/payments-platform",
          apiNotice: workspaceGraph.nodes.length > 0 ? null : "No workspace scans yet. Showing the demo graph.",
        });
      } catch (err) {
        if (!cancelled) {
          setGraphLoad({
            key,
            graph: GRAPH,
            repoLabel: scanId ?? "demo · acme/payments-platform",
            apiNotice: err instanceof Error ? `Demo fallback · ${err.message}` : "Demo fallback · unable to load backend graph",
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isSystemDetail, scanId]);

  const graphKey = isSystemDetail && scanId
    ? `detail:${scanId}`
    : scanId
      ? `scan:${scanId}`
      : `workspace:${ATLAS_WORKSPACE_ID}`;
  const activeGraphLoad = graphLoad?.key === graphKey ? graphLoad : null;
  const graph = activeGraphLoad?.graph ?? EMPTY_GRAPH;
  const repoLabel = activeGraphLoad?.repoLabel ?? `workspace:${ATLAS_WORKSPACE_ID}`;
  const displayRepoLabel = isSystemDetail ? repoLabel.replace(/ · detail$/, "") : repoLabel;
  const isGraphLoading = !activeGraphLoad;
  const apiNotice = activeGraphLoad?.apiNotice ?? (isGraphLoading ? "Loading graph..." : null);
  const graphEmpty = Boolean(activeGraphLoad && !activeGraphLoad.apiNotice && graph.nodes.length === 0);

  const systemScope = React.useMemo<SystemScope>(
    () => systemScopeState.graphKey === graphKey
      ? systemScopeState.scope
      : { repositoryId: null, path: "" },
    [graphKey, systemScopeState],
  );

  const systemProjection = React.useMemo<SystemProjection | null>(() => {
    if (layoutMode !== "system") return null;
    return buildSystemGraph(graph, systemScope, {
      repoLabel: displayRepoLabel,
      forceRepositoryLayer: !scanId && !isSystemDetail && !systemScope.repositoryId,
    });
  }, [displayRepoLabel, graph, isSystemDetail, layoutMode, scanId, systemScope]);

  const viewGraph = systemProjection?.graph ?? graph;
  const systemParent = systemProjection ? parentSystemScope(systemProjection) : null;

  const goToSystemScope = React.useCallback((scope: SystemScope) => {
    setSystemScopeState({ graphKey, scope: { repositoryId: scope.repositoryId ?? null, path: scope.path ?? "" } });
    setSelectedNodeId(null);
    setSelectedLinkId(null);
    setNodeHistory([]);
    setPanelView("overview");
  }, [graphKey]);

  const selectNode = React.useCallback((id: string) => {
    setNodeHistory([]);
    setPanelView("overview");
    if (!id) {
      setSelectedNodeId(null);
      setSelectedLinkId(null);
      return;
    }
    setSelectedLinkId(null);
    setSelectedNodeId(id);
  }, []);

  const drillDown = React.useCallback((id: string) => {
    setSelectedNodeId((current) => {
      if (current) {
        const currentNode = nodeById(current, viewGraph);
        if (currentNode) setNodeHistory((h) => [...h, currentNode]);
      }
      return id;
    });
    setPanelView("subgraph");
    setSelectedLinkId(null);
  }, [viewGraph]);

  const goBack = React.useCallback(() => {
    setNodeHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setSelectedNodeId(prev.id);
      setSelectedLinkId(null);
      return h.slice(0, -1);
    });
  }, []);

  const handleDoubleClickNode = React.useCallback((id: string) => {
    const node = nodeById(id, viewGraph);
    if (layoutMode === "system") {
      const meta = getSystemNodeMeta(node);
      if (!meta) {
        if (node) {
          setSelectedNodeId(node.id);
          setSelectedLinkId(null);
          graphRef.current?.focusNode(node.id);
        }
        return;
      }

      setNodeHistory([]);
      setPanelView("overview");
      setSelectedLinkId(null);
      setSelectedNodeId(null);

      if (meta.type === "repo" && meta.scanId && !isSystemDetail) {
        router.push(`/explore?scanId=${encodeURIComponent(meta.scanId)}&view=detail`);
        return;
      }

      if (meta.type === "repo" || meta.type === "folder" || meta.type === "file") {
        setSystemScopeState({ graphKey, scope: { repositoryId: meta.repositoryId, path: meta.path } });
      }
      return;
    }

    const sourceNode = nodeById(id, graph);
    if (!isSystemDetail && sourceNode?.scanId) {
      setNodeHistory([]);
      setSelectedLinkId(null);
      setSelectedNodeId(null);
      router.push(`/explore?scanId=${encodeURIComponent(sourceNode.scanId)}&view=detail`);
      return;
    }

    setNodeHistory([]);
    setSelectedLinkId(null);
    setSelectedNodeId(id);
    setPanelView("subgraph");
    graphRef.current?.focusNode(id);
  }, [graph, graphKey, isSystemDetail, layoutMode, router, viewGraph]);

  const selectLink = React.useCallback((id: string) => {
    setSelectedNodeId(null);
    setSelectedLinkId(id);
  }, []);

  const toggleKind = (k: NodeKind) =>
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
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
        const deps = dependenciesOf(selectedNodeId, viewGraph);
        if (deps.length > 0) {
          const next = deps[0].target;
          setSelectedNodeId(next);
          setSelectedLinkId(null);
          setNodeHistory([]);
          setPanelView("overview");
          graphRef.current?.focusNode(next, { inspect: true });
        }
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        const parents = dependentsOf(selectedNodeId, viewGraph);
        if (parents.length > 0) {
          const prev = parents[0].source;
          setSelectedNodeId(prev);
          setSelectedLinkId(null);
          setNodeHistory([]);
          setPanelView("overview");
          graphRef.current?.focusNode(prev, { inspect: true });
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewGraph, selectedNodeId, selectNode]);

  const filtered: GraphData = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const nodes = viewGraph.nodes.filter((n) => {
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
    return { nodes, links: viewGraph.links.filter((l) => ids.has(l.source) && ids.has(l.target)) };
  }, [viewGraph, query, activeKinds, highRiskOnly]);

  const selectedNode = selectedNodeId ? viewGraph.nodes.find((n) => n.id === selectedNodeId) ?? null : null;
  const selectedLink = selectedLinkId ? viewGraph.links.find((l) => l.id === selectedLinkId) ?? null : null;
  const panelOpen = Boolean(selectedNode || selectedLink);
  const highRiskCount = viewGraph.nodes.filter((n) => n.risks.length > 0).length;
  const exportHref = scanId
    ? `/export?scanId=${encodeURIComponent(scanId)}&repo=${encodeURIComponent(displayRepoLabel)}`
    : "/export";

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-bg">
      <div className="absolute inset-0">
        <Graph3D
          ref={graphRef}
          data={filtered}
          selectedNodeId={selectedNodeId}
          selectedLinkId={selectedLinkId}
          onSelectNode={selectNode}
          onSelectLink={selectLink}
          onDoubleClickNode={handleDoubleClickNode}
          layoutMode={layoutMode}
        />
      </div>

      {(isGraphLoading || apiNotice) && !graphEmpty && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2 px-4">
          <div className="rounded-lg border border-line bg-bg/90 px-4 py-2.5 font-mono text-[12px] text-faint backdrop-blur-sm">
            {apiNotice}
          </div>
        </div>
      )}

      {graphEmpty && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg px-6">
          <div className="max-w-md rounded-lg border border-line bg-surface p-5">
            <p className="mb-2 text-sm font-semibold text-ink">No real scan data yet</p>
            <p className="text-[13px] leading-relaxed text-muted">Run a repository scan to populate the workspace graph.</p>
            <Link href="/" className="mt-4 inline-flex rounded-lg bg-accent px-3 py-1.5 text-[13px] font-semibold text-white">
              Start a scan
            </Link>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
        <div className="pointer-events-auto border-b border-line bg-bg/90 backdrop-blur-sm">
          <div className="mx-auto flex min-h-11 max-w-[1600px] flex-wrap items-center gap-2 px-3 py-2 sm:h-11 sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-0">
            <div className="shrink-0">
              <Logo />
            </div>
            <div className="h-4 w-px bg-line" />
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-faint">
              {isSystemDetail ? (
                <>
                  <Link
                    href="/explore"
                    className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-line px-2 py-1 font-mono text-[12px] text-muted transition-colors duration-150 hover:border-line-2 hover:text-ink"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Workspace
                  </Link>
                  <span className="shrink-0 font-mono text-[12px] text-line-2">/</span>
                  <GithubMark className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden truncate font-mono sm:inline">{displayRepoLabel}</span>
                  <span className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-faint md:inline">
                    Inside system
                  </span>
                </>
              ) : (
                <>
                  <GithubMark className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden truncate font-mono sm:inline">{displayRepoLabel}</span>
                  <span className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-faint md:inline">
                    System map
                  </span>
                </>
              )}
            </div>
            <div className="flex w-full min-w-0 items-center gap-1.5 sm:ml-auto sm:w-auto sm:justify-end sm:gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-line bg-surface sm:flex-none">
                <Search className="ml-2.5 h-3.5 w-3.5 shrink-0 text-faint" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search nodes..."
                  className="w-full min-w-0 bg-transparent py-1.5 pr-2 text-[13px] text-ink placeholder:text-faint focus:outline-none sm:w-48"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear" className="cursor-pointer px-1.5 text-faint hover:text-muted">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="hidden rounded-lg border border-line bg-surface sm:flex">
                <button
                  type="button"
                  onClick={() => graphRef.current?.zoomOut()}
                  aria-label="Zoom out"
                  className="flex h-[29px] w-8 cursor-pointer items-center justify-center border-r border-line text-muted transition-colors duration-150 hover:text-ink"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => graphRef.current?.zoomIn()}
                  aria-label="Zoom in"
                  className="flex h-[29px] w-8 cursor-pointer items-center justify-center border-r border-line text-muted transition-colors duration-150 hover:text-ink"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => { selectNode(""); graphRef.current?.resetView(); }}
                  aria-label="Reset zoom"
                  className="flex h-[29px] cursor-pointer items-center gap-1.5 px-2.5 text-[13px] text-muted transition-colors duration-150 hover:text-ink"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              </div>
              <div
                className="hidden rounded-lg border border-line bg-surface sm:flex"
                title="Switch graph layout"
              >
                <button
                  type="button"
                  onClick={() => setLayoutMode("hierarchy")}
                  aria-label="Hierarchy layout"
                  className={cn(
                    "flex h-[29px] cursor-pointer items-center gap-1.5 border-r border-line px-2.5 text-[12px] transition-colors duration-150",
                    layoutMode === "hierarchy"
                      ? "bg-accent/10 text-accent"
                      : "text-muted hover:text-ink",
                  )}
                >
                  <GitBranch className="h-3 w-3" />
                  <span className="hidden md:inline">{graph.nodes.length > 35 ? "Bands" : "Hierarchy"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLayoutMode("system")}
                  aria-label="System view"
                  className={cn(
                    "flex h-[29px] cursor-pointer items-center gap-1.5 px-2.5 text-[12px] transition-colors duration-150",
                    layoutMode === "system"
                      ? "bg-accent/10 text-accent"
                      : "text-muted hover:text-ink",
                  )}
                >
                  <FolderTree className="h-3 w-3" />
                  <span className="hidden md:inline">System</span>
                </button>
              </div>
              <Link
                href={exportHref}
                aria-label="Export context"
                title="Export context"
                className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-[13px] font-semibold text-white transition-opacity duration-150 hover:opacity-90"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export context</span>
              </Link>
              <button
                type="button"
                aria-label="Open handoff assistant"
                title="Open handoff assistant"
                onClick={() => setChatOpen((value) => !value)}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold transition-colors duration-150",
                  chatOpen
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-line bg-surface text-muted hover:text-ink",
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Handoff</span>
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>

        <div className="pointer-events-auto border-b border-line bg-bg/80 backdrop-blur-sm">
          <div className="mx-auto flex h-9 max-w-[1600px] items-center gap-1.5 overflow-x-auto px-4">
            {ALL_KINDS.map((k) => {
              const meta = NODE_KIND_META[k];
              const Icon = NODE_ICON[k];
              const on = activeKinds.has(k);
              return (
                <button
                  type="button"
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
              type="button"
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
          </div>
        </div>

        {layoutMode === "system" && systemProjection && (
          <div className="pointer-events-auto border-b border-line bg-bg/80 backdrop-blur-sm">
            <div className="mx-auto flex h-9 max-w-[1600px] items-center gap-2 overflow-x-auto px-4">
              <button
                type="button"
                onClick={() => systemParent && goToSystemScope(systemParent)}
                disabled={!systemParent}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12px] text-muted transition-colors duration-150 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="h-3 w-3" />
                Up
              </button>
              <div className="h-4 w-px shrink-0 bg-line" />
              <div className="flex min-w-0 items-center gap-1">
                {systemProjection.breadcrumbs.map((crumb, index) => (
                  <React.Fragment key={`${crumb.scope.repositoryId ?? "workspace"}:${crumb.scope.path ?? ""}:${index}`}>
                    {index > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-faint" />}
                    <button
                      type="button"
                      onClick={() => goToSystemScope(crumb.scope)}
                      className={cn(
                        "max-w-[180px] shrink-0 truncate rounded-md px-2 py-1 font-mono text-[11px] transition-colors duration-150",
                        index === systemProjection.breadcrumbs.length - 1
                          ? "bg-accent/10 text-accent"
                          : "text-muted hover:bg-surface hover:text-ink",
                      )}
                      title={crumb.label}
                    >
                      {crumb.label}
                    </button>
                  </React.Fragment>
                ))}
              </div>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-faint">
                {viewGraph.nodes.length} visible · {viewGraph.links.length} links
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute left-3 top-28 z-20 hidden sm:block">
        {groupsOpen ? (
          <div className="pointer-events-auto w-44 rounded-lg border border-line bg-bg/90 p-2.5 backdrop-blur-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-faint">Groups</p>
              <button
                type="button"
                onClick={() => setGroupsOpen(false)}
                className="flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-line text-faint transition-colors duration-150 hover:text-ink"
                aria-label="Hide groups panel"
                title="Hide groups panel"
              >
                <PanelLeftClose className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-1.5">
              {NODE_GROUPS.map((g) => (
                <div key={g.key} className="group relative flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                  <span className="text-[11px] font-medium" style={{ color: g.color }}>{g.key}</span>
                  <span className="ml-auto font-mono text-[10px] text-faint">
                    {g.key === "Internal" ? "code" : g.key === "Infrastructure" ? "data" : g.key === "External" ? "apis" : "files"}
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
                    <span
                      className="h-0 w-3.5 shrink-0"
                      style={{
                        borderTopWidth: 2,
                        borderTopStyle: EDGE_KIND_META[k].dashed ? "dashed" : "solid",
                        borderTopColor: EDGE_KIND_META[k].color,
                      }}
                    />
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
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setGroupsOpen(true)}
            className="pointer-events-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-bg/90 px-2 py-1.5 font-mono text-[11px] text-muted backdrop-blur-sm transition-colors duration-150 hover:text-ink"
            aria-label="Show groups panel"
            title="Show groups panel"
          >
            <PanelLeftOpen className="h-3 w-3" />
            Groups
          </button>
        )}
      </div>

      {!panelOpen && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
          <div className="rounded-lg border border-line bg-bg/80 px-3.5 py-2 font-mono text-[12px] text-faint backdrop-blur-sm">
            {layoutMode === "system"
              ? "System view · double-click folders/files to enter · use breadcrumb to go back"
              : selectedNodeId
                ? "↑ parent  ↓ next dep  dbl-click sub-graph  Esc deselect"
                : "Top-down flow · drag to pan · scroll to zoom · click any node"}
          </div>
        </div>
      )}

      <div className={cn(
        "pointer-events-none absolute right-3 top-28 z-10 transition-opacity duration-200",
        panelOpen && "opacity-0",
      )}>
        <div className="rounded-lg border border-line bg-bg/90 p-3 backdrop-blur-sm">
          <div className="flex gap-5">
            {[
              { label: "Nodes", value: filtered.nodes.length },
              { label: "Edges", value: filtered.links.length },
              { label: "External Deps", value: filtered.nodes.filter((n) => n.kind === "external").length },
              { label: "Auth", value: filtered.nodes.filter((n) => n.kind === "auth").length },
            ].map((s) => (
              <div key={s.label}>
                <p className="font-mono text-xl font-semibold tabular-nums text-ink">{s.value}</p>
                <p className="font-mono text-[10px] uppercase tracking-wide text-faint">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {panelOpen && (
        <div className="absolute right-0 top-0 z-30 h-full w-full max-w-[400px] border-l border-line">
          <div className="h-full overflow-hidden rounded-l-xl bg-surface animate-slide-right">
            {selectedNode && (
              <NodePanel
                node={selectedNode}
                graphData={viewGraph}
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
                graphData={viewGraph}
                onClose={() => selectNode("")}
                onSelectNode={selectNode}
              />
            )}
          </div>
        </div>
      )}

      <ChatPanel
        open={chatOpen}
        scanId={scanId}
        selectedNode={selectedNode}
        selectedLink={selectedLink}
        detailsOpen={panelOpen}
        onClose={() => setChatOpen(false)}
        onSelectNode={selectNode}
        onSelectLink={selectLink}
      />
    </main>
  );
}
