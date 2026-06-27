import { X, ArrowRight, Zap, Clock } from 'lucide-react';
import type { GraphLink, GraphNode } from '../lib/calmParser';
import { PROTOCOL_LABELS, PROTOCOL_ASYNC } from '../constants/styleMap';

interface Props {
  link: GraphLink;
  allNodes: GraphNode[];
  onClose: () => void;
}

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

export default function EdgePanel({ link, allNodes, onClose }: Props) {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  const srcId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
  const dstId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
  const srcNode = nodeMap.get(srcId);
  const dstNode = nodeMap.get(dstId);
  const isAsync = PROTOCOL_ASYNC[link.protocol] ?? false;
  const critColor = link.criticality === 'high' ? '#ef4444' : link.criticality === 'medium' ? '#f59e0b' : '#22c55e';

  return (
    <div className="absolute top-4 right-4 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
      style={{ borderLeftColor: link.color, borderLeftWidth: 3 }}>
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-slate-800">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-white flex-wrap">
            <span className="truncate max-w-[90px]">{srcNode?.name ?? srcId}</span>
            <ArrowRight size={14} className="shrink-0 text-slate-400" />
            <span className="truncate max-w-[90px]">{dstNode?.name ?? dstId}</span>
          </div>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            <Badge color={link.color}>{PROTOCOL_LABELS[link.protocol] ?? link.protocol}</Badge>
            {isAsync
              ? <Badge color="#fb923c"><Zap size={10} className="inline mr-0.5" />async</Badge>
              : <Badge color="#60a5fa"><Clock size={10} className="inline mr-0.5" />sync</Badge>}
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white ml-2 shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Breaking scenario callout */}
      {link.breakingScenario && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-xs">
          <span className="font-bold">⚠ Critical demo edge</span>
          <br />
          This is a <strong>synchronous, blocking</strong> call with <strong>no circuit breaker</strong>.
          Changing <code className="text-red-200">/v2/transfers</code> →{' '}
          <code className="text-red-200">/v3/transfers</code> in{' '}
          <code className="text-red-200">payments-service/internal/swift/client.go</code> breaks all payments.
        </div>
      )}

      {/* Body */}
      <div className="overflow-y-auto p-4 flex-1">
        {link.description && (
          <Section title="Description">
            <p className="text-slate-300 text-sm leading-relaxed">{link.description}</p>
          </Section>
        )}

        <Section title="Connection details">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-slate-500">Source</div>
            <div className="text-slate-200">{srcNode?.name ?? srcId}</div>
            <div className="text-slate-500">Destination</div>
            <div className="text-slate-200">{dstNode?.name ?? dstId}</div>
            <div className="text-slate-500">Protocol</div>
            <div className="text-slate-200">{link.protocol}</div>
            <div className="text-slate-500">Mode</div>
            <div className="text-slate-200">{isAsync ? 'Asynchronous' : 'Synchronous'}</div>
          </div>
        </Section>

        <Section title="Criticality">
          <Badge color={critColor}>{link.criticality ?? 'medium'}</Badge>
          {link.criticality === 'high' && (
            <p className="text-slate-400 text-xs mt-2">
              High-criticality edge — failures here propagate directly to the user-facing flow.
            </p>
          )}
        </Section>

        {link.flowIds.length > 0 && (
          <Section title="Part of flows">
            <div className="flex flex-wrap gap-1">
              {link.flowIds.map(fid => (
                <Badge key={fid} color="#a78bfa">{fid.replace(/-/g, ' ')}</Badge>
              ))}
            </div>
          </Section>
        )}

        {link.breakingScenario && (
          <Section title="Before you change this">
            <p className="text-slate-400 text-xs leading-relaxed">
              The SWIFT rail mock only handles <code className="text-slate-200">/v2/transfers</code>.
              Any path change causes 404s that cascade: <br />
              <code className="text-slate-200">payment.completed</code> stops flowing to Kafka →
              notification-service goes silent → fraud detection runs but never clears.
            </p>
          </Section>
        )}
      </div>
    </div>
  );
}
