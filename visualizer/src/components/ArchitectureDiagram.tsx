import { useState, useMemo, useCallback, useLayoutEffect, useEffect, useRef } from 'react';
import {
  ArrowLeft, ScanSearch, Search, X, ChevronRight,
  Server, Database, User, Globe, Network as NetworkIcon,
  ArrowRight, Box, Zap, XCircle,
} from 'lucide-react';
import type { GraphNode, GraphLink } from '../lib/calmParser';
import { NODE_COLORS, EDGE_COLORS, NODE_TYPE_LABELS, PROTOCOL_ASYNC } from '../constants/styleMap';
import type { NodeType } from '../constants/styleMap';
import type { RepoCodeGraph } from '../lib/scanEngine';

interface ScannedGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  repoLabel: string;
  repoUrl: string;
  graphLabel: string;
  repoId: string | null;
  codeGraph: RepoCodeGraph | null;
}

interface Props {
  scannedGraph: ScannedGraphData;
  onBackToRuntime: () => void;
  onScan: () => void;
  recentRepos: Array<{ repoLabel: string; repoUrl: string }>;
  onSwitchRepo: (repoUrl: string) => void;
}

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

const NODE_ICON: Record<NodeType, IconType> = {
  actor: User,
  webclient: Box,
  service: Server,
  database: Database,
  system: Zap,
  network: NetworkIcon,
  ecosystem: Globe,
};

// ── Layer categorization ─────────────────────────────────────────────────────

interface Layer {
  name: string;
  color: string;
  nodes: GraphNode[];
}

function categorizeIntoLayers(nodes: GraphNode[], links: GraphLink[]): Layer[] {
  const layers: Layer[] = [];
  const hasIncoming = (id: string) => links.some(l => l.target === id);

  const entryPoints = nodes.filter(n => n.nodeType === 'actor' || n.nodeType === 'webclient');
  const services = nodes.filter(n => n.nodeType === 'service');
  const infra = nodes.filter(n => n.nodeType === 'database' || n.nodeType === 'system');
  const external = nodes.filter(n => n.nodeType === 'ecosystem' && hasIncoming(n.id));
  const standalone = nodes.filter(n => n.nodeType === 'ecosystem' && !hasIncoming(n.id) && !entryPoints.includes(n));
  const network = nodes.filter(n => n.nodeType === 'network');

  if (entryPoints.length) layers.push({ name: 'Entry Points', color: '#34d399', nodes: entryPoints });
  if (services.length) layers.push({ name: 'Services', color: '#a78bfa', nodes: services });
  if (infra.length) layers.push({ name: 'Infrastructure', color: '#f59e0b', nodes: infra });
  if (external.length) layers.push({ name: 'External', color: '#22d3ee', nodes: external });
  if (standalone.length) layers.push({ name: 'Other', color: '#94a3b8', nodes: standalone });
  if (network.length) layers.push({ name: 'Network', color: '#94a3b8', nodes: network });

  return layers;
}

export default function ArchitectureDiagram({ scannedGraph, onBackToRuntime, onScan, recentRepos, onSwitchRepo }: Props) {
  const { nodes, links, repoLabel } = scannedGraph;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reposOpen, setReposOpen] = useState(false);
  const [cardPositions, setCardPositions] = useState<Map<string, { x: number; y: number; w: number; h: number }>>(new Map());

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const layers = useMemo(() => categorizeIntoLayers(nodes, links), [nodes, links]);
  const nodeMap = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // Build a layer index for each node
  const nodeLayerIndex = useMemo(() => {
    const m = new Map<string, number>();
    layers.forEach((layer, i) => layer.nodes.forEach(n => m.set(n.id, i)));
    return m;
  }, [layers]);

  const q = query.trim().toLowerCase();
  const matches = useCallback((n: GraphNode) => {
    if (!q) return true;
    return n.name.toLowerCase().includes(q) || n.description.toLowerCase().includes(q) ||
           (n.technology ?? '').toLowerCase().includes(q) || n.nodeType.toLowerCase().includes(q);
  }, [q]);

  const activeId = hoveredId ?? selectedId;
  const highlightedLinks = new Set<string>();
  const highlightedNodes = new Set<string>();
  if (activeId) {
    highlightedNodes.add(activeId);
    links.forEach((l, i) => {
      const linkId = l.id ?? `${l.source}-${l.target}-${i}`;
      if (l.source === activeId || l.target === activeId) {
        highlightedLinks.add(linkId);
        highlightedNodes.add(l.source);
        highlightedNodes.add(l.target);
      }
    });
  }

  // Group links by the layer they originate from
  const linksByLayer = useMemo(() => {
    const result: GraphLink[][] = layers.map(() => []);
    links.forEach(l => {
      const srcLayer = nodeLayerIndex.get(l.source);
      if (srcLayer !== undefined) {
        // Place the link at the layer of its source (the higher layer)
        result[srcLayer]?.push(l);
      }
    });
    return result;
  }, [links, nodeLayerIndex, layers]);

  const selectedNode = selectedId ? nodeMap.get(selectedId) ?? null : null;
  const selectedOutgoing = selectedId ? links.filter(l => l.source === selectedId) : [];
  const selectedIncoming = selectedId ? links.filter(l => l.target === selectedId) : [];

  // Measure card positions when activeId changes (for SVG arrows)
  const measureCards = useCallback(() => {
    if (!contentRef.current) return;
    const cr = contentRef.current.getBoundingClientRect();
    const np = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const [id, el] of cardRefs.current) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      np.set(id, { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height });
    }
    setCardPositions(np);
  }, []);

  useLayoutEffect(() => {
    if (activeId) measureCards();
  }, [activeId, measureCards, layers]);

  useEffect(() => {
    const t = setTimeout(() => { if (activeId) measureCards(); }, 100);
    return () => clearTimeout(t);
  }, [activeId, measureCards]);

  // Build SVG arrow paths for highlighted links only
  const activeArrows = useMemo(() => {
    if (!activeId || cardPositions.size === 0) return [];
    return links
      .map((l, i) => {
        const linkId = l.id ?? `${l.source}-${l.target}-${i}`;
        if (!highlightedLinks.has(linkId)) return null;
        const src = cardPositions.get(l.source);
        const tgt = cardPositions.get(l.target);
        if (!src || !tgt) return null;
        const srcCx = src.x + src.w / 2;
        const tgtCx = tgt.x + tgt.w / 2;
        const goingDown = tgt.y > src.y + src.h;
        const startY = goingDown ? src.y + src.h : src.y;
        const endY = goingDown ? tgt.y : tgt.y + tgt.h;
        const midY = (startY + endY) / 2;
        const d = `M ${srcCx} ${startY} C ${srcCx} ${midY}, ${tgtCx} ${midY}, ${tgtCx} ${endY}`;
        const isOutgoing = l.source === activeId;
        return { id: linkId, d, color: isOutgoing ? '#a78bfa' : '#34d399', isOutgoing, protocol: l.protocol ?? 'HTTP' };
      })
      .filter(Boolean) as Array<{ id: string; d: string; color: string; isOutgoing: boolean; protocol: string }>;
  }, [activeId, cardPositions, links, highlightedLinks]);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#0a0f1a] overflow-hidden">
      {/* ── Top bar ── */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900/80 px-4">
        <button
          onClick={onBackToRuntime}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Runtime
        </button>
        <div className="w-px h-4 bg-slate-700" />
        <span className="text-sm font-semibold text-white">{repoLabel}</span>
        <span className="text-[10px] bg-violet-600/20 text-violet-300 px-1.5 py-0.5 rounded font-mono">scanned</span>

        {/* Recent repos dropdown */}
        {recentRepos.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setReposOpen(v => !v)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 transition-colors"
            >
              <ScanSearch size={12} />
              Recent
              <span className="bg-slate-700 text-slate-300 rounded-full px-1.5 text-[10px]">{recentRepos.length}</span>
            </button>
            {reposOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setReposOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 w-72 max-h-64 overflow-y-auto bg-slate-900 border border-slate-700 rounded-lg shadow-xl">
                  <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                    Recently Scanned
                  </div>
                  {recentRepos.map(r => (
                    <button
                      key={r.repoUrl}
                      onClick={() => { onSwitchRepo(r.repoUrl); setReposOpen(false); }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs border-b border-slate-800/50 hover:bg-slate-800 transition-colors ${r.repoLabel === repoLabel ? 'bg-violet-600/10' : ''}`}
                    >
                      <Globe size={12} className="text-slate-500 shrink-0" />
                      <span className="flex-1 truncate text-slate-200">{r.repoLabel}</span>
                      {r.repoLabel === repoLabel && <span className="text-[9px] text-violet-300 bg-violet-600/20 px-1 rounded">viewing</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onScan}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <ScanSearch size={12} />
            Scan Repo
          </button>
        </div>
      </header>

      {/* ── Diagram + detail panel ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Diagram area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Search bar */}
          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-slate-800 px-4">
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5">
              <Search size={14} className="text-slate-500" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Filter components…"
                className="w-44 bg-transparent text-xs text-white placeholder-slate-600 focus:outline-none"
              />
              {query && <button onClick={() => setQuery('')} className="text-slate-500 hover:text-slate-300"><X size={12} /></button>}
            </div>
            <div className="ml-auto flex items-center gap-3 text-[10px] text-slate-500 font-mono">
              <span>{nodes.length} components</span>
              <span className={links.length > 0 ? 'text-emerald-400' : 'text-amber-400'}>{links.length} connections</span>
            </div>
          </div>

          {/* Scrollable diagram */}
          <div ref={scrollRef} className="flex-1 overflow-auto p-6">
            <div ref={contentRef} className="relative min-w-fit pb-8">
              {/* SVG overlay for animated glowing arrows (only when hovering/selecting) */}
              {activeArrows.length > 0 && (
                <svg
                  className="pointer-events-none absolute inset-0 z-30"
                  width={contentRef.current?.scrollWidth ?? 0}
                  height={contentRef.current?.scrollHeight ?? 0}
                  style={{ overflow: 'visible' }}
                >
                  <defs>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <marker id="arr-out" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                      <path d="M 0 0 L 9 5 L 0 10 z" fill="#a78bfa" />
                    </marker>
                    <marker id="arr-in" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                      <path d="M 0 0 L 9 5 L 0 10 z" fill="#34d399" />
                    </marker>
                  </defs>
                  {activeArrows.map(a => (
                    <g key={a.id} filter="url(#glow)">
                      {/* Glow base */}
                      <path
                        d={a.d} fill="none"
                        stroke={a.color}
                        strokeWidth="4"
                        opacity="0.15"
                      />
                      {/* Animated flow line */}
                      <path
                        d={a.d} fill="none"
                        stroke={a.color}
                        strokeWidth="2"
                        strokeDasharray="6 4"
                        className="arrow-flow"
                        markerEnd={`url(#${a.isOutgoing ? 'arr-out' : 'arr-in'})`}
                      />
                    </g>
                  ))}
                </svg>
              )}
              {layers.map((layer, layerIdx) => {
                const layerLinks = linksByLayer[layerIdx] ?? [];
                const visibleLayerLinks = layerLinks.filter(l => {
                  const src = nodeMap.get(l.source);
                  const tgt = nodeMap.get(l.target);
                  return src && tgt && matches(src) && matches(tgt);
                });

                return (
                  <div key={layer.name}>
                    {/* Layer row */}
                    <div className="flex gap-6 mb-2">
                      {/* Layer label */}
                      <div className="flex w-28 shrink-0 flex-col items-start justify-start">
                        <div className="mb-1 h-1 w-8 rounded-full" style={{ backgroundColor: layer.color }} />
                        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{layer.name}</span>
                        <span className="text-[10px] text-slate-700">{layer.nodes.length}</span>
                      </div>

                      {/* Cards */}
                      <div className="flex flex-wrap gap-3">
                        {layer.nodes.map(node => {
                          if (!matches(node)) return null;
                          const Icon = NODE_ICON[node.nodeType] ?? Server;
                          const color = NODE_COLORS[node.nodeType] ?? '#94a3b8';
                          const isSelected = selectedId === node.id;
                          const isHighlighted = highlightedNodes.has(node.id);
                          const isFaded = activeId != null && !isHighlighted;
                          const depCount = links.filter(l => l.source === node.id || l.target === node.id).length;

                          return (
                            <div
                              key={node.id}
                              ref={el => { if (el) cardRefs.current.set(node.id, el); else cardRefs.current.delete(node.id); }}
                              onClick={() => setSelectedId(node.id)}
                              onMouseEnter={() => setHoveredId(node.id)}
                              onMouseLeave={() => setHoveredId(null)}
                              className={`group relative w-52 cursor-pointer rounded-xl border p-4 transition-all duration-150
                                ${isSelected
                                  ? 'border-violet-500 bg-violet-500/5 shadow-lg shadow-violet-500/10'
                                  : isHighlighted
                                    ? 'border-slate-600 bg-slate-800'
                                    : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                                }
                                ${isFaded ? 'opacity-40' : ''}`}
                            >
                              <div className="mb-2 flex items-center gap-2.5">
                                <div
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                                  style={{ borderColor: `${color}33`, backgroundColor: `${color}0d` }}
                                >
                                  <Icon className="h-4 w-4" style={{ color }} />
                                </div>
                                <span className="min-w-0 truncate text-[13px] font-medium text-white">{node.name}</span>
                              </div>

                              {node.technology && (
                                <span className="mb-2 inline-block rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
                                  {node.technology}
                                </span>
                              )}

                              <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-400">{node.description}</p>

                              <div className="mt-3 flex items-center justify-between border-t border-slate-800/60 pt-2">
                                <span className="text-[9px] uppercase tracking-wide text-slate-600">{NODE_TYPE_LABELS[node.nodeType]}</span>
                                {depCount > 0 && (
                                  <span className="font-mono text-[10px] text-slate-500">{depCount} links</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Connection lines for this layer's outgoing links */}
                    {visibleLayerLinks.length > 0 && (
                      <div className="mb-6 ml-28">
                        <div className="border-l-2 border-slate-800 pl-4 py-2 space-y-1">
                          <div className="text-[9px] uppercase tracking-wide text-slate-600 mb-1">
                            {visibleLayerLinks.length} connection{visibleLayerLinks.length > 1 ? 's' : ''}
                          </div>
                          {visibleLayerLinks.map((link, i) => {
                            const src = nodeMap.get(link.source);
                            const tgt = nodeMap.get(link.target);
                            if (!src || !tgt) return null;
                            const linkId = link.id ?? `${link.source}-${link.target}-${i}`;
                            const isHighlighted = highlightedLinks.has(linkId);
                            const isFaded = activeId != null && !isHighlighted;
                            const edgeColor = EDGE_COLORS[link.protocol] ?? '#64748b';
                            const isAsync = PROTOCOL_ASYNC[link.protocol] ?? false;

                            return (
                              <div
                                key={linkId}
                                className={`flex items-center gap-2 text-[11px] transition-opacity ${isFaded ? 'opacity-30' : ''}`}
                              >
                                <button
                                  onClick={() => setSelectedId(src.id)}
                                  className="text-slate-400 hover:text-violet-300 transition-colors cursor-pointer"
                                >
                                  {src.name}
                                </button>
                                <span
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] shrink-0"
                                  style={{ color: edgeColor, backgroundColor: `${edgeColor}15` }}
                                >
                                  {isAsync && <span>~</span>}
                                  {link.protocol}
                                </span>
                                <ArrowRight size={10} style={{ color: edgeColor }} className="shrink-0" />
                                <button
                                  onClick={() => setSelectedId(tgt.id)}
                                  className="text-slate-400 hover:text-violet-300 transition-colors cursor-pointer"
                                >
                                  {tgt.name}
                                </button>
                                {link.description && (
                                  <span className="text-slate-600 truncate hidden lg:inline">{link.description}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* No connections warning */}
              {links.length === 0 && (
                <div className="mt-8 ml-28 rounded-lg border border-amber-800/50 bg-amber-900/20 p-4">
                  <p className="text-xs text-amber-300">
                    No connections were found in this scan. This can happen if Claude couldn't find
                    enough evidence for service-to-service relationships in the code.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <DetailPanel
            node={selectedNode}
            outgoing={selectedOutgoing}
            incoming={selectedIncoming}
            allNodes={nodes}
            onSelectNode={setSelectedId}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ node, outgoing, incoming, allNodes, onSelectNode, onClose }: {
  node: GraphNode;
  outgoing: GraphLink[];
  incoming: GraphLink[];
  allNodes: GraphNode[];
  onSelectNode: (id: string) => void;
  onClose: () => void;
}) {
  const Icon = NODE_ICON[node.nodeType] ?? Server;
  const color = NODE_COLORS[node.nodeType] ?? '#94a3b8';

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-900">
      <div className="flex items-start justify-between border-b border-slate-800 p-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
            style={{ borderColor: `${color}44`, backgroundColor: `${color}10` }}
          >
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-white">{node.name}</h3>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span
                className="rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide"
                style={{ color, borderColor: `${color}44`, backgroundColor: `${color}10` }}
              >
                {NODE_TYPE_LABELS[node.nodeType]}
              </span>
              {node.technology && (
                <span className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
                  {node.technology}
                </span>
              )}
              {node.language && (
                <span className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
                  {node.language}
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white p-1">
          <XCircle size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div>
          <h4 className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">Description</h4>
          <p className="text-[13px] leading-relaxed text-slate-300">{node.description}</p>
        </div>

        {node.criticality && (
          <div>
            <h4 className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">Criticality</h4>
            <span className={`text-xs px-2 py-0.5 rounded font-mono ${
              node.criticality === 'high' ? 'bg-red-500/20 text-red-300' :
              node.criticality === 'medium' ? 'bg-amber-500/20 text-amber-300' :
              'bg-slate-700 text-slate-300'
            }`}>{node.criticality}</span>
          </div>
        )}

        {outgoing.length > 0 && (
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">
              <ArrowRight size={12} className="text-violet-400" />
              Connects to ({outgoing.length})
            </h4>
            <div className="space-y-1.5">
              {outgoing.map((link, i) => {
                const tgt = allNodes.find(n => n.id === link.target);
                if (!tgt) return null;
                const tgtColor = NODE_COLORS[tgt.nodeType] ?? '#94a3b8';
                return (
                  <button
                    key={link.id ?? i}
                    onClick={() => onSelectNode(tgt.id)}
                    className="group flex w-full items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-800/50 px-3 py-2 text-left hover:border-slate-700 hover:bg-slate-800 transition-colors"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tgtColor }} />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-slate-300 group-hover:text-white">{tgt.name}</span>
                    <span className="shrink-0 rounded border border-slate-700 bg-slate-900 px-1 font-mono text-[8px] text-slate-500">{link.protocol}</span>
                    <ChevronRight size={12} className="shrink-0 text-slate-600 group-hover:text-slate-400 transition-transform group-hover:translate-x-0.5" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {incoming.length > 0 && (
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">
              <ArrowLeft size={12} className="text-emerald-400" />
              Connected from ({incoming.length})
            </h4>
            <div className="space-y-1.5">
              {incoming.map((link, i) => {
                const src = allNodes.find(n => n.id === link.source);
                if (!src) return null;
                const srcColor = NODE_COLORS[src.nodeType] ?? '#94a3b8';
                return (
                  <button
                    key={link.id ?? i}
                    onClick={() => onSelectNode(src.id)}
                    className="group flex w-full items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-800/50 px-3 py-2 text-left hover:border-slate-700 hover:bg-slate-800 transition-colors"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: srcColor }} />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-slate-300 group-hover:text-white">{src.name}</span>
                    <span className="shrink-0 rounded border border-slate-700 bg-slate-900 px-1 font-mono text-[8px] text-slate-500">{link.protocol}</span>
                    <ChevronRight size={12} className="shrink-0 text-slate-600 group-hover:text-slate-400 transition-transform group-hover:translate-x-0.5" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {outgoing.length === 0 && incoming.length === 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-800/50 p-4 text-center">
            <p className="text-xs text-slate-500">No connections found.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
