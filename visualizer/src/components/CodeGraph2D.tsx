import { useState, useMemo, useRef, useCallback } from 'react';

export interface GraphNode2D {
  id: string;
  label: string;
  type: string;
}

export interface GraphEdge2D {
  source: string;
  target: string;
  type: string;
}

interface Props {
  nodes: GraphNode2D[];
  edges: GraphEdge2D[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDrillIn?: (id: string) => void;
  emptyMessage?: string;
}

interface SimNode extends GraphNode2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const TYPE_COLORS: Record<string, string> = {
  service: '#8b5cf6',
  database: '#f59e0b',
  system: '#f97316',
  ecosystem: '#06b6d4',
  actor: '#94a3b8',
  webclient: '#3b82f6',
  file: '#8b5cf6',
  function: '#06b6d4',
  class: '#f59e0b',
  network: '#64748b',
};

const EDGE_COLORS: Record<string, string> = {
  contains: '#334155',
  calls: '#06b6d4',
  imports: '#8b5cf6',
  https: '#475569',
  amqp: '#f97316',
  jdbc: '#f59e0b',
  grpc: '#06b6d4',
  redis: '#ef4444',
  tcp: '#64748b',
};

function edgeColor(type: string) {
  return EDGE_COLORS[type] ?? '#475569';
}

function edgeDashed(type: string) {
  return type === 'imports' ? '6,4' : type === 'contains' ? 'none' : 'none';
}

// ── Force simulation ──────────────────────────────────────────────────────────

function simulate(nodes: SimNode[], edges: GraphEdge2D[], w: number, h: number, iterations: number) {
  if (nodes.length === 0) return;
  const cx = w / 2, cy = h / 2;
  const radius = Math.min(w, h) * 0.32;

  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2;
    n.x = cx + Math.cos(angle) * radius;
    n.y = cy + Math.sin(angle) * radius;
    n.vx = 0; n.vy = 0;
  });

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const idealDist = Math.max(70, Math.min(140, 450 / Math.sqrt(Math.max(1, nodes.length))));
  const repulsion = Math.max(1500, 6000 / Math.max(1, nodes.length));

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1) d = 1;
        const f = repulsion / (d * d);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        nodes[i].vx -= fx; nodes[i].vy -= fy;
        nodes[j].vx += fx; nodes[j].vy += fy;
      }
    }
    for (const e of edges) {
      const s = nodeMap.get(e.source), t = nodeMap.get(e.target);
      if (!s || !t) continue;
      const dx = t.x - s.x, dy = t.y - s.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1) d = 1;
      const f = (d - idealDist) * 0.08;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      s.vx += fx; s.vy += fy;
      t.vx -= fx; t.vy -= fy;
    }
    for (const n of nodes) {
      n.vx += (cx - n.x) * 0.012;
      n.vy += (cy - n.y) * 0.012;
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += n.vx; n.y += n.vy;
    }
  }

  // Fit to viewport
  const pad = 60;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  const gw = Math.max(1, maxX - minX), gh = Math.max(1, maxY - minY);
  const scale = Math.min((w - pad * 2) / gw, (h - pad * 2) / gh, 1);
  const ox = cx - (minX + maxX) / 2 * scale;
  const oy = cy - (minY + maxY) / 2 * scale;
  for (const n of nodes) { n.x = n.x * scale + ox; n.y = n.y * scale + oy; }
}

function trunc(text: string, max: number) {
  return text.length > max ? text.slice(0, max - 1) + '\u2026' : text;
}

// ── Node rendering helpers ────────────────────────────────────────────────────

function isLargeNode(type: string) {
  return type === 'service' || type === 'database' || type === 'system' || type === 'ecosystem' || type === 'file';
}

function NodeShape({ type, color, r, selected }: { type: string; color: string; r: number; selected: boolean }) {
  if (type === 'class') {
    // Diamond
    const s = r * 1.3;
    return <polygon points={`0,${-s} ${s},0 0,${s} ${-s},0`} fill={color} fillOpacity={0.9} stroke={color} strokeWidth={selected ? 3 : 1.5} />;
  }
  if (isLargeNode(type)) {
    // Rounded rect
    const w = r * 2.4, hgt = r * 1.6;
    return <rect x={-w/2} y={-hgt/2} width={w} height={hgt} rx={6} fill={color} fillOpacity={0.9} stroke={color} strokeWidth={selected ? 3 : 1.5} />;
  }
  // Circle for functions and default
  return <circle r={r} fill={color} fillOpacity={0.9} stroke={color} strokeWidth={selected ? 3 : 1.5} />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CodeGraph2D({ nodes, edges, selectedId, onSelect, onDrillIn, emptyMessage }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const W = 900, H = 650;

  const simNodes = useMemo<SimNode[]>(() => {
    const sn: SimNode[] = nodes.map(n => ({ ...n, x: 0, y: 0, vx: 0, vy: 0 }));
    const valid = edges.filter(e => sn.some(n => n.id === e.source) && sn.some(n => n.id === e.target));
    simulate(sn, valid, W, H, 300);
    return sn;
  }, [nodes, edges]);

  const nodeMap = useMemo(() => new Map(simNodes.map(n => [n.id, n])), [simNodes]);

  const connectedIds = useMemo(() => {
    if (!selectedId) return null;
    const ids = new Set<string>([selectedId]);
    for (const e of edges) {
      if (e.source === selectedId) ids.add(e.target);
      if (e.target === selectedId) ids.add(e.source);
    }
    return ids;
  }, [selectedId, edges]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.3, Math.min(3, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    setPan({ x: dragRef.current.px + (e.clientX - dragRef.current.x), y: dragRef.current.py + (e.clientY - dragRef.current.y) });
  }, []);

  const handleMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const handleBgClick = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current) onSelect(null);
  }, [onSelect]);

  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-600" style={{ minHeight: 0 }}>
        <div className="text-3xl opacity-30">{'{ }'}</div>
        <div className="text-sm">{emptyMessage ?? 'No nodes to display'}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden" style={{ minHeight: 0, background: 'radial-gradient(ellipse at center, #111827 0%, #0a0f1a 70%)' }}>
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <button onClick={() => setZoom(z => Math.min(3, z * 1.2))} className="w-8 h-8 bg-slate-800/90 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors text-base flex items-center justify-center">+</button>
        <button onClick={() => setZoom(z => Math.max(0.3, z * 0.8))} className="w-8 h-8 bg-slate-800/90 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors text-base flex items-center justify-center">&minus;</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="w-8 h-8 bg-slate-800/90 border border-slate-700 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors text-[9px] flex items-center justify-center">fit</button>
      </div>

      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox={`0 0 ${W} ${H}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleBgClick}
        style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
      >
        <defs>
          {/* Dot grid background */}
          <pattern id="dotgrid" width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="15" cy="15" r="0.8" fill="#1e293b" />
          </pattern>
          {/* Arrow markers */}
          {Object.entries(EDGE_COLORS).map(([type, color]) => (
            <marker key={type} id={`arrow-${type}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          ))}
          {/* Glow filter for selected nodes */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <rect width={W} height={H} fill="url(#dotgrid)" />

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {edges.map((edge, i) => {
            const s = nodeMap.get(edge.source);
            const t = nodeMap.get(edge.target);
            if (!s || !t) return null;
            const color = edgeColor(edge.type);
            const dashed = edgeDashed(edge.type);
            const isHi = !selectedId || (connectedIds?.has(edge.source) && connectedIds?.has(edge.target));
            const opacity = isHi ? 0.7 : 0.1;

            // Curved edge via quadratic bezier
            const dx = t.x - s.x, dy = t.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            // Offset perpendicular for curve
            const ox = -dy / dist * Math.min(20, dist * 0.1);
            const oy = dx / dist * Math.min(20, dist * 0.1);
            const mx = (s.x + t.x) / 2 + ox;
            const my = (s.y + t.y) / 2 + oy;

            return (
              <path
                key={i}
                d={`M ${s.x} ${s.y} Q ${mx} ${my} ${t.x} ${t.y}`}
                fill="none"
                stroke={color}
                strokeWidth={isHi ? 2 : 1}
                strokeDasharray={dashed === 'none' ? undefined : dashed}
                opacity={opacity}
                markerEnd={edge.type !== 'contains' ? `url(#arrow-${edge.type})` : undefined}
              />
            );
          })}

          {/* Nodes */}
          {simNodes.map(node => {
            const color = TYPE_COLORS[node.type] ?? '#64748b';
            const isSelected = node.id === selectedId;
            const isHovered = node.id === hoverId;
            const isConnected = !connectedIds || connectedIds.has(node.id);
            const opacity = isConnected ? 1 : 0.25;
            const large = isLargeNode(node.type);
            const r = isSelected || isHovered ? (large ? 16 : 10) : (large ? 14 : 8);

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                opacity={opacity}
                style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                filter={isSelected ? 'url(#glow)' : undefined}
                onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
                onDoubleClick={(e) => { e.stopPropagation(); onDrillIn?.(node.id); }}
                onMouseEnter={() => setHoverId(node.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                <NodeShape type={node.type} color={color} r={r} selected={isSelected} />

                {/* Label */}
                {large ? (
                  // Label inside the rect
                  <text
                    textAnchor="middle"
                    y={4}
                    fill="#f1f5f9"
                    fontSize={10}
                    fontFamily="monospace"
                    fontWeight={500}
                  >
                    {trunc(node.label, 18)}
                  </text>
                ) : (
                  // Label below circle
                  <text
                    textAnchor="middle"
                    y={r + 15}
                    fill={isSelected ? '#f1f5f9' : '#94a3b8'}
                    fontSize={10}
                    fontFamily="monospace"
                  >
                    {trunc(node.label, 22)}
                  </text>
                )}

                {/* Expand hint */}
                {onDrillIn && (isHovered || isSelected) && (
                  <text
                    textAnchor="middle"
                    y={r + (large ? 20 : 28)}
                    fill="#7c3aed"
                    fontSize={8}
                    fontWeight={600}
                  >
                    double-click to expand
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
