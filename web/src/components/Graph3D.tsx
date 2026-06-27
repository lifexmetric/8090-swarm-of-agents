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
  layoutMode?: LayoutMode;
}

export type LayoutMode = "hierarchy" | "flow";

type Point = { x: number; y: number };

interface Layout {
  /** node id -> top-left position */
  positions: Map<string, Point>;
  rails: { y: number; label: string; color?: string }[];
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

// ── Domain swimlane palette ─────────────────────────────────────────────────

const DOMAIN_COLORS: Record<string, string> = {
  Channels:           "#7c3aed",
  Identity:           "#0ea5e9",
  "Ledger Domain":    "#10b981",
  "Payments Rails":   "#f59e0b",
  "Risk & Compliance":"#ef4444",
  "Data Platform":    "#8b5cf6",
  "Platform Services":"#6366f1",
  Regions:            "#14b8a6",
  Messaging:          "#f97316",
  Infrastructure:     "#64748b",
  System:             "#a78bfa",
  "Scoped Repository":"#a78bfa",
  Repository:         "#a78bfa",
  External:           "#d97706",
  Data:               "#10b981",
  Service:            "#7c3aed",
  API:                "#0ea5e9",
  Code:               "#94a3b8",
  Configuration:      "#64748b",
  "Imported package": "#d97706",
};

export function domainColor(domain: string): string {
  return DOMAIN_COLORS[domain] ?? "#6b7280";
}

// ── Tier ordering for domain-band layout ─────────────────────────────────────

const DOMAIN_TIER: Record<string, number> = {
  System: 0, "Scoped Repository": 0, Repository: 0,
  Channels: 1, API: 2,
  Identity: 3,
  "Ledger Domain": 4,
  "Payments Rails": 5,
  "Risk & Compliance": 6,
  "Data Platform": 7,
  "Platform Services": 8,
  Regions: 9,
  Messaging: 10, Infrastructure: 11,
  Data: 12, Configuration: 13, External: 14,
  Code: 15, Service: 16, "Imported package": 17,
};

function domainTier(domain: string): number {
  return DOMAIN_TIER[domain] ?? 99;
}

// ── Compact domain-band layout (used when node count > BAND_THRESHOLD) ───────

const BAND = {
  chipW: 152,
  chipH: 30,
  chipGapX: 8,
  chipGapY: 6,
  domainPadX: 14,
  domainPadTop: 28, // room for domain label
  domainPadBot: 10,
  domainGap: 20,
  cols: 6,          // max chips per row within a domain band
  marginX: 32,
  marginTop: 48,
};

const BAND_THRESHOLD = 35; // switch to band layout above this node count

interface Swimlane {
  domain: string;
  color: string;
  y: number;
  height: number;
}

interface BandLayout extends Layout {
  swimlanes: Swimlane[];
  layoutMode: "band";
}

function buildBandLayout(data: GraphData): BandLayout {
  const empty: BandLayout = {
    positions: new Map(), rails: [], swimlanes: [], width: 1200, height: 700,
    nodeW: BAND.chipW, nodeH: BAND.chipH, entryId: null, layoutMode: "band",
  };
  if (data.nodes.length === 0) return empty;

  // Group nodes by domain, sorted by tier then label.
  const byDomain = new Map<string, GraphNode[]>();
  for (const n of data.nodes) {
    const d = n.domain ?? "Service";
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d)!.push(n);
  }
  // Sort domains by tier.
  const domains = Array.from(byDomain.keys()).sort((a, b) => domainTier(a) - domainTier(b));

  const positions = new Map<string, Point>();
  const swimlanes: Swimlane[] = [];

  // How wide is the band content area?
  const bandContentW = BAND.cols * BAND.chipW + (BAND.cols - 1) * BAND.chipGapX + BAND.domainPadX * 2;
  const totalW = bandContentW + BAND.marginX * 2;

  let curY = BAND.marginTop;

  // Entry: node with most out-edges.
  const outDeg = new Map<string, number>();
  for (const l of data.links) outDeg.set(l.source, (outDeg.get(l.source) ?? 0) + 1);
  let entryId: string | null = null;
  let bestOut = -1;

  for (const domain of domains) {
    const nodes = byDomain.get(domain)!.sort((a, b) => {
      // Services first, then sort by label.
      const k = (n: GraphNode) => (n.kind === "service" ? 0 : 1);
      return k(a) - k(b) || a.label.localeCompare(b.label);
    });
    const color = domainColor(domain);
    const cols = Math.min(BAND.cols, nodes.length);
    const rows = Math.ceil(nodes.length / cols);
    const bandH = BAND.domainPadTop + rows * BAND.chipH + (rows - 1) * BAND.chipGapY + BAND.domainPadBot;

    swimlanes.push({ domain, color, y: curY, height: bandH });

    const startX = BAND.marginX + BAND.domainPadX;
    nodes.forEach((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (BAND.chipW + BAND.chipGapX);
      const y = curY + BAND.domainPadTop + row * (BAND.chipH + BAND.chipGapY);
      positions.set(n.id, { x, y });

      const od = outDeg.get(n.id) ?? 0;
      if (od > bestOut) { bestOut = od; entryId = n.id; }
    });

    curY += bandH + BAND.domainGap;
  }

  const totalH = curY - BAND.domainGap + BAND.marginTop;

  return {
    positions, rails: [], swimlanes,
    width: totalW, height: totalH,
    nodeW: BAND.chipW, nodeH: BAND.chipH,
    entryId, layoutMode: "band",
  };
}

// ── Dagre hierarchical layout (small/medium graphs) ──────────────────────────

import dagre from "dagre";

const DAGRE = {
  nodeW: 160,
  nodeH: 44,
  rankSep: 72,
  nodeSep: 20,
  marginX: 48,
  marginTop: 56,
};

interface DagreLayout extends Layout {
  swimlanes: Swimlane[];
  layoutMode: "dagre";
}

function buildDagreLayout(data: GraphData): DagreLayout {
  const empty: DagreLayout = {
    positions: new Map(), rails: [], swimlanes: [], width: 1200, height: 700,
    nodeW: DAGRE.nodeW, nodeH: DAGRE.nodeH, entryId: null, layoutMode: "dagre",
  };
  if (data.nodes.length === 0) return empty;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    ranksep: DAGRE.rankSep,
    nodesep: DAGRE.nodeSep,
    marginx: DAGRE.marginX,
    marginy: DAGRE.marginTop,
    acyclicer: "greedy",
    ranker: "network-simplex",
  });

  const ids = new Set(data.nodes.map((n) => n.id));
  for (const n of data.nodes) {
    g.setNode(n.id, { width: DAGRE.nodeW, height: DAGRE.nodeH, label: n.label });
  }
  for (const l of data.links) {
    if (ids.has(l.source) && ids.has(l.target) && l.source !== l.target) {
      g.setEdge(l.source, l.target);
    }
  }

  dagre.layout(g);

  const positions = new Map<string, Point>();
  for (const n of data.nodes) {
    const pos = g.node(n.id);
    if (pos) {
      positions.set(n.id, { x: pos.x - DAGRE.nodeW / 2, y: pos.y - DAGRE.nodeH / 2 });
    }
  }

  const graphObj = g.graph() as { width?: number; height?: number };
  const totalW = (graphObj.width ?? 1200) + DAGRE.marginX * 2;
  const totalH = (graphObj.height ?? 700) + DAGRE.marginTop * 2;

  // Build swimlanes: group nodes by domain, compute bounding box per domain.
  const domainBounds = new Map<string, { minY: number; maxY: number; color: string }>();
  for (const n of data.nodes) {
    const p = positions.get(n.id);
    if (!p) continue;
    const domain = n.domain ?? "Service";
    const color = domainColor(domain);
    const existing = domainBounds.get(domain);
    if (!existing) {
      domainBounds.set(domain, { minY: p.y, maxY: p.y + DAGRE.nodeH, color });
    } else {
      existing.minY = Math.min(existing.minY, p.y);
      existing.maxY = Math.max(existing.maxY, p.y + DAGRE.nodeH);
    }
  }

  const PAD = 18;
  const swimlanes: Swimlane[] = Array.from(domainBounds.entries())
    .sort((a, b) => a[1].minY - b[1].minY)
    .map(([domain, bounds]) => ({
      domain,
      color: bounds.color,
      y: bounds.minY - PAD,
      height: bounds.maxY - bounds.minY + PAD * 2,
    }));

  // Rail labels — one per domain lane.
  const rails = swimlanes.map((lane) => ({
    y: lane.y + 2,
    label: lane.domain,
    color: lane.color,
  }));

  // Entry = node with most outgoing edges (usually the gateway/root).
  let entryId: string | null = null;
  let bestOut = -1;
  const outDeg = new Map<string, number>();
  for (const l of data.links) {
    if (ids.has(l.source)) outDeg.set(l.source, (outDeg.get(l.source) ?? 0) + 1);
  }
  for (const [id, count] of outDeg) {
    if (count > bestOut) { bestOut = count; entryId = id; }
  }

  return { positions, rails, swimlanes, width: totalW, height: totalH, nodeW: DAGRE.nodeW, nodeH: DAGRE.nodeH, entryId, layoutMode: "dagre" };
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

  const layer = new Map<string, number>();
  nodes.forEach((n) => layer.set(n.id, 0));
  const work = new Map(indeg);
  const queue: string[] = [];
  nodes.forEach((n) => {
    if ((work.get(n.id) ?? 0) === 0) queue.push(n.id);
  });
  if (queue.length === 0) {
    let seed = nodes[0].id;
    let best = -1;
    for (const n of nodes) {
      const d = out.get(n.id)!.length;
      if (d > best) { best = d; seed = n.id; }
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
      if (d <= 0 && !seen.has(v)) { seen.add(v); queue.push(v); }
    }
  }
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
      if (li === 0) return NODE_KIND_META[byId.get(id)!.kind].group.charCodeAt(0);
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

  let entryId: string | null = null;
  let bestOut = -1;
  for (const id of byLayer[0] ?? []) {
    const d = out.get(id)!.length;
    if (d > bestOut) { bestOut = d; entryId = id; }
  }

  return {
    positions, rails,
    width: contentW + AUTO.marginX * 2,
    height: y - AUTO.layerGap + AUTO.marginTop + AUTO.nodeH,
    nodeW: AUTO.nodeW, nodeH: AUTO.nodeH, entryId,
  };
}

function linkPath(source: Point, target: Point): string {
  const dy = Math.max(40, Math.abs(target.y - source.y) * 0.46);
  const c1 = { x: source.x, y: source.y + dy };
  const c2 = { x: target.x, y: target.y - dy };
  return `M ${source.x} ${source.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${target.x} ${target.y}`;
}

function drawLinkOnCanvas(
  ctx: CanvasRenderingContext2D,
  source: Point,
  target: Point,
  color: string,
  width: number,
  opacity: number,
  dashed: boolean,
) {
  const dy = Math.max(40, Math.abs(target.y - source.y) * 0.46);
  ctx.beginPath();
  ctx.moveTo(source.x, source.y);
  ctx.bezierCurveTo(source.x, source.y + dy, target.x, target.y - dy, target.x, target.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.globalAlpha = opacity;
  ctx.setLineDash(dashed ? [6, 5] : []);
  ctx.stroke();

  // Arrow tip
  const ex = target.x;
  const ey = target.y;
  const angle = Math.atan2(ey - (target.y - dy), ex - target.x);
  const aSize = Math.max(4, width * 2.6);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - aSize * Math.cos(angle - 0.45), ey - aSize * Math.sin(angle - 0.45));
  ctx.lineTo(ex - aSize * Math.cos(angle + 0.45), ey - aSize * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;
  ctx.fill();
}

// Parse a CSS variable colour as a hex/rgb string for canvas.
// We keep a tiny cache so the DOM lookup only happens once per colour token.
const _cssColorCache = new Map<string, string>();
function resolveCssColor(colorToken: string, el: Element): string {
  if (!colorToken.startsWith("var(")) return colorToken;
  const cached = _cssColorCache.get(colorToken);
  if (cached) return cached;
  const varName = colorToken.slice(4, -1).trim();
  const resolved = getComputedStyle(el).getPropertyValue(varName).trim() || "#888";
  _cssColorCache.set(colorToken, resolved);
  return resolved;
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
      layoutMode = "hierarchy",
    },
    ref,
  ) {
    const [size, setSize] = React.useState({ w: 0, h: 0 });
    const [view, setView] = React.useState({ x: 0, y: 0, scale: 0.72 });
    const [smooth, setSmooth] = React.useState(true);
    // Viewport used for node culling — updated lazily (not on every pan frame)
    const [cullViewport, setCullViewport] = React.useState<{ l: number; t: number; r: number; b: number } | null>(null);
    const cullTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const isDraggingRef = React.useRef(false);
    const dragRef = React.useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const rafRef = React.useRef<number>(0);
    const canvasSizeRef = React.useRef({ w: 0, h: 0 }); // avoid GPU re-upload when size unchanged
    const dprRef = React.useRef(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

    React.useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        const r = entries[0].contentRect;
        setSize({ w: r.width, h: r.height });
        // Re-cache DPR on resize (handles window moving between displays).
        dprRef.current = window.devicePixelRatio || 1;
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // Passive wheel listener — lets compositor thread handle scroll without blocking.
    React.useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      function onWheel(e: WheelEvent) {
        e.preventDefault();
        if (smooth) setSmooth(false);
        const nextScale = Math.min(1.6, Math.max(0.18, view.scale - e.deltaY * 0.0012));
        const rect = el!.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const gx = (mx - view.x) / view.scale;
        const gy = (my - view.y) / view.scale;
        setView({ scale: nextScale, x: mx - gx * nextScale, y: my - gy * nextScale });
      }
      // { passive: false } is needed to call preventDefault(), but we register
      // on the element directly (not via React) so we can mark it non-passive.
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    // Intentional: capture view/smooth in closure; effect re-registers when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, smooth]);

    // Lazily update cull viewport — during active drag use stale bounds.
    // This prevents React from re-rendering 114 node divs on every animation frame.
    React.useEffect(() => {
      clearTimeout(cullTimerRef.current);
      if (isDraggingRef.current) return; // skip during drag — canvas still redraws, nodes don't
      const CULL_PAD = 40;
      cullTimerRef.current = setTimeout(() => {
        if (size.w === 0) return;
        setCullViewport({
          l: -view.x / view.scale - CULL_PAD,
          t: -view.y / view.scale - CULL_PAD,
          r: (-view.x + size.w) / view.scale + CULL_PAD,
          b: (-view.y + size.h) / view.scale + CULL_PAD,
        });
      }, 60); // 60 ms after movement stops
      return () => clearTimeout(cullTimerRef.current);
    }, [view, size]);

    // ── Layout: curated demo, band (large), dagre (small-medium), or flow ──
    const layout = React.useMemo<Layout>(() => {
      const isDemo = data.nodes.length > 0 && data.nodes.every((n) => DEMO_POSITIONS[n.id]);
      if (isDemo) return buildDemoLayout(data);
      if (layoutMode === "hierarchy") {
        return data.nodes.length > BAND_THRESHOLD
          ? buildBandLayout(data)
          : buildDagreLayout(data);
      }
      return buildAutoLayout(data);
    }, [data, layoutMode]);

    const swimlanes: Swimlane[] = (layout as DagreLayout | BandLayout).swimlanes ?? [];

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
      // Fit both width and height so nothing is off-screen on first load.
      const scaleX = (size.w / layout.width) * 0.94;
      const scaleY = ((size.h - 96) / layout.height) * 0.94;
      const scale = Math.min(1.02, Math.max(0.18, Math.min(scaleX, scaleY)));
      setSmooth(true);
      setView({
        scale,
        x: (size.w - layout.width * scale) / 2,
        y: 56,
      });
    }, [layout.width, layout.height, size.h, size.w]);

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

    // Wheel is registered as a native non-passive listener above — no React handler needed.

    function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
      if ((event.target as HTMLElement).closest("[data-graph-control]")) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setSmooth(false);
      isDraggingRef.current = true;
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
      isDraggingRef.current = false;
      // Trigger a cull update now that drag has ended.
      clearTimeout(cullTimerRef.current);
      if (size.w > 0) {
        const CULL_PAD = 40;
        setCullViewport({
          l: -view.x / view.scale - CULL_PAD,
          t: -view.y / view.scale - CULL_PAD,
          r: (-view.x + size.w) / view.scale + CULL_PAD,
          b: (-view.y + size.h) / view.scale + CULL_PAD,
        });
      }
    }

    const allLinks = React.useMemo(
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

    // ── Canvas edge renderer ─────────────────────────────────────────────────
    React.useEffect(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || size.w === 0) return;

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const dpr = dprRef.current;

        // Only reallocate GPU texture when dimensions actually changed.
        if (canvasSizeRef.current.w !== size.w || canvasSizeRef.current.h !== size.h) {
          canvas.width = size.w * dpr;
          canvas.height = size.h * dpr;
          canvas.style.width = `${size.w}px`;
          canvas.style.height = `${size.h}px`;
          canvasSizeRef.current = { w: size.w, h: size.h };
        }

        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.translate(view.x, view.y);
        ctx.scale(view.scale, view.scale);

        // Compute viewport in graph space for culling
        const vl = -view.x / view.scale;
        const vt = -view.y / view.scale;
        const vr = vl + size.w / view.scale;
        const vb = vt + size.h / view.scale;
        const PAD = 80;

        for (const item of allLinks) {
          const { link, source, target } = item;
          const minX = Math.min(source.x, target.x) - PAD;
          const maxX = Math.max(source.x, target.x) + PAD;
          const minY = Math.min(source.y, target.y) - PAD;
          const maxY = Math.max(source.y, target.y) + PAD;
          if (maxX < vl || minX > vr || maxY < vt || minY > vb) continue;

          const meta = EDGE_KIND_META[link.kind];
          const active = hlLinks.has(link.id);
          const dim = hasSelection && !active;
          const isCritical = criticalPathMode && active;

          const rawColor = isCritical
            ? "var(--color-err)"
            : dim
            ? "var(--color-graph-dim)"
            : meta.color;
          const color = resolveCssColor(rawColor, container);
          const width = active ? 1.8 + link.criticality * 0.15 : 1.1;
          const opacity = dim ? 0.14 : active ? 0.92 : 0.42;

          drawLinkOnCanvas(ctx, source, target, color, width, opacity, meta.dashed);
        }


        ctx.restore(); // restores dpr scale + translate — resets globalAlpha/lineDash too
      });

      return () => cancelAnimationFrame(rafRef.current);
    }, [allLinks, view, size, hlLinks, hasSelection, criticalPathMode]);

    const entryCenter = layout.entryId ? centerOf(layout.entryId) : null;
    const entryTopLeft = layout.entryId ? layout.positions.get(layout.entryId) : undefined;

    // Memoized scene: stable element references let React skip reconciling all
    // nodes/edges while only the transform (view) changes during pan/zoom.
    const isBandLayout = (layout as BandLayout).layoutMode === "band";

    const swimlanesEl = React.useMemo(
      () =>
        swimlanes.map((lane) => {
          // Band layout: draw a tight box only as wide as the band content.
          // Dagre layout: draw a full-width stripe.
          const boxX = isBandLayout ? BAND.marginX : 0;
          const boxW = isBandLayout ? layout.width - BAND.marginX * 2 : layout.width;
          return (
            <g key={`swimlane-${lane.domain}`}>
              <rect
                x={boxX}
                y={lane.y}
                width={boxW}
                height={lane.height}
                fill={lane.color}
                fillOpacity={0.055}
                rx={6}
              />
              <rect
                x={boxX}
                y={lane.y}
                width={isBandLayout ? boxW : 4}
                height={isBandLayout ? 3 : lane.height}
                fill={lane.color}
                fillOpacity={0.6}
                rx={isBandLayout ? 6 : 2}
              />
              <text
                x={boxX + (isBandLayout ? 10 : 14)}
                y={lane.y + (isBandLayout ? 18 : 15)}
                fill={lane.color}
                fillOpacity={0.85}
                fontSize={isBandLayout ? 10 : 9}
                fontFamily="var(--font-mono)"
                letterSpacing="0.08em"
                fontWeight="700"
              >
                {lane.domain.toUpperCase()}
              </text>
            </g>
          );
        }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [swimlanes, layout.width, isBandLayout],
    );

    const railsEl = React.useMemo(
      () =>
        layout.rails
          .filter(() => swimlanes.length === 0)
          .map((rail, i) => (
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
      [layout.rails, layout.width, swimlanes.length],
    );

    // Only active/selected edges get SVG treatment (glow + hit-target).
    // All other edges are drawn on canvas above — no SVG paths needed for them.
    const edgesEl = React.useMemo(
      () =>
        allLinks
          .filter(({ link }) => hlLinks.has(link.id))
          .map(({ link, source, target }) => {
            const meta = EDGE_KIND_META[link.kind];
            const isCritical = criticalPathMode && hlLinks.has(link.id);
            const p = linkPath(source, target);
            const width = 2.4 + link.criticality * 0.18;
            return (
              <g key={link.id} data-graph-control="true">
                <path
                  d={p}
                  fill="none"
                  stroke={isCritical ? "var(--color-err)" : meta.color}
                  strokeWidth={16}
                  strokeOpacity={0.28}
                  strokeLinecap="round"
                  filter="url(#dependencyGlow)"
                />
                <path
                  d={p}
                  fill="none"
                  stroke={isCritical ? "var(--color-err)" : meta.color}
                  strokeWidth={width}
                  strokeOpacity={0.96}
                  strokeDasharray={meta.dashed ? "8 7" : undefined}
                  strokeLinecap="round"
                  markerEnd={isCritical ? "url(#arrow-critical)" : "url(#arrow)"}
                />
                <path
                  d={p}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={18}
                  className="cursor-pointer"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectLink(link.id);
                  }}
                />
              </g>
            );
          }),
      [allLinks, hlLinks, criticalPathMode, onSelectLink],
    );

    // Band layout always uses chip mode (compact cards). Dagre uses chips below threshold zoom.
    const chipMode = isBandLayout || view.scale < 0.48;

    const nodesEl = React.useMemo(
      () =>
        data.nodes.map((node) => {
          const position = layout.positions.get(node.id);
          if (!position) return null;

          // Viewport cull — skip nodes outside the lazily-updated visible area.
          if (cullViewport && (
            position.x + layout.nodeW < cullViewport.l ||
            position.x > cullViewport.r ||
            position.y + layout.nodeH < cullViewport.t ||
            position.y > cullViewport.b
          )) return null;

          const meta = NODE_KIND_META[node.kind];
          const isSelected = selectedNodeId === node.id;
          const active = isSelected || hlNodes.has(node.id);
          const dim = hasSelection && !active;
          const isCritical = criticalPathMode && active;
          const isEntry = node.id === layout.entryId;
          const domColor = node.domain ? domainColor(node.domain) : "";
          const dotColor = isCritical ? "var(--color-err)" : (domColor || meta.color);
          const borderColor = isCritical ? "var(--color-err)" : active ? (domColor || meta.color) : "var(--color-line)";

          if (chipMode && !active) {
            // Compact chip: coloured left bar + label.
            return (
              <button
                key={node.id}
                data-graph-control="true"
                onClick={(event) => { event.stopPropagation(); onSelectNode(node.id); focusNode(node.id); }}
                onDoubleClick={(event) => { event.stopPropagation(); onDoubleClickNode?.(node.id); }}
                className="absolute cursor-pointer rounded border border-line bg-bg-2 text-left hover:bg-surface"
                style={{
                  left: position.x,
                  top: position.y,
                  width: layout.nodeW,
                  height: layout.nodeH,
                  borderLeftWidth: "3px",
                  borderLeftColor: dotColor,
                  opacity: dim ? 0.18 : 1,
                  paddingLeft: 8,
                  paddingRight: 6,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span className="block truncate font-mono text-[10px] font-medium leading-none text-ink">
                  {node.label}
                </span>
              </button>
            );
          }

          const deg = degree.get(node.id) ?? { in: 0, out: 0 };
          return (
            <button
              key={node.id}
              data-graph-control="true"
              onClick={(event) => { event.stopPropagation(); onSelectNode(node.id); focusNode(node.id); }}
              onDoubleClick={(event) => { event.stopPropagation(); onDoubleClickNode?.(node.id); }}
              className="absolute cursor-pointer rounded-lg border bg-bg-2 px-2.5 py-1.5 text-left hover:bg-surface"
              style={{
                left: position.x,
                top: position.y,
                width: layout.nodeW,
                minHeight: layout.nodeH,
                borderColor,
                borderLeftWidth: domColor && !active ? "3px" : undefined,
                borderLeftColor: domColor && !active ? domColor : undefined,
                opacity: dim ? 0.22 : 1,
                boxShadow: isCritical
                  ? "0 0 20px color-mix(in srgb, var(--color-err) 30%, transparent)"
                  : active
                  ? `0 0 16px ${colorAlpha(domColor || meta.color, 18)}`
                  : "none",
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                <span className="truncate font-mono text-[11px] font-semibold text-ink leading-tight">
                  {node.label}
                </span>
                {isEntry && !hasSelection && (
                  <span className="ml-auto shrink-0 rounded border border-accent/30 bg-accent/10 px-1 font-mono text-[8px] text-accent">
                    entry
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-1">
                <span
                  className="truncate font-mono text-[9px] uppercase tracking-wide"
                  style={{ color: domColor || "var(--color-faint)", opacity: 0.75 }}
                >
                  {node.domain || meta.group}
                </span>
                <span className="font-mono text-[9px] text-faint shrink-0">
                  {deg.in}↓{deg.out}↑
                </span>
              </div>
              {isSelected && (
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[8px] text-line-2">
                  dbl-click to explore
                </div>
              )}
            </button>
          );
        }),
      [
        data.nodes, layout, hlNodes, hasSelection, criticalPathMode,
        degree, selectedNodeId, onSelectNode, onDoubleClickNode, focusNode,
        cullViewport, chipMode,
      ],
    );

    return (
      <div
        ref={containerRef}
        className="relative h-full w-full cursor-grab overflow-hidden bg-bg active:cursor-grabbing"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={() => onSelectNode("")}
      >
        {/* Dot grid background */}
        <div className="graph-grid pointer-events-none absolute inset-0" />
        {/* Canvas: all non-active edges rendered here for performance */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ cursor: "crosshair" }}
          onClick={(e) => {
            // Hit-test canvas-drawn edges: sample along each bezier at 20 points.
            const rect = e.currentTarget.getBoundingClientRect();
            const px = (e.clientX - rect.left - view.x) / view.scale;
            const py = (e.clientY - rect.top - view.y) / view.scale;
            const HIT = 8;
            for (const { link, source, target } of allLinks) {
              if (hlLinks.has(link.id)) continue; // SVG layer handles active edges
              const dy = Math.max(40, Math.abs(target.y - source.y) * 0.46);
              for (let i = 0; i <= 20; i++) {
                const t = i / 20;
                const mt = 1 - t;
                const bx = mt*mt*mt*source.x + 3*mt*mt*t*source.x + 3*mt*t*t*target.x + t*t*t*target.x;
                const by = mt*mt*mt*source.y + 3*mt*mt*t*(source.y+dy) + 3*mt*t*t*(target.y-dy) + t*t*t*target.y;
                if (Math.abs(px - bx) < HIT && Math.abs(py - by) < HIT) {
                  e.stopPropagation();
                  onSelectLink(link.id);
                  return;
                }
              }
            }
          }}
        />

        <div
          className="absolute left-0 top-0 origin-top-left will-change-transform"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
            transition: smooth ? "transform 180ms ease-out" : "none",
            contain: "layout style",
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

            {/* ── Domain swimlane bands ── */}
            {swimlanesEl}

            {/* ── Flow rail labels (non-dagre mode) ── */}
            {railsEl}

            {/* No hit-target paths — edge clicks handled via canvas onClick below */}

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
