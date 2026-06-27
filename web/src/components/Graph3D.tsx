"use client";

import * as React from "react";
import {
  EDGE_KIND_META,
  NODE_KIND_META,
  type GraphData,
  type GraphLink,
  type GraphNode,
} from "@/lib/data";
import { colorAlpha } from "./ui";

export interface Graph3DHandle {
  focusNode: (id: string) => void;
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

interface Graph3DProps {
  data: GraphData;
  selectedNodeId: string | null;
  selectedLinkId: string | null;
  onSelectNode: (id: string) => void;
  onSelectLink: (id: string) => void;
  onDoubleClickNode?: (id: string) => void;
  criticalPathMode?: boolean;
  criticalPathNodeIds?: Set<string>;
  criticalPathLinkIds?: Set<string>;
}

type Point = { x: number; y: number };

interface Layout {
  /** node id -> top-left position */
  positions: Map<string, Point>;
  rails: { y: number; label: string }[];
  width: number;
  height: number;
  nodeW: number;
  nodeH: number;
  entryId: string | null;
}

// ── Curated demo layout (kept exactly as-is so the sample story still reads) ──

const DEMO_NODE = { width: 188, height: 62 };

const DEMO_POSITIONS: Record<string, Point> = {
  "api-gateway": { x: 656, y: 150 },
  "auth-layer": { x: 390, y: 320 },
  idp: { x: 125, y: 320 },
  "orders-module": { x: 656, y: 430 },
  rabbitmq: { x: 656, y: 635 },
  "payments-service": { x: 656, y: 860 },
  redis: { x: 390, y: 860 },
  "env-config": { x: 955, y: 860 },
  "ledger-service": { x: 390, y: 1110 },
  "rbc-rail-adapter": { x: 656, y: 1110 },
  stripe: { x: 955, y: 1110 },
  plaid: { x: 125, y: 1110 },
  postgres: { x: 390, y: 1360 },
  kafka: { x: 955, y: 1360 },
  "notification-service": { x: 955, y: 1570 },
  sendgrid: { x: 1220, y: 1570 },
};

const DEMO_RAILS = [
  { y: 120, label: "Ingress" },
  { y: 390, label: "Validation" },
  { y: 610, label: "Queue" },
  { y: 835, label: "Core processing" },
  { y: 1085, label: "Rails + ledger" },
  { y: 1340, label: "Storage + events" },
  { y: 1550, label: "Notifications" },
];

const DEMO_ENTRY = "api-gateway";

function buildDemoLayout(data: GraphData): Layout {
  const positions = new Map<string, Point>();
  data.nodes.forEach((n) => {
    const p = DEMO_POSITIONS[n.id];
    if (p) positions.set(n.id, p);
  });
  return {
    positions,
    rails: DEMO_RAILS,
    width: 1500,
    height: 1840,
    nodeW: DEMO_NODE.width,
    nodeH: DEMO_NODE.height,
    entryId: DEMO_ENTRY,
  };
}

// ── Auto layout for real scans: clean top-down layered (Sugiyama-lite) ──

const AUTO = {
  nodeW: 182,
  nodeH: 52,
  colGap: 44,
  layerGap: 150,
  subRowGap: 74,
  maxPerRow: 8,
  marginX: 96,
  marginTop: 104,
};

function dominantGroup(nodes: GraphNode[]): string {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    const g = NODE_KIND_META[n.kind].group;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let best = "";
  let bestN = -1;
  for (const [g, c] of counts) {
    if (c > bestN) {
      best = g;
      bestN = c;
    }
  }
  return best;
}

function buildAutoLayout(data: GraphData): Layout {
  const nodes = data.nodes;
  if (nodes.length === 0) {
    return { positions: new Map(), rails: [], width: 1200, height: 700, nodeW: AUTO.nodeW, nodeH: AUTO.nodeH, entryId: null };
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ids = new Set(nodes.map((n) => n.id));
  const out = new Map<string, string[]>();
  const inc = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  nodes.forEach((n) => {
    out.set(n.id, []);
    inc.set(n.id, []);
    indeg.set(n.id, 0);
  });
  for (const l of data.links) {
    if (!ids.has(l.source) || !ids.has(l.target) || l.source === l.target) continue;
    out.get(l.source)!.push(l.target);
    inc.get(l.target)!.push(l.source);
    indeg.set(l.target, (indeg.get(l.target) ?? 0) + 1);
  }

  // Longest-path layering via Kahn topological processing.
  const layer = new Map<string, number>();
  nodes.forEach((n) => layer.set(n.id, 0));
  const work = new Map(indeg);
  const queue: string[] = [];
  nodes.forEach((n) => {
    if ((work.get(n.id) ?? 0) === 0) queue.push(n.id);
  });
  if (queue.length === 0) {
    // Fully cyclic — seed with the highest fan-out node.
    let seed = nodes[0].id;
    let best = -1;
    for (const n of nodes) {
      const d = out.get(n.id)!.length;
      if (d > best) {
        best = d;
        seed = n.id;
      }
    }
    queue.push(seed);
  }
  const seen = new Set(queue);
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    for (const v of out.get(u)!) {
      if (layer.get(v)! < layer.get(u)! + 1) layer.set(v, layer.get(u)! + 1);
      const d = (work.get(v) ?? 0) - 1;
      work.set(v, d);
      if (d <= 0 && !seen.has(v)) {
        seen.add(v);
        queue.push(v);
      }
    }
  }
  // Nodes stuck in cycles: rank just below their deepest in-neighbor.
  for (const n of nodes) {
    if (!seen.has(n.id)) {
      const mx = inc.get(n.id)!.reduce((m, s) => Math.max(m, layer.get(s) ?? 0), 0);
      layer.set(n.id, mx + 1);
    }
  }

  const maxLayer = Math.max(...nodes.map((n) => layer.get(n.id)!));
  const byLayer: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  const nodeOrder = new Map(nodes.map((n, i) => [n.id, i]));
  for (const n of nodes) byLayer[layer.get(n.id)!].push(n.id);

  // Order within each layer by the barycenter of already-placed neighbors to
  // reduce edge crossings (one stable top-down pass).
  const orderIndex = new Map<string, number>();
  byLayer.forEach((rowIds, li) => {
    rowIds.sort((a, b) => {
      const ba = barycenter(a);
      const bb = barycenter(b);
      if (ba !== bb) return ba - bb;
      return (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0);
    });
    rowIds.forEach((id, i) => orderIndex.set(id, i));

    function barycenter(id: string): number {
      if (li === 0) {
        // First row: group similar kinds together for a calm top edge.
        return NODE_KIND_META[byId.get(id)!.kind].group.charCodeAt(0);
      }
      const neighbors = inc.get(id)!.filter((s) => orderIndex.has(s));
      if (neighbors.length === 0) return Number.MAX_SAFE_INTEGER / 2;
      return neighbors.reduce((sum, s) => sum + orderIndex.get(s)!, 0) / neighbors.length;
    }
  });

  const maxCols = Math.min(AUTO.maxPerRow, Math.max(...byLayer.map((r) => r.length)));
  const contentW = maxCols * AUTO.nodeW + (maxCols - 1) * AUTO.colGap;
  const positions = new Map<string, Point>();
  const rails: { y: number; label: string }[] = [];

  let y = AUTO.marginTop;
  byLayer.forEach((rowIds) => {
    if (rowIds.length === 0) return;
    rails.push({ y: y - 30, label: dominantGroup(rowIds.map((id) => byId.get(id)!)) });
    const perRow = Math.min(AUTO.maxPerRow, rowIds.length);
    const subRows = Math.ceil(rowIds.length / perRow);
    for (let r = 0; r < subRows; r++) {
      const slice = rowIds.slice(r * perRow, (r + 1) * perRow);
      const rowW = slice.length * AUTO.nodeW + (slice.length - 1) * AUTO.colGap;
      const startX = AUTO.marginX + (contentW - rowW) / 2;
      const rowY = y + r * AUTO.subRowGap;
      slice.forEach((id, i) => {
        positions.set(id, { x: startX + i * (AUTO.nodeW + AUTO.colGap), y: rowY });
      });
    }
    y += (subRows - 1) * AUTO.subRowGap + AUTO.layerGap;
  });

  // Entry = the highest fan-out node on the top layer (usually the repo root).
  let entryId: string | null = null;
  let bestOut = -1;
  for (const id of byLayer[0] ?? []) {
    const d = out.get(id)!.length;
    if (d > bestOut) {
      bestOut = d;
      entryId = id;
    }
  }

  return {
    positions,
    rails,
    width: contentW + AUTO.marginX * 2,
    height: y - AUTO.layerGap + AUTO.marginTop + AUTO.nodeH,
    nodeW: AUTO.nodeW,
    nodeH: AUTO.nodeH,
    entryId,
  };
}

function linkPath(source: Point, target: Point): string {
  const dy = Math.max(70, Math.abs(target.y - source.y) * 0.46);
  const c1 = { x: source.x, y: source.y + dy };
  const c2 = { x: target.x, y: target.y - dy };
  return `M ${source.x} ${source.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${target.x} ${target.y}`;
}

export const Graph3D = React.forwardRef<Graph3DHandle, Graph3DProps>(
  function Graph3D(
    {
      data,
      selectedNodeId,
      selectedLinkId,
      onSelectNode,
      onSelectLink,
      onDoubleClickNode,
      criticalPathMode = false,
      criticalPathNodeIds,
      criticalPathLinkIds,
    },
    ref,
  ) {
    const [size, setSize] = React.useState({ w: 0, h: 0 });
    const [view, setView] = React.useState({ x: 0, y: 0, scale: 0.72 });
    const [smooth, setSmooth] = React.useState(true);
    const dragRef = React.useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        const r = entries[0].contentRect;
        setSize({ w: r.width, h: r.height });
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // ── Layout: curated for the demo graph, auto-layered for real scans ──
    const layout = React.useMemo<Layout>(() => {
      const isDemo =
        data.nodes.length > 0 && data.nodes.every((n) => DEMO_POSITIONS[n.id]);
      return isDemo ? buildDemoLayout(data) : buildAutoLayout(data);
    }, [data]);

    const centerOf = React.useCallback(
      (id: string): Point | null => {
        const p = layout.positions.get(id);
        if (!p) return null;
        return { x: p.x + layout.nodeW / 2, y: p.y + layout.nodeH / 2 };
      },
      [layout],
    );

    // Pre-computed degree map (avoids per-render filtering across all links).
    const degree = React.useMemo(() => {
      const m = new Map<string, { in: number; out: number }>();
      data.nodes.forEach((n) => m.set(n.id, { in: 0, out: 0 }));
      for (const l of data.links) {
        const s = m.get(l.source);
        const t = m.get(l.target);
        if (s) s.out += 1;
        if (t) t.in += 1;
      }
      return m;
    }, [data]);

    const { hlNodes, hlLinks } = React.useMemo(() => {
      if (criticalPathMode && criticalPathNodeIds && criticalPathLinkIds) {
        return { hlNodes: criticalPathNodeIds, hlLinks: criticalPathLinkIds };
      }
      const nodes = new Set<string>();
      const links = new Set<string>();
      if (selectedLinkId) {
        const l = data.links.find((x) => x.id === selectedLinkId);
        if (l) {
          links.add(l.id);
          nodes.add(l.source);
          nodes.add(l.target);
        }
      } else if (selectedNodeId) {
        nodes.add(selectedNodeId);
        for (const l of data.links) {
          if (l.source === selectedNodeId || l.target === selectedNodeId) {
            links.add(l.id);
            nodes.add(l.source);
            nodes.add(l.target);
          }
        }
      }
      return { hlNodes: nodes, hlLinks: links };
    }, [data, selectedNodeId, selectedLinkId, criticalPathMode, criticalPathNodeIds, criticalPathLinkIds]);

    const hasSelection = hlNodes.size > 0 || criticalPathMode;
    const showEntryPulse = !hasSelection;

    const focusNode = React.useCallback(
      (id: string) => {
        const center = centerOf(id);
        if (!center || size.w === 0 || size.h === 0) return;
        setSmooth(true);
        setView((current) => ({
          ...current,
          x: size.w / 2 - center.x * current.scale,
          y: size.h / 2 - center.y * current.scale,
        }));
      },
      [centerOf, size.h, size.w],
    );

    const fitView = React.useCallback(() => {
      if (size.w === 0 || size.h === 0) return;
      const scale = Math.min(1.02, Math.max(0.5, (size.w / layout.width) * 0.92));
      setSmooth(true);
      setView({
        scale,
        x: (size.w - layout.width * scale) / 2,
        y: 104,
      });
    }, [layout.width, size.h, size.w]);

    React.useImperativeHandle(ref, () => ({
      focusNode,
      zoomIn: () => {
        if (size.w === 0 || size.h === 0) return;
        const nextScale = Math.min(1.6, view.scale * 1.16);
        setSmooth(true);
        setView({
          scale: nextScale,
          x: size.w / 2 - ((size.w / 2 - view.x) / view.scale) * nextScale,
          y: size.h / 2 - ((size.h / 2 - view.y) / view.scale) * nextScale,
        });
      },
      zoomOut: () => {
        if (size.w === 0 || size.h === 0) return;
        const nextScale = Math.max(0.3, view.scale / 1.16);
        setSmooth(true);
        setView({
          scale: nextScale,
          x: size.w / 2 - ((size.w / 2 - view.x) / view.scale) * nextScale,
          y: size.h / 2 - ((size.h / 2 - view.y) / view.scale) * nextScale,
        });
      },
      resetView: fitView,
    }));

    React.useEffect(() => {
      fitView();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layout, size.w, size.h]);

    function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
      event.preventDefault();
      if (smooth) setSmooth(false);
      const nextScale = Math.min(1.6, Math.max(0.3, view.scale - event.deltaY * 0.0012));
      const rect = event.currentTarget.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const graphX = (mx - view.x) / view.scale;
      const graphY = (my - view.y) / view.scale;
      setView({
        scale: nextScale,
        x: mx - graphX * nextScale,
        y: my - graphY * nextScale,
      });
    }

    function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
      if ((event.target as HTMLElement).closest("[data-graph-control]")) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setSmooth(false);
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        baseX: view.x,
        baseY: view.y,
      };
    }

    function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
      const drag = dragRef.current;
      if (!drag) return;
      const nx = drag.baseX + event.clientX - drag.startX;
      const ny = drag.baseY + event.clientY - drag.startY;
      setView((current) => (current.x === nx && current.y === ny ? current : { ...current, x: nx, y: ny }));
    }

    function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
      if (dragRef.current) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      dragRef.current = null;
    }

    const visibleLinks = React.useMemo(
      () =>
        data.links
          .map((link) => {
            const source = centerOf(link.source);
            const target = centerOf(link.target);
            if (!source || !target) return null;
            return { link, source, target };
          })
          .filter(Boolean) as Array<{ link: GraphLink; source: Point; target: Point }>,
      [data.links, centerOf],
    );

    const entryCenter = layout.entryId ? centerOf(layout.entryId) : null;
    const entryTopLeft = layout.entryId ? layout.positions.get(layout.entryId) : undefined;

    // Memoized scene: stable element references let React skip reconciling all
    // nodes/edges while only the transform (view) changes during pan/zoom.
    const railsEl = React.useMemo(
      () =>
        layout.rails.map((rail, i) => (
          <g key={`${rail.label}-${i}`}>
            <line
              x1={64}
              y1={rail.y}
              x2={layout.width - 64}
              y2={rail.y}
              stroke="var(--color-surface-2)"
              strokeWidth={1}
            />
            <rect
              x={64}
              y={rail.y - 20}
              width={rail.label.length * 7.4 + 12}
              height={15}
              fill="var(--color-bg)"
              rx={2}
            />
            <text
              x={70}
              y={rail.y - 9}
              fill="var(--color-line-2)"
              fontSize={10}
              fontFamily="var(--font-mono)"
              letterSpacing="0.08em"
            >
              {rail.label.toUpperCase()}
            </text>
          </g>
        )),
      [layout.rails, layout.width],
    );

    const edgesEl = React.useMemo(
      () =>
        visibleLinks.map(({ link, source, target }) => {
          const meta = EDGE_KIND_META[link.kind];
          const active = hlLinks.has(link.id);
          const dim = hasSelection && !active;
          const isCritical = criticalPathMode && active;
          const path = linkPath(source, target);
          const width = active ? 2.2 + link.criticality * 0.18 : 1.1;
          const strokeColor = dim ? "var(--color-graph-dim)" : isCritical ? "var(--color-err)" : meta.color;
          return (
            <g key={link.id} data-graph-control="true">
              {active && (
                <path
                  d={path}
                  fill="none"
                  stroke={isCritical ? "var(--color-err)" : meta.color}
                  strokeWidth={14}
                  strokeOpacity={0.5}
                  strokeLinecap="round"
                  filter="url(#dependencyGlow)"
                />
              )}
              <path
                d={path}
                fill="none"
                stroke={strokeColor}
                strokeWidth={isCritical ? width + 0.6 : width}
                strokeOpacity={dim ? 0.12 : active ? 0.95 : 0.34}
                strokeDasharray={meta.dashed ? "8 7" : undefined}
                strokeLinecap="round"
                markerEnd={active ? (isCritical ? "url(#arrow-critical)" : "url(#arrow)") : undefined}
                className="cursor-pointer transition-opacity duration-150"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectLink(link.id);
                }}
              />
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                className="cursor-pointer"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectLink(link.id);
                }}
              />
            </g>
          );
        }),
      [visibleLinks, hlLinks, hasSelection, criticalPathMode, onSelectLink],
    );

    const nodesEl = React.useMemo(
      () =>
        data.nodes.map((node) => {
          const position = layout.positions.get(node.id);
          if (!position) return null;
          const meta = NODE_KIND_META[node.kind];
          const isSelected = selectedNodeId === node.id;
          const active = isSelected || hlNodes.has(node.id);
          const dim = hasSelection && !active;
          const deg = degree.get(node.id) ?? { in: 0, out: 0 };
          const isCritical = criticalPathMode && active;
          const isEntry = node.id === layout.entryId;
          return (
            <button
              key={node.id}
              data-graph-control="true"
              onClick={(event) => {
                event.stopPropagation();
                onSelectNode(node.id);
                focusNode(node.id);
              }}
              onDoubleClick={(event) => {
                event.stopPropagation();
                onDoubleClickNode?.(node.id);
              }}
              className="absolute cursor-pointer rounded-lg border bg-bg-2 px-3 py-2 text-left transition-[border-color,background-color,opacity,box-shadow] duration-150 hover:bg-surface"
              style={{
                left: position.x,
                top: position.y,
                width: layout.nodeW,
                minHeight: layout.nodeH,
                borderColor: isCritical
                  ? "var(--color-err)"
                  : active
                  ? meta.color
                  : "var(--color-line)",
                opacity: dim ? 0.28 : 1,
                boxShadow: isCritical
                  ? "0 0 28px color-mix(in srgb, var(--color-err) 33%, transparent)"
                  : active
                  ? `0 0 24px ${colorAlpha(meta.color, 20)}`
                  : "none",
              }}
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: isCritical ? "var(--color-err)" : meta.color }}
                />
                <span className="truncate font-mono text-[12px] font-semibold text-ink">
                  {node.label}
                </span>
                {isEntry && !hasSelection && (
                  <span className="ml-auto shrink-0 rounded border border-accent/30 bg-accent/10 px-1 font-mono text-[9px] text-accent">
                    entry
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] uppercase tracking-wide text-faint">
                  {meta.group}
                </span>
                <span className="font-mono text-[10px] text-faint">
                  {deg.in} in · {deg.out} out
                </span>
              </div>
              {isSelected && (
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] text-line-2">
                  dbl-click to explore connections
                </div>
              )}
            </button>
          );
        }),
      [
        data.nodes,
        layout,
        hlNodes,
        hasSelection,
        criticalPathMode,
        degree,
        selectedNodeId,
        onSelectNode,
        onDoubleClickNode,
        focusNode,
      ],
    );

    return (
      <div
        ref={containerRef}
        className="relative h-full w-full cursor-grab overflow-hidden bg-bg active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={() => onSelectNode("")}
      >
        {/* Dot grid background */}
        <div className="graph-grid pointer-events-none absolute inset-0" />

        <div
          className="absolute left-0 top-0 origin-top-left will-change-transform"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
            transition: smooth ? "transform 180ms ease-out" : "none",
          }}
        >
          <svg
            className="absolute inset-0 overflow-visible"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden="true"
          >
            <defs>
              <filter id="dependencyGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <marker
                id="arrow"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-faint)" />
              </marker>
              <marker
                id="arrow-critical"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-err)" />
              </marker>
            </defs>

            {/* ── Flow rail labels ── */}
            {railsEl}

            {/* ── Entry-point pulse ring (shown when nothing selected) ── */}
            {showEntryPulse && entryCenter && entryTopLeft && (
              <g>
                <circle
                  cx={entryCenter.x}
                  cy={entryCenter.y}
                  r={66}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth={1.4}
                  opacity={0}
                >
                  <animate attributeName="r" values="66;96;66" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.45;0;0.45" dur="3s" repeatCount="indefinite" />
                </circle>
                <text
                  x={entryCenter.x}
                  y={entryTopLeft.y + layout.nodeH + 18}
                  textAnchor="middle"
                  fill="var(--color-accent)"
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                  letterSpacing="0.1em"
                  opacity={0.7}
                >
                  ↑ start here
                </text>
              </g>
            )}

            {/* ── Edges ── */}
            {edgesEl}
          </svg>

          {/* ── Nodes ── */}
          {nodesEl}
        </div>
      </div>
    );
  },
);
