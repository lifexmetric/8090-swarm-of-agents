import { useState, useEffect, useRef } from 'react';
import { X, Bot, Settings, ArrowRight, Loader, GitPullRequest, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import type { AgentEvidence } from './EvidencePanel';
import { getConfig, saveConfig, createSession, diagnose, createPR } from '../lib/platform';
import type { Diagnosis } from '../lib/platform';

interface Props {
  evidence: AgentEvidence;
  onClose: () => void;
}

type Phase = 'loading' | 'needs-config' | 'ready' | 'diagnosing' | 'diagnosed' | 'creating-pr' | 'pr-created' | 'error';

export default function AgentPanel({ evidence, onClose }: Props) {
  const { node, calmCtx, repoId } = evidence;

  const [phase, setPhase] = useState<Phase>('loading');
  const [configOpen, setConfigOpen] = useState(false);
  const [configValues, setConfigValues] = useState({ anthropic_key: '', github_pat: '', github_repo: '' });
  const [configuredKeys, setConfiguredKeys] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionMeta, setSessionMeta] = useState<{ commitCount: number; logsAvailable: boolean; codeGraphAvailable: boolean } | null>(null);

  const [thinkingText, setThinkingText] = useState('');
  const [streamText, setStreamText] = useState('');
  const [currentDiagnosis, setCurrentDiagnosis] = useState<Diagnosis | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getConfig()
      .then(keys => {
        setConfiguredKeys(keys);
        if (!keys.anthropic_key) {
          setPhase('needs-config');
          setConfigOpen(true);
        } else {
          setPhase('ready');
        }
      })
      .catch(() => {
        setPhase('needs-config');
        setConfigOpen(true);
      });
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [streamText]);

  useEffect(() => {
    if (thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinkingText]);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await saveConfig(configValues);
      const keys = await getConfig();
      setConfiguredKeys(keys);
      setConfigValues({ anthropic_key: '', github_pat: '', github_repo: '' });
      setConfigOpen(false);
      if (keys.anthropic_key) setPhase('ready');
    } finally {
      setSaving(false);
    }
  };

  const handleDiagnose = async () => {
    setPhase('diagnosing');
    setThinkingText('');
    setStreamText('');
    setCurrentDiagnosis(null);
    setError(null);
    let diagnosisReceived = false;

    try {
      const sess = await createSession(node.id, node.name, calmCtx, repoId);
      setSessionId(sess.id);
      setSessionMeta({ commitCount: sess.commitCount, logsAvailable: sess.logsAvailable, codeGraphAvailable: sess.codeGraphAvailable });

      await diagnose(
        sess.id,
        text => setStreamText(prev => prev + text),
        diag => {
          diagnosisReceived = true;
          setCurrentDiagnosis(diag);
          setPhase('diagnosed');
        },
        err => {
          setError(err);
          setPhase('error');
        },
        text => setThinkingText(prev => prev + text),
      );

      if (!diagnosisReceived) setPhase('diagnosed');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  };

  const handleCreatePR = async () => {
    if (!sessionId || !currentDiagnosis) return;
    setPhase('creating-pr');
    try {
      const result = await createPR(sessionId, currentDiagnosis);
      setPrUrl(result.prUrl);
      setPhase('pr-created');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  };

  const anyKeyMissing = !configuredKeys.anthropic_key;
  const ghKeysSet = !!(configuredKeys.github_pat && configuredKeys.github_repo);

  return (
    <div
      className="absolute top-4 right-4 w-[560px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col z-30 max-h-[90vh]"
      style={{ borderLeftColor: '#7c3aed', borderLeftWidth: 3 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-violet-400" />
          <span className="text-sm font-semibold text-white">Agent</span>
          <ArrowRight size={12} className="text-slate-500" />
          <span className="text-sm text-violet-400 font-mono">{node.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfigOpen(v => !v)}
            className={`transition-colors ${configOpen ? 'text-violet-400' : 'text-slate-500 hover:text-white'}`}
            title="API key settings"
          >
            <Settings size={14} />
          </button>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
        </div>
      </div>

      {/* Config drawer */}
      {configOpen && (
        <div className="border-b border-slate-800 px-4 py-3 shrink-0 bg-slate-800/30">
          <p className="text-[11px] text-slate-500 mb-3">Keys are AES-256 encrypted at rest on the platform server — never stored in the browser.</p>
          <div className="space-y-2">
            {([
              { key: 'anthropic_key', label: 'Anthropic API Key', placeholder: configuredKeys.anthropic_key ? '(saved — enter to replace)' : 'sk-ant-...' },
              { key: 'github_pat', label: 'GitHub PAT', placeholder: configuredKeys.github_pat ? '(saved — enter to replace)' : 'ghp_...' },
              { key: 'github_repo', label: 'GitHub Repo (owner/repo)', placeholder: configuredKeys.github_repo ? '(saved — enter to replace)' : 'org/repo' },
            ] as const).map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-[11px] text-slate-400 mb-0.5">{label}</label>
                <input
                  type={key === 'github_repo' ? 'text' : 'password'}
                  autoComplete="off"
                  value={configValues[key]}
                  onChange={e => setConfigValues(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 font-mono"
                />
              </div>
            ))}
          </div>
          <button
            onClick={handleSaveConfig}
            disabled={saving || Object.values(configValues).every(v => !v)}
            className="mt-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save keys'}
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">

        {phase === 'loading' && (
          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <Loader size={12} className="animate-spin" />Checking configuration...
          </div>
        )}

        {phase === 'needs-config' && !configOpen && (
          <p className="text-slate-400 text-xs">
            Configure your API keys with the <Settings size={10} className="inline" /> icon to get started.
          </p>
        )}

        {/* Evidence summary — once session is created */}
        {sessionMeta && (
          <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-xs text-slate-400 flex gap-4">
            <span><span className="text-white font-medium">{sessionMeta.commitCount}</span> commits analysed</span>
            <span className={sessionMeta.logsAvailable ? 'text-green-400' : 'text-slate-500'}>
              logs {sessionMeta.logsAvailable ? 'included' : 'unavailable'}
            </span>
            <span className={sessionMeta.codeGraphAvailable ? 'text-cyan-400' : 'text-slate-500'}>
              code {sessionMeta.codeGraphAvailable ? 'included' : 'not embedded'}
            </span>
            {sessionId && <span className="font-mono text-slate-600 ml-auto">{sessionId.slice(0, 8)}</span>}
          </div>
        )}

        {/* Diagnose button */}
        {phase === 'ready' && (
          <>
            {anyKeyMissing && (
              <p className="text-amber-400 text-xs">Anthropic API key required. Open settings above.</p>
            )}
            <button
              onClick={handleDiagnose}
              disabled={anyKeyMissing}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Bot size={14} /> Diagnose with Claude
            </button>
          </>
        )}

        {/* Thinking stream (extended thinking CoT) */}
        {(phase === 'diagnosing' || thinkingText) && !currentDiagnosis && (
          <div>
            <div className="text-[10px] text-slate-600 mb-1 flex items-center gap-1.5 uppercase tracking-wide">
              {phase === 'diagnosing' && !thinkingText && <Loader size={10} className="animate-spin" />}
              Thinking
            </div>
            <div
              ref={thinkingRef}
              className="bg-slate-950 rounded-lg p-3 text-[11px] text-slate-500 font-mono leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap italic"
            >
              {thinkingText || <span className="text-slate-700 animate-pulse">Analyzing evidence...</span>}
            </div>
          </div>
        )}

        {/* Reasoning stream (text output after thinking) */}
        {(phase === 'diagnosing' || streamText) && !currentDiagnosis && (
          <div>
            <div className="text-[10px] text-slate-500 mb-1 flex items-center gap-1.5 uppercase tracking-wide">
              {phase === 'diagnosing' && !streamText && <Loader size={10} className="animate-spin" />}
              Claude reasoning
            </div>
            <div
              ref={logRef}
              className="bg-slate-950 rounded-lg p-3 text-[11px] text-slate-300 font-mono leading-relaxed max-h-52 overflow-y-auto whitespace-pre-wrap"
            >
              {streamText || <span className="text-slate-600 animate-pulse">Waiting for reasoning...</span>}
            </div>
          </div>
        )}

        {/* Structured diagnosis */}
        {currentDiagnosis && (
          <div className="space-y-3">
            <div className="bg-red-950/30 border border-red-900/60 rounded-lg p-3">
              <div className="text-[10px] text-red-400 font-semibold mb-1.5 uppercase tracking-wide">Root Cause</div>
              <p className="text-sm text-slate-200 leading-relaxed">{currentDiagnosis.root_cause}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-[10px] text-slate-500 font-semibold mb-1.5 uppercase tracking-wide">File to Fix</div>
              <code className="text-xs text-violet-300 font-mono break-all">{currentDiagnosis.file_path}</code>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-[10px] text-slate-500 font-semibold mb-1.5 uppercase tracking-wide">Explanation</div>
              <p className="text-sm text-slate-300 leading-relaxed">{currentDiagnosis.explanation}</p>
            </div>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && error && (
          <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-red-300 font-medium mb-1">Error</p>
              <p className="text-xs text-red-400 font-mono break-all">{error}</p>
            </div>
          </div>
        )}

        {/* PR created */}
        {phase === 'pr-created' && prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-green-950/40 border border-green-800 rounded-lg p-3 text-green-400 hover:bg-green-950/60 transition-colors"
          >
            <CheckCircle size={14} className="shrink-0" />
            <span className="text-sm font-medium">PR created</span>
            <span className="text-green-600 text-xs truncate flex-1 font-mono">{prUrl.replace('https://github.com/', '')}</span>
            <ExternalLink size={12} className="shrink-0" />
          </a>
        )}
      </div>

      {/* Footer — Create PR */}
      {(phase === 'diagnosed' || phase === 'creating-pr') && currentDiagnosis && (
        <div className="border-t border-slate-800 px-4 py-3 shrink-0 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {!ghKeysSet && 'GitHub PAT + repo required to open PR'}
          </span>
          <button
            onClick={handleCreatePR}
            disabled={phase === 'creating-pr' || !ghKeysSet}
            className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            {phase === 'creating-pr' ? (
              <><Loader size={12} className="animate-spin" />Creating PR...</>
            ) : (
              <><GitPullRequest size={12} />Create PR</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
