import { useState } from 'react';
import { X, ScanSearch, Loader, AlertCircle } from 'lucide-react';
import { scanRepo } from '../lib/scanEngine';
import type { ScanResult } from '../lib/scanEngine';

interface Props {
  onClose: () => void;
  onResult: (result: ScanResult) => void;
}

export default function ScanModal({ onClose, onResult }: Props) {
  const [repoUrl, setRepoUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [pat, setPat] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const handleScan = async () => {
    if (!repoUrl || !apiKey) return;
    setScanning(true);
    setError(null);
    setStatus('Cloning repository...');

    try {
      setStatus('Embedding code with nomic-embed-code...');
      const result = await scanRepo(repoUrl, apiKey, pat || undefined);
      setStatus(`Done — ${result.meta.nodes} nodes, ${result.meta.links} links`);
      onResult(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[480px] flex flex-col">
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
            Point the scanner at any GitHub repo. It clones it locally, embeds all code with
            <span className="text-violet-300 font-mono"> nomic-embed-code</span>, then asks
            Claude to extract the architecture.
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

          {scanning && (
            <div className="flex items-center gap-2 text-violet-400 text-xs">
              <Loader size={12} className="animate-spin" />
              {status}
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
            Cancel
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
