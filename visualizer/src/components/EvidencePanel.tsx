import { useState, useEffect } from 'react';
import { X, Terminal, GitCommit, ChevronDown, ChevronRight, Loader, ArrowRight } from 'lucide-react';
import type { GraphNode, GraphLink } from '../lib/calmParser';
import type { CalmCtx } from '../lib/platform';
import { fetchLogs, fetchCommits } from '../lib/platform';

interface Props {
  node: GraphNode;
  allLinks: GraphLink[];
  allNodes: GraphNode[];
  onClose: () => void;
  onSendToAgent: (evidence: AgentEvidence) => void;
}

export interface AgentEvidence {
  node: GraphNode;
  calmCtx: CalmCtx;
}

interface LogResult {
  available: boolean;
  content?: string;
  note?: string;
}

interface Commit {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  diff: string;
}

function colorLine(line: string): string {
  if (/\berror\b|\bERROR\b|FATAL|panic/i.test(line)) return 'text-red-400';
  if (/\bwarn\b|\bWARN\b/i.test(line)) return 'text-yellow-400';
  if (/\b5\d{2}\b/.test(line)) return 'text-red-400';
  if (/\b4\d{2}\b/.test(line)) return 'text-orange-400';
  if (/\b2\d{2}\b/.test(line)) return 'text-green-400';
  return 'text-slate-400';
}

function DiffLine({ line }: { line: string }) {
  if (line.startsWith('+++') || line.startsWith('---')) {
    return <div className="text-slate-500 text-[11px] font-mono">{line}</div>;
  }
  if (line.startsWith('+')) {
    return <div className="bg-green-950/60 text-green-300 text-[11px] font-mono px-1">{line}</div>;
  }
  if (line.startsWith('-')) {
    return <div className="bg-red-950/60 text-red-300 text-[11px] font-mono px-1">{line}</div>;
  }
  if (line.startsWith('@@')) {
    return <div className="text-cyan-500 text-[11px] font-mono">{line}</div>;
  }
  return <div className="text-slate-500 text-[11px] font-mono">{line}</div>;
}

function CommitCard({ commit }: { commit: Commit }) {
  const [open, setOpen] = useState(commit.shortHash === 'working' || false);
  const isBreaking = commit.shortHash === 'working' || commit.message.toLowerCase().includes('v3');

  return (
    <div className={`rounded-lg border ${isBreaking ? 'border-red-800 bg-red-950/20' : 'border-slate-700 bg-slate-800/50'} mb-2`}>
      <button
        className="w-full text-left px-3 py-2.5 flex items-start gap-2"
        onClick={() => setOpen(v => !v)}
      >
        {open ? <ChevronDown size={14} className="text-slate-500 mt-0.5 shrink-0" /> : <ChevronRight size={14} className="text-slate-500 mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className={`text-xs font-mono ${isBreaking ? 'text-red-400' : 'text-violet-400'}`}>{commit.shortHash}</code>
            {isBreaking && <span className="text-[10px] bg-red-900 text-red-300 px-1.5 py-0.5 rounded font-semibold">SUSPECT</span>}
          </div>
          <div className="text-sm text-slate-200 mt-0.5 truncate">{commit.message}</div>
          <div className="text-xs text-slate-500 mt-0.5">{commit.author} · {commit.date ? new Date(commit.date).toLocaleString() : ''}</div>
        </div>
      </button>
      {open && commit.diff && (
        <div className="border-t border-slate-700 px-3 py-2 max-h-64 overflow-y-auto">
          {commit.diff.split('\n').map((line, i) => (
            <DiffLine key={i} line={line} />
          ))}
        </div>
      )}
      {open && !commit.diff && (
        <div className="border-t border-slate-700 px-3 py-2 text-slate-500 text-xs">No diff available</div>
      )}
    </div>
  );
}

function buildCalmCtx(node: GraphNode, allLinks: GraphLink[], allNodes: GraphNode[]): CalmCtx {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  const outbound = allLinks
    .filter(l => !l.hidden && (typeof l.source === 'string' ? l.source : (l.source as GraphNode).id) === node.id)
    .map(l => {
      const dstId = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
      return { targetName: nodeMap.get(dstId)?.name ?? dstId, protocol: l.protocol, criticality: l.criticality, description: l.description };
    });
  const inbound = allLinks
    .filter(l => !l.hidden && (typeof l.target === 'string' ? l.target : (l.target as GraphNode).id) === node.id)
    .map(l => {
      const srcId = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
      return { sourceName: nodeMap.get(srcId)?.name ?? srcId, protocol: l.protocol };
    });
  return {
    node: { id: node.id, name: node.name, nodeType: node.nodeType, description: node.description, technology: node.technology, language: node.language, port: node.port, criticality: node.criticality },
    outbound,
    inbound,
  };
}

export default function EvidencePanel({ node, allLinks, allNodes, onClose, onSendToAgent }: Props) {
  const [tab, setTab] = useState<'logs' | 'commits'>('logs');
  const [logsResult, setLogsResult] = useState<LogResult | null>(null);
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [logsError, setLogsError] = useState(false);
  const [commitsError, setCommitsError] = useState(false);

  useEffect(() => {
    setLogsResult(null);
    setCommits(null);
    setLogsError(false);
    setCommitsError(false);

    fetchLogs(node.id)
      .then(setLogsResult)
      .catch(() => setLogsError(true));

    fetchCommits(node.id)
      .then(setCommits)
      .catch(() => setCommitsError(true));
  }, [node.id]);

  const handleSendToAgent = () => {
    onSendToAgent({ node, calmCtx: buildCalmCtx(node, allLinks, allNodes) });
  };

  const logs = logsResult?.available ? logsResult.content ?? '' : null;
  const logsNote = logsResult?.available === false ? logsResult.note : undefined;
  const logLines = logs?.split('\n') ?? [];

  return (
    <div className="absolute top-4 right-4 w-[520px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col z-20 max-h-[90vh]" style={{ borderLeftColor: '#ef4444', borderLeftWidth: 3 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Evidence</span>
          <ArrowRight size={12} className="text-slate-500" />
          <span className="text-sm text-red-400 font-mono">{node.name}</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 shrink-0">
        {(['logs', 'commits'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t === 'logs' ? <Terminal size={12} /> : <GitCommit size={12} />}
            {t === 'logs' ? 'Logs' : 'Commits'}
            {t === 'commits' && commits !== null && (
              <span className="bg-slate-700 text-slate-300 text-[10px] rounded-full px-1.5">{commits.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'logs' && (
          <div className="p-3">
            {logsError && (
              <p className="text-red-400 text-xs p-2">Could not reach platform at localhost:3001.</p>
            )}
            {!logsError && logsResult === null && (
              <div className="flex items-center gap-2 text-slate-500 text-xs p-2">
                <Loader size={12} className="animate-spin" />Loading logs...
              </div>
            )}
            {logsResult !== null && !logsResult.available && (
              <p className="text-slate-500 text-xs p-2 italic">{logsNote ?? 'Logs not available'}</p>
            )}
            {logs !== null && (
              <div className="font-mono text-[11px] leading-relaxed">
                {logLines.map((line, i) => (
                  <div key={i} className={colorLine(line)}>{line || ' '}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'commits' && (
          <div className="p-3">
            {commitsError && (
              <p className="text-red-400 text-xs p-2">Could not reach platform at localhost:3001.</p>
            )}
            {!commitsError && commits === null && (
              <div className="flex items-center gap-2 text-slate-500 text-xs p-2">
                <Loader size={12} className="animate-spin" />Loading commits...
              </div>
            )}
            {commits !== null && commits.length === 0 && (
              <p className="text-slate-500 text-xs p-2">No commits found for this service folder.</p>
            )}
            {commits !== null && commits.map(c => <CommitCard key={c.hash} commit={c} />)}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-800 px-4 py-3 shrink-0 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {logsResult !== null
            ? logsResult.available ? `${logLines.length} log lines` : 'logs unavailable'
            : '—'
          } · {commits !== null ? `${commits.length} commits` : '—'}
        </span>
        <button
          onClick={handleSendToAgent}
          disabled={logsResult === null && commits === null}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          Send to Agent <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}
