"use client";

import * as React from "react";
import {
  dependenciesOf,
  dependentsOf,
  EDGE_KIND_META,
  NODE_KIND_META,
  nodeById,
  type GraphLink,
  type GraphNode,
} from "@/lib/data";

// ── Layout constants ─────────────────────────────────────────────────────────
const SVG_W = 336;
const CENTER_W = 130;
const CENTER_H = 44;
const PEER_W = 100;
const PEER_H = 34;
const H_GAP = 10;
const V_GAP = 58;
const ROW_SPACING = PEER_H + 14;
const PAD_TOP = 22;
const PAD_BOT = 10;

function chunkBy<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function rowLayout(
  row: GraphNode[],
): { node: GraphNode; x: number }[] {
  const total = row.length * PEER_W + (row.length - 1) * H_GAP;
  const startX = (SVG_W - total) / 2;
  return row.map((n, i) => ({ node: n, x: startX + i * (PEER_W + H_GAP) }));
}

interface NodePos {
  node: GraphNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EdgePos {
  link: GraphLink;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface SubGraphProps {
  node: GraphNode;
  onSelectNode: (id: string) => void;
}

const LEAF_MESSAGES: Partial<Record<string, string>> = {
  external: "Terminal external endpoint — no outbound dependencies tracked",
  database: "Passive data store — receives writes, initiates nothing",
  config: "Read-only config — consumed by services, initiates no calls",
  queue: "Message broker — routes events but holds no downstream logic",
};

export function SubGraph({ node, onSelectNode }: SubGraphProps) {
  const depLinks = dependenciesOf(node.id);
  const depNodes = depLinks
    .map((l) => nodeById(l.target))
    .filter((n): n is GraphNode => !!n);

  const inLinks = dependentsOf(node.id);
  const inNodes = inLinks
    .map((l) => nodeById(l.source))
    .filter((n): n is GraphNode => !!n);

  // Leaf-node empty state
  if (depLinks.length === 0 && inLinks.length === 0) {
    const msg =
      LEAF_MESSAGES[node.kind] ??
      "Isolated node — no connections found in the scanned graph";
    const meta = NODE_KIND_META[node.kind];
    return (
      <div className="flex flex-col items-center px-6 py-8 text-center">
        <span
          className="mb-3 flex h-10 w-10 items-center justify-center border"
          style={{
            borderColor: `${meta.color}44`,
            backgroundColor: `${meta.color}10`,
          }}
        >
          <span
            className="font-mono text-[11px] font-semibold"
            style={{ color: meta.color }}
          >
            {node.label.slice(0, 2).toUpperCase()}
          </span>
        </span>
        <p className="font-mono text-[12px] font-semibold text-[#e8e9ed]">
          {node.label}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-[#555]">{msg}</p>
      </div>
    );
  }

  const topRows = chunkBy(inNodes, 3);
  const botRows = chunkBy(depNodes, 3);

  const topHeight = topRows.length * ROW_SPACING;
  const botHeight = botRows.length * ROW_SPACING;
  const topGap = topRows.length > 0 ? V_GAP : 0;
  const botGap = botRows.length > 0 ? V_GAP : 0;

  const centerY = PAD_TOP + topHeight + topGap;
  const svgHeight = centerY + CENTER_H + botGap + botHeight + PAD_BOT;
  const centCX = SVG_W / 2;
  const centCY = centerY + CENTER_H / 2;

  // Build position map
  const positions = new Map<string, NodePos>();
  positions.set(node.id, {
    node,
    x: (SVG_W - CENTER_W) / 2,
    y: centerY,
    w: CENTER_W,
    h: CENTER_H,
  });

  topRows.forEach((row, ri) => {
    const y = PAD_TOP + ri * ROW_SPACING;
    rowLayout(row).forEach(({ node: n, x }) =>
      positions.set(n.id, { node: n, x, y, w: PEER_W, h: PEER_H }),
    );
  });

  botRows.forEach((row, ri) => {
    const y = centerY + CENTER_H + botGap + ri * ROW_SPACING;
    rowLayout(row).forEach(({ node: n, x }) =>
      positions.set(n.id, { node: n, x, y, w: PEER_W, h: PEER_H }),
    );
  });

  // Build edge positions
  const edges: EdgePos[] = [...depLinks, ...inLinks].flatMap((link) => {
    const src = positions.get(link.source);
    const tgt = positions.get(link.target);
    if (!src || !tgt) return [];
    return [
      {
        link,
        x1: src.x + src.w / 2,
        y1: link.source === node.id ? src.y + src.h : src.y + src.h / 2,
        x2: tgt.x + tgt.w / 2,
        y2: link.target === node.id ? tgt.y : tgt.y + tgt.h / 2,
      },
    ];
  });

  const centMeta = NODE_KIND_META[node.kind];
  const peers = [...positions.values()].filter((p) => p.node.id !== node.id);

  const [hoveredEdge, setHoveredEdge] = React.useState<string | null>(null);

  return (
    <div className="w-full">
      <svg
        width={SVG_W}
        height={svgHeight}
        viewBox={`0 0 ${SVG_W} ${svgHeight}`}
        className="mx-auto block"
        style={{ overflow: "visible" }}
      >
        <defs>
          <marker
            id="sg-arrow"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            <path d="M0,1 L6,3.5 L0,6 z" fill="#5c5e6a" />
          </marker>
          <filter id="sg-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Section labels */}
        {inNodes.length > 0 && (
          <text
            x={SVG_W / 2}
            y={8}
            textAnchor="middle"
            fill="#3a3c48"
            fontSize={8.5}
            fontFamily="monospace"
            letterSpacing="0.12em"
          >
            DEPENDED ON BY
          </text>
        )}
        {depNodes.length > 0 && (
          <text
            x={SVG_W / 2}
            y={svgHeight - 1}
            textAnchor="middle"
            fill="#3a3c48"
            fontSize={8.5}
            fontFamily="monospace"
            letterSpacing="0.12em"
          >
            DEPENDS ON
          </text>
        )}

        {/* Edges — criticality-weighted */}
        {edges.map((e) => {
          const meta = EDGE_KIND_META[e.link.kind];
          const crit = e.link.criticality ?? 3;
          const isHovered = hoveredEdge === e.link.id;
          const midX = (e.x1 + e.x2) / 2;
          const midY = (e.y1 + e.y2) / 2;
          const cpX = e.x1 + (e.x2 - e.x1) * 0.1;
          const cpY = e.y1 + (e.y2 - e.y1) * 0.9;
          // Map criticality to visual weight
          const strokeWidth = crit <= 2 ? 1 : crit === 3 ? 1.5 : 2.5;
          const opacity = crit <= 2 ? 0.35 : crit === 3 ? 0.55 : 0.92;
          const strokeColor = isHovered
            ? meta.color
            : crit >= 4
            ? meta.color
            : `${meta.color}99`;
          return (
            <g key={e.link.id}>
              <path
                d={`M ${e.x1} ${e.y1} Q ${cpX} ${cpY} ${e.x2} ${e.y2}`}
                fill="none"
                stroke={strokeColor}
                strokeWidth={isHovered ? strokeWidth + 0.5 : strokeWidth}
                strokeOpacity={isHovered ? 1 : opacity}
                strokeDasharray={meta.dashed ? "5 3" : undefined}
                markerEnd="url(#sg-arrow)"
                style={{ transition: "stroke 0.15s, stroke-width 0.15s, stroke-opacity 0.15s" }}
              />
              {/* Criticality-5 flame indicator */}
              {crit >= 5 && (
                <text
                  x={midX + 6}
                  y={midY}
                  fill="#f87171"
                  fontSize={9}
                  dominantBaseline="middle"
                  opacity={0.8}
                >
                  ⚡
                </text>
              )}
              {/* Invisible hit area */}
              <path
                d={`M ${e.x1} ${e.y1} Q ${cpX} ${cpY} ${e.x2} ${e.y2}`}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                onMouseEnter={() => setHoveredEdge(e.link.id)}
                onMouseLeave={() => setHoveredEdge(null)}
                className="cursor-default"
              />
              {/* Edge label on hover */}
              {isHovered && (
                <g>
                  <rect
                    x={midX - 34}
                    y={midY - 10}
                    width={68}
                    height={18}
                    rx={3}
                    fill="#181a22"
                    stroke={`${meta.color}55`}
                    strokeWidth={1}
                  />
                  <text
                    x={midX}
                    y={midY + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={meta.color}
                    fontSize={8.5}
                    fontFamily="monospace"
                  >
                    {meta.label} · {crit}/5
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Center node */}
        <rect
          x={(SVG_W - CENTER_W) / 2}
          y={centerY}
          width={CENTER_W}
          height={CENTER_H}
          fill={`${centMeta.color}14`}
          stroke={centMeta.color}
          strokeWidth={1.5}
          rx={3}
          filter="url(#sg-glow)"
        />
        <text
          x={centCX}
          y={centCY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={centMeta.color}
          fontSize={11.5}
          fontFamily="monospace"
          fontWeight={600}
        >
          {node.label.length > 16 ? node.label.slice(0, 14) + "…" : node.label}
        </text>

        {/* Peer nodes */}
        {peers.map(({ node: n, x, y, w, h }) => {
          const meta = NODE_KIND_META[n.kind];
          const cx = x + w / 2;
          const cy = y + h / 2;
          return (
            <g
              key={n.id}
              onClick={() => onSelectNode(n.id)}
              className="cursor-pointer"
              role="button"
              aria-label={`Explore ${n.label}`}
            >
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill="#0a0a0a"
                stroke={`${meta.color}55`}
                strokeWidth={1}
                rx={2}
                className="transition-all duration-150 hover:fill-[#111116] hover:stroke-opacity-100"
                style={{ transition: "fill 0.15s" }}
              />
              {/* Hover highlight */}
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill="transparent"
                stroke={meta.color}
                strokeWidth={0}
                rx={2}
                className="hover:stroke-[1px]"
              />
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#7a7d8a"
                fontSize={10}
                fontFamily="monospace"
                className="select-none"
              >
                {n.label.length > 13 ? n.label.slice(0, 11) + "…" : n.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Connection detail list */}
      {(depLinks.length > 0 || inLinks.length > 0) && (
        <div className="mt-3 space-y-1 px-1">
          {depLinks.map((link) => {
            const target = nodeById(link.target);
            const meta = EDGE_KIND_META[link.kind];
            return (
              <button
                key={link.id}
                onClick={() => target && onSelectNode(target.id)}
                className="flex w-full cursor-pointer items-start gap-2.5 border border-[#1e2028] bg-[#0a0a0e] px-3 py-2 text-left transition-colors duration-150 hover:border-[#2a2c36] hover:bg-[#0e0f14]"
              >
                <span
                  className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11.5px] text-[#8b8d98]">→</span>
                    <span className="truncate font-mono text-[12px] text-[#c5c7d0]">
                      {target?.label ?? link.target}
                    </span>
                    <span
                      className="ml-auto shrink-0 font-mono text-[10px]"
                      style={{ color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-[#555]">
                    {link.summary}
                  </p>
                </div>
              </button>
            );
          })}
          {inLinks.map((link) => {
            const source = nodeById(link.source);
            const meta = EDGE_KIND_META[link.kind];
            return (
              <button
                key={link.id}
                onClick={() => source && onSelectNode(source.id)}
                className="flex w-full cursor-pointer items-start gap-2.5 border border-[#1e2028] bg-[#0a0a0e] px-3 py-2 text-left transition-colors duration-150 hover:border-[#2a2c36] hover:bg-[#0e0f14]"
              >
                <span
                  className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11.5px] text-[#8b8d98]">←</span>
                    <span className="truncate font-mono text-[12px] text-[#c5c7d0]">
                      {source?.label ?? link.source}
                    </span>
                    <span
                      className="ml-auto shrink-0 font-mono text-[10px]"
                      style={{ color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-[#555]">
                    {link.summary}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
