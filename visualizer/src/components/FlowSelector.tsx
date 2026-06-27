import { GitBranch } from 'lucide-react';
import type { ParsedFlow } from '../lib/calmParser';

interface Props {
  flows: ParsedFlow[];
  selectedFlow: string | null;
  onChange: (flowId: string | null) => void;
}

export default function FlowSelector({ flows, selectedFlow, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <GitBranch size={14} className="text-slate-400 shrink-0" />
      <select
        className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-500 cursor-pointer"
        value={selectedFlow ?? ''}
        onChange={e => onChange(e.target.value || null)}
      >
        <option value="">All flows</option>
        {flows.map(f => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>
    </div>
  );
}
