import { X, Globe, Database, Layers, Server, Cpu, Network, User, Search, FileCode } from 'lucide-react';
import type { GraphNode, GraphLink } from '../lib/calmParser';
import { NODE_COLORS, NODE_TYPE_LABELS, HEALTH_DOWN_COLOR, HEALTH_UP_COLOR } from '../constants/styleMap';
import type { NodeType } from '../constants/styleMap';
import type { ServiceHealth } from '../lib/healthPoller';

interface Props {
  node: GraphNode;
  allLinks: GraphLink[];
  allNodes: GraphNode[];
  health?: ServiceHealth;
  hasCodeGraph?: boolean;
  onClose: () => void;
  onCollectEvidence?: (node: GraphNode) => void;
  onExploreCode?: (node: GraphNode) => void;
}

const TYPE_ICONS: Record<NodeType, React.ElementType> = {
  actor:     User,
  webclient: Globe,
  service:   Server,
  database:  Database,
  system:    Layers,
  network:   Network,
  ecosystem: Cpu,
};

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: color + '22', color, border: `1px solid ${color}44` }}
    >
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">{title}</h3>
      {children}
    </div>
  );
}

export default function NodePanel({ node, allLinks, allNodes, health, hasCodeGraph, onClose, onCollectEvidence, onExploreCode }: Props) {
  const color = NODE_COLORS[node.nodeType] ?? '#94a3b8';
  const Icon = TYPE_ICONS[node.nodeType] ?? Server;

  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  const outbound = allLinks.filter(l => {
    const src = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
    return src === node.id && !l.hidden;
  });

  const inbound = allLinks.filter(l => {
    const dst = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
    return dst === node.id && !l.hidden;
  });

  const isBreaking = node.id === 'payments-service' || node.id === 'swift-ach-rail';

  return (
    <div className="absolute top-4 right-4 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-slate-800" style={{ borderLeftColor: color, borderLeftWidth: 3 }}>
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={18} style={{ color }} className="shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold text-white truncate">{node.name}</div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Badge color={color}>{NODE_TYPE_LABELS[node.nodeType]}</Badge>
              {health && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{
                    background: health.status === 'up' ? HEALTH_UP_COLOR + '22' : HEALTH_DOWN_COLOR + '22',
                    color: health.status === 'up' ? HEALTH_UP_COLOR : HEALTH_DOWN_COLOR,
                    border: `1px solid ${health.status === 'up' ? HEALTH_UP_COLOR + '55' : HEALTH_DOWN_COLOR + '55'}`,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block"
                    style={{ background: health.status === 'up' ? HEALTH_UP_COLOR : HEALTH_DOWN_COLOR }}
                  />
                  {health.status === 'up' ? `UP  ${health.latencyMs}ms` : 'DOWN'}
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white ml-2 shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Breaking scenario callout */}
      {isBreaking && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-xs">
          <span className="font-bold">⚠ Demo break point</span>
          <br />
          The edge <code className="text-red-200">payments-service → swift-ach-rail</code> is the critical path.
          Running <code className="text-red-200">make break-swift</code> changes{' '}
          <code className="text-red-200">/v2/transfers</code> →{' '}
          <code className="text-red-200">/v3/transfers</code>, breaking all payments.
        </div>
      )}

      {/* Body */}
      <div className="overflow-y-auto p-4 flex-1">
        <Section title="Description">
          <p className="text-slate-300 text-sm leading-relaxed">{node.description || '—'}</p>
        </Section>

        {(node.technology || node.language || node.port) && (
          <Section title="Technology">
            <div className="flex flex-wrap gap-2 text-sm">
              {node.technology && <span className="text-slate-300">{node.technology}</span>}
              {node.language && <Badge color="#60a5fa">{node.language}</Badge>}
              {node.port && (
                <Badge color="#94a3b8">:{node.port}</Badge>
              )}
            </div>
          </Section>
        )}

        {node.criticality && (
          <Section title="Criticality">
            <Badge color={node.criticality === 'high' ? '#ef4444' : node.criticality === 'medium' ? '#f59e0b' : '#22c55e'}>
              {node.criticality}
            </Badge>
          </Section>
        )}

        {node.flowIds.length > 0 && (
          <Section title="Participates in flows">
            <div className="flex flex-wrap gap-1">
              {node.flowIds.map(fid => (
                <Badge key={fid} color="#a78bfa">{fid.replace(/-/g, ' ')}</Badge>
              ))}
            </div>
          </Section>
        )}

        {outbound.length > 0 && (
          <Section title={`Calls (${outbound.length})`}>
            <ul className="space-y-1">
              {outbound.map(l => {
                const dstId = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
                const dst = nodeMap.get(dstId);
                return (
                  <li key={l.id} className="flex items-center gap-2 text-sm text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: l.color }} />
                    <span>{dst?.name ?? dstId}</span>
                    <span className="text-slate-600 text-xs ml-auto">{l.protocol}</span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {inbound.length > 0 && (
          <Section title={`Called by (${inbound.length})`}>
            <ul className="space-y-1">
              {inbound.map(l => {
                const srcId = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
                const src = nodeMap.get(srcId);
                return (
                  <li key={l.id} className="flex items-center gap-2 text-sm text-slate-300">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: l.color }} />
                    <span>{src?.name ?? srcId}</span>
                    <span className="text-slate-600 text-xs ml-auto">{l.protocol}</span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {node.repo && (
          <Section title="Repository">
            <span className="text-slate-400 text-sm font-mono">{node.repo}</span>
          </Section>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-slate-800 p-3 shrink-0 space-y-2">
        {onExploreCode && (
          <button
            onClick={() => onExploreCode(node)}
            className={`w-full flex items-center justify-center gap-2 border text-xs font-semibold px-3 py-2 rounded-lg transition-colors ${
              hasCodeGraph
                ? 'bg-cyan-900/30 hover:bg-cyan-800/50 border-cyan-700 text-cyan-300'
                : 'bg-slate-800/40 hover:bg-slate-700/40 border-slate-700 text-slate-400'
            }`}
          >
            <FileCode size={13} />
            {hasCodeGraph ? 'Explore Code' : 'Explore Code (needs embed)'}
          </button>
        )}
        {health?.status === 'down' && onCollectEvidence && (
          <button
            onClick={() => onCollectEvidence(node)}
            className="w-full flex items-center justify-center gap-2 bg-red-900/40 hover:bg-red-800/60 border border-red-700 text-red-300 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            <Search size={13} />
            Collect Evidence
          </button>
        )}
      </div>
    </div>
  );
}
