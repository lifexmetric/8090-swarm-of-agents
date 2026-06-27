import { NODE_COLORS, NODE_TYPE_LABELS, EDGE_COLORS } from '../constants/styleMap';
import type { NodeType, Protocol } from '../constants/styleMap';

const NODE_TYPES: NodeType[] = ['actor', 'webclient', 'service', 'database', 'system', 'network', 'ecosystem'];
const PROTOCOLS: Protocol[] = ['HTTPS', 'HTTP', 'AMQP', 'JDBC', 'TCP', 'interacts'];

interface Props {
  hiddenTypes: Set<string>;
  hiddenProtocols: Set<string>;
  onToggleType: (type: string) => void;
  onToggleProtocol: (proto: string) => void;
}

function Pill({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all"
      style={{
        background: active ? color + '22' : '#1e293b',
        color: active ? color : '#475569',
        border: `1px solid ${active ? color + '55' : '#334155'}`,
      }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: active ? color : '#475569' }} />
      {label}
    </button>
  );
}

export default function FilterBar({ hiddenTypes, hiddenProtocols, onToggleType, onToggleProtocol }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="text-xs text-slate-600 uppercase tracking-widest block mb-1.5">Nodes</span>
        <div className="flex flex-wrap gap-1.5">
          {NODE_TYPES.map(t => (
            <Pill
              key={t}
              label={NODE_TYPE_LABELS[t]}
              color={NODE_COLORS[t]}
              active={!hiddenTypes.has(t)}
              onClick={() => onToggleType(t)}
            />
          ))}
        </div>
      </div>
      <div>
        <span className="text-xs text-slate-600 uppercase tracking-widest block mb-1.5">Edges</span>
        <div className="flex flex-wrap gap-1.5">
          {PROTOCOLS.map(p => (
            <Pill
              key={p}
              label={p}
              color={EDGE_COLORS[p]}
              active={!hiddenProtocols.has(p)}
              onClick={() => onToggleProtocol(p)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
