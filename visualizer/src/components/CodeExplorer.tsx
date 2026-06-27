import { useState, useMemo } from 'react';
import { X, FileCode, FunctionSquare, Box, ChevronDown, ChevronRight, ArrowRight, Loader, AlertCircle } from 'lucide-react';
import type { RepoCodeGraph, ServiceCodeGraph, CodeGraphNode } from '../lib/scanEngine';
import { getServiceCodeGraph } from '../lib/scanEngine';
import { useEffect } from 'react';

interface Props {
  serviceName: string;
  repoId: string | null;
  codeGraph: RepoCodeGraph | null;
  onClose: () => void;
}

export default function CodeExplorer({ serviceName, repoId, codeGraph, onClose }: Props) {
  const [graph, setGraph] = useState<ServiceCodeGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFn, setSelectedFn] = useState<CodeGraphNode | null>(null);

  useEffect(() => {
    // Try to get from the in-memory code graph first
    if (codeGraph?.services?.[serviceName]) {
      setGraph(codeGraph.services[serviceName]);
      setLoading(false);
      return;
    }

    // Fall back to fetching from scan engine
    if (!repoId) {
      setLoading(false);
      setError('Repo has not been embedded. Click "Scan Repo" to embed it for code-level context.');
      return;
    }

    setLoading(true);
    setError(null);
    getServiceCodeGraph(repoId, serviceName)
      .then(g => { setGraph(g); setLoading(false); })
      .catch(e => { setError(e instanceof Error ? e.message : String(e)); setLoading(false); });
  }, [serviceName, repoId, codeGraph]);

  // Build a tree: file → functions/classes
  const fileTree = useMemo(() => {
    if (!graph) return [];
    const files = graph.nodes.filter(n => n.type === 'file');
    const edges = graph.edges.filter(e => e.type === 'contains');

    return files.map(file => {
      const childIds = edges.filter(e => e.source === file.id).map(e => e.target);
      const children = childIds
        .map(id => graph.nodes.find(n => n.id === id))
        .filter(Boolean) as CodeGraphNode[];
      children.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
      return { node: file, children };
    }).sort((a, b) => a.node.path?.localeCompare(b.node.path ?? '') ?? 0);
  }, [graph]);

  // Call relationships for selected function
  const callInfo = useMemo(() => {
    if (!graph || !selectedFn) return null;
    const callsOut = graph.edges.filter(e => e.type === 'calls' && e.source === selectedFn.id);
    const callsIn = graph.edges.filter(e => e.type === 'calls' && e.target === selectedFn.id);
    const nodeById = (id: string) => graph.nodes.find(n => n.id === id);
    return {
      calls: callsOut.map(e => ({ node: nodeById(e.target), line: e.line })).filter(c => c.node),
      calledBy: callsIn.map(e => ({ node: nodeById(e.source), line: e.line })).filter(c => c.node),
    };
  }, [graph, selectedFn]);

  const stats = useMemo(() => {
    if (!graph) return { files: 0, functions: 0, classes: 0 };
    return {
      files: graph.nodes.filter(n => n.type === 'file').length,
      functions: graph.nodes.filter(n => n.type === 'function').length,
      classes: graph.nodes.filter(n => n.type === 'class').length,
    };
  }, [graph]);

  return (
    <div className="absolute top-4 right-4 w-[520px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col z-30 max-h-[90vh]" style={{ borderLeftColor: '#22d3ee', borderLeftWidth: 3 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode size={14} className="text-cyan-400 shrink-0" />
          <span className="text-sm font-semibold text-white">Code Explorer</span>
          <ArrowRight size={12} className="text-slate-500" />
          <span className="text-sm text-cyan-400 font-mono truncate">{serviceName}</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white shrink-0"><X size={16} /></button>
      </div>

      {/* Stats bar */}
      {graph && (
        <div className="flex items-center gap-4 px-4 py-2 border-b border-slate-800 shrink-0 text-xs text-slate-400">
          <span className="flex items-center gap-1"><FileCode size={11} className="text-violet-400" /> {stats.files} files</span>
          <span className="flex items-center gap-1"><FunctionSquare size={11} className="text-cyan-400" /> {stats.functions} functions</span>
          <span className="flex items-center gap-1"><Box size={11} className="text-amber-400" /> {stats.classes} classes</span>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && (
          <div className="flex items-center gap-2 text-slate-500 text-xs p-4">
            <Loader size={12} className="animate-spin" />Loading code graph...
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-800 rounded-lg p-3 m-4">
            <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-300">{error}</p>
          </div>
        )}

        {graph && !loading && (
          <div className="p-3 space-y-1">
            {fileTree.map(({ node: file, children }) => (
              <FileNode
                key={file.id}
                file={file}
                children={children}
                selectedFn={selectedFn}
                onSelectFn={setSelectedFn}
              />
            ))}
          </div>
        )}
      </div>

      {/* Call info footer */}
      {callInfo && selectedFn && (
        <div className="border-t border-slate-800 px-4 py-3 shrink-0 max-h-48 overflow-y-auto">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">
            <FunctionSquare size={10} className="inline text-cyan-400 mr-1" />
            {selectedFn.name}
            <span className="text-slate-600 ml-2">{selectedFn.file}:{selectedFn.line}</span>
          </div>
          {callInfo.calls.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] text-slate-600 mb-1">Calls:</div>
              <div className="flex flex-wrap gap-1.5">
                {callInfo.calls.map(({ node, line }) => (
                  <button
                    key={node!.id}
                    onClick={() => setSelectedFn(node!)}
                    className="text-[11px] text-cyan-300 hover:text-cyan-200 font-mono bg-slate-800 px-1.5 py-0.5 rounded"
                  >
                    {node!.name}<span className="text-slate-600">:{line}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {callInfo.calledBy.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-600 mb-1">Called by:</div>
              <div className="flex flex-wrap gap-1.5">
                {callInfo.calledBy.map(({ node }) => (
                  <button
                    key={node!.id}
                    onClick={() => setSelectedFn(node!)}
                    className="text-[11px] text-violet-300 hover:text-violet-200 font-mono bg-slate-800 px-1.5 py-0.5 rounded"
                  >
                    {node!.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {callInfo.calls.length === 0 && callInfo.calledBy.length === 0 && (
            <p className="text-[10px] text-slate-600">No call relationships found.</p>
          )}
        </div>
      )}
    </div>
  );
}

function FileNode({ file, children, selectedFn, onSelectFn }: {
  file: CodeGraphNode;
  children: CodeGraphNode[];
  selectedFn: CodeGraphNode | null;
  onSelectFn: (n: CodeGraphNode) => void;
}) {
  const [open, setOpen] = useState(false);
  const fnCount = children.filter(c => c.type === 'function').length;
  const clsCount = children.filter(c => c.type === 'class').length;

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left flex items-center gap-1.5 py-1 px-2 rounded hover:bg-slate-800/50 transition-colors"
      >
        {open ? <ChevronDown size={12} className="text-slate-500 shrink-0" /> : <ChevronRight size={12} className="text-slate-500 shrink-0" />}
        <FileCode size={12} className="text-violet-400 shrink-0" />
        <span className="text-xs text-slate-300 font-mono truncate">{file.path}</span>
        <span className="text-[10px] text-slate-600 ml-auto shrink-0">
          {fnCount > 0 && `${fnCount}fn`} {clsCount > 0 && `${clsCount}cls`}
        </span>
      </button>
      {open && (
        <div className="ml-6 border-l border-slate-800 pl-2">
          {children.map(child => (
            <button
              key={child.id}
              onClick={() => onSelectFn(child)}
              className={`w-full text-left flex items-center gap-1.5 py-1 px-2 rounded transition-colors ${
                selectedFn?.id === child.id ? 'bg-cyan-950/40 text-cyan-300' : 'hover:bg-slate-800/50 text-slate-400'
              }`}
            >
              {child.type === 'class' ? (
                <Box size={11} className="text-amber-400 shrink-0" />
              ) : (
                <FunctionSquare size={11} className="text-cyan-400 shrink-0" />
              )}
              <span className="text-xs font-mono truncate">{child.name}</span>
              <span className="text-[10px] text-slate-600 ml-auto shrink-0">L{child.line}</span>
            </button>
          ))}
          {children.length === 0 && (
            <span className="text-[10px] text-slate-600 px-2 py-1">No definitions found</span>
          )}
        </div>
      )}
    </div>
  );
}
