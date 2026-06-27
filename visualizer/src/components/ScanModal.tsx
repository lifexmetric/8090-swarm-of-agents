import { useState } from 'react';
import { X, ScanSearch, Loader, AlertCircle, CheckCircle, FileCode, FunctionSquare, Box } from 'lucide-react';
import { scanRepoStream } from '../lib/scanEngine';
import type { ScanResult, RepoSummary } from '../lib/scanEngine';

interface Props {
  onClose: () => void;
  onResult: (result: ScanResult) => void;
}

const STEP_ORDER = ['cloning', 'discovering', 'embedding', 'code_graph', 'probing', 'synthesizing'] as const;
const STEP_LABELS: Record<string, string> = {
  cloning: 'Cloning repository',
  discovering: 'Discovering services',
  embedding: 'Embedding code (jina int8)',
  code_graph: 'Extracting code graph',
  probing: 'Running semantic probes',
  synthesizing: 'Synthesising architecture',
};

export default function ScanModal({ onClose, onResult }: Props) {
  const [repoUrl, setRepoUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [pat, setPat] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [progressMsg, setProgressMsg] = useState('');
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<RepoSummary | null>(null);

  const handleScan = async () => {
    if (!repoUrl || !apiKey) return;
    setScanning(true);
    setError(null);
    setCurrentStep('cloning');
    setProgressMsg('');
    setCompletedSteps(new Set());
    setSummary(null);

    await scanRepoStream(
      repoUrl,
      apiKey,
      pat || undefined,
      (step, message) => {
        // Mark previous step as completed
        setCompletedSteps(prev => {
          const next = new Set(prev);
          if (currentStep && currentStep !== step) next.add(currentStep);
          return next;
        });
        setCurrentStep(step);
        setProgressMsg(message);
      },
      (result) => {
        // Mark all steps complete
        setCompletedSteps(new Set(STEP_ORDER as readonly string[]));
        if (result.summary) setSummary(result.summary);
        onResult(result);
      },
      (msg) => {
        setError(msg);
      },
    );

    setScanning(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[520px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ScanSearch size={15} className="text-violet-400" />
            <span className="text-sm font-semibold text-white">Scan Repository</span>
          </div>
          <button onClick={onClose} disabled={scanning} className="text-slate-500 hover:text-white disabled:opacity-30">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-slate-400">
            Clones the repo, embeds all code with
            <span className="text-violet-300 font-mono"> jina-embeddings-v2-base-code</span> (ONNX int8),
            extracts a code-level graph with tree-sitter, then asks Claude to synthesise the architecture.
          </p>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">GitHub Repo URL</label>
            <input
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo"
              disabled={scanning}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 font-mono disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Anthropic API Key</label>
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              disabled={scanning}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 font-mono disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">GitHub PAT <span className="text-slate-600">(optional — for private repos)</span></label>
            <input
              type="password"
              autoComplete="off"
              value={pat}
              onChange={e => setPat(e.target.value)}
              placeholder="ghp_..."
              disabled={scanning}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 font-mono disabled:opacity-50"
            />
          </div>

          {/* Live step progress */}
          {scanning && (
            <div className="space-y-1.5 py-2">
              {STEP_ORDER.map(step => {
                const isDone = completedSteps.has(step);
                const isActive = currentStep === step;
                return (
                  <div key={step}>
                    <div className="flex items-center gap-2 text-xs">
                      {isDone ? (
                        <CheckCircle size={12} className="text-green-400 shrink-0" />
                      ) : isActive ? (
                        <Loader size={12} className="animate-spin text-violet-400 shrink-0" />
                      ) : (
                        <div className="w-3 h-3 rounded-full border border-slate-700 shrink-0" />
                      )}
                      <span className={isActive ? 'text-slate-200' : isDone ? 'text-slate-400' : 'text-slate-600'}>
                        {STEP_LABELS[step]}
                      </span>
                    </div>
                    {isActive && progressMsg && (
                      <div className="ml-5 text-[10px] text-violet-400/70 font-mono py-0.5">{progressMsg}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Summary card after scan */}
          {summary && !scanning && (
            <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Repo Summary</div>
              <div className="flex gap-4">
                <span className="flex items-center gap-1.5 text-xs text-slate-300">
                  <FileCode size={12} className="text-violet-400" /> {summary.total_files} files
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-300">
                  <FunctionSquare size={12} className="text-cyan-400" /> {summary.total_functions} functions
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-300">
                  <Box size={12} className="text-amber-400" /> {summary.total_classes} classes
                </span>
              </div>
              {Object.keys(summary.languages).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(summary.languages).map(([lang, count]) => (
                    <span key={lang} className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                      {lang} · {count}
                    </span>
                  ))}
                </div>
              )}
              <div className="text-[10px] text-slate-500">
                {summary.services.length} services: {summary.services.map(s => s.name).join(', ')}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-950/40 border border-red-800 rounded-lg p-3">
              <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-300 font-mono break-all">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={scanning}
            className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg disabled:opacity-30"
          >
            {summary ? 'Close' : 'Cancel'}
          </button>
          <button
            onClick={handleScan}
            disabled={scanning || !repoUrl || !apiKey}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
          >
            {scanning ? <><Loader size={12} className="animate-spin" />Scanning...</> : <><ScanSearch size={12} />Scan</>}
          </button>
        </div>
      </div>
    </div>
  );
}
