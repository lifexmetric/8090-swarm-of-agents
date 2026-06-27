import { useState, useMemo, useCallback } from 'react';
import {
  ArrowLeft, ScanSearch, ChevronDown, ChevronRight,
  FileCode, FunctionSquare, Box, Server,
  ArrowRight, Layers, ChevronLeft,
} from 'lucide-react';
import CodeGraph2D from './CodeGraph2D';
import type { GraphNode2D, GraphEdge2D } from './CodeGraph2D';
import type { GraphNode, GraphLink } from '../lib/calmParser';
import type { RepoCodeGraph, ServiceCodeGraph, CodeGraphNode } from '../lib/scanEngine';

interface ScannedGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  repoLabel: string;
  graphLabel: string;
  repoId: string | null;
  codeGraph: RepoCodeGraph | null;
}

interface Props {
  scannedGraph: ScannedGraphData;
  onBackToRuntime: () => void;
  onScan: () => void;
}

type DrillLevel = 1 | 2 | 3 | 4;

function findServiceGraph(codeGraph: RepoCodeGraph | null, svcName: string): ServiceCodeGraph | null {
  if (!codeGraph) return null;
  if (codeGraph.services[svcName]) return codeGraph.services[svcName];
  const key = Object.keys(codeGraph.services).find(k => k.toLowerCase() === svcName.toLowerCase());
  return key ? codeGraph.services[key] : null;
}

const LEVEL_HINTS: Record<DrillLevel, string> = {
  1: 'Double-click a service to explore its code',
  2: 'Double-click a file to see functions and classes',
  3: 'Double-click a function to see its call graph',
  4: 'Click another function to recenter the call graph',
};

const LEVEL_LABELS: Record<DrillLevel, string> = {
  1: 'Architecture',
  2: 'Files',
  3: 'Functions & Classes',
  4: 'Call Graph',
};

export default function CodeGraphView({ scannedGraph, onBackToRuntime, onScan }: Props) {
  const [drillLevel, setDrillLevel] = useState<DrillLevel>(1);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const goBack = useCallback(() => {
    if (drillLevel > 1) {
      const newLevel = (drillLevel - 1) as DrillLevel;
      setDrillLevel(newLevel);
      setSelectedNodeId(null);
      if (newLevel < 2) setSelectedService(null);
      if (newLevel < 3) setSelectedFile(null);
    }
  }, [drillLevel]);

  const goToLevel1 = useCallback(() => {
    setDrillLevel(1);
    setSelectedService(null);
    setSelectedFile(null);
    setSelectedNodeId(null);
  }, []);

  // ── Graph data per level ────────────────────────────────────────────────────

  const graphData = useMemo<{ nodes: GraphNode2D[]; edges: GraphEdge2D[] }>(() => {
    if (drillLevel === 1) {
      return {
        nodes: scannedGraph.nodes.map(n => ({ id: n.id, label: n.name, type: n.nodeType })),
        edges: scannedGraph.links.map(l => ({ source: l.source, target: l.target, type: l.protocol })),
      };
    }

    const svcGraph = findServiceGraph(scannedGraph.codeGraph, selectedService ?? '');
    if (!svcGraph) return { nodes: [], edges: [] };

    if (drillLevel === 2) {
      const files = svcGraph.nodes.filter(n => n.type === 'file');
      return {
        nodes: files.map(f => ({ id: f.id, label: f.path ?? f.name, type: 'file' })),
        edges: svcGraph.edges
          .filter(e => e.type === 'imports')
          .filter(e => files.some(f => f.id === e.source) && files.some(f => f.id === e.target)),
      };
    }

    if (drillLevel === 3 && selectedFile) {
      const childIds = svcGraph.edges
        .filter(e => e.type === 'contains' && e.source === selectedFile)
        .map(e => e.target);
      const children = childIds
        .map(id => svcGraph.nodes.find(n => n.id === id))
        .filter(Boolean) as CodeGraphNode[];
      return {
        nodes: children.map(n => ({ id: n.id, label: n.name, type: n.type })),
        edges: svcGraph.edges
          .filter(e => e.type === 'calls')
          .filter(e => children.some(c => c.id === e.source) && children.some(c => c.id === e.target)),
      };
    }

    if (drillLevel === 4 && selectedNodeId) {
      const neighborIds = new Set<string>([selectedNodeId]);
      for (const e of svcGraph.edges) {
        if (e.type !== 'calls') continue;
        if (e.source === selectedNodeId) neighborIds.add(e.target);
        if (e.target === selectedNodeId) neighborIds.add(e.source);
      }
      const neighbors = [...neighborIds]
        .map(id => svcGraph.nodes.find(n => n.id === id))
        .filter(Boolean) as CodeGraphNode[];
      return {
        nodes: neighbors.map(n => ({ id: n.id, label: n.name, type: n.type })),
        edges: svcGraph.edges
          .filter(e => e.type === 'calls')
          .filter(e => neighbors.some(n => n.id === e.source) && neighbors.some(n => n.id === e.target)),
      };
    }

    return { nodes: [], edges: [] };
  }, [drillLevel, selectedService, selectedFile, selectedNodeId, scannedGraph]);

  // ── Drill in ────────────────────────────────────────────────────────────────

  const handleDrillIn = useCallback((nodeId: string) => {
    if (drillLevel === 1) {
      const node = scannedGraph.nodes.find(n => n.id === nodeId);
      if (node) {
        setSelectedService(node.name);
        setSelectedFile(null);
        setSelectedNodeId(null);
        setDrillLevel(2);
      }
    } else if (drillLevel === 2) {
      setSelectedFile(nodeId);
      setSelectedNodeId(null);
      setDrillLevel(3);
    } else if (drillLevel === 3) {
      setSelectedNodeId(nodeId);
      setDrillLevel(4);
    }
  }, [drillLevel, scannedGraph.nodes]);

  // ── Detail panel ────────────────────────────────────────────────────────────

  const detail = useMemo(() => {
    if (!selectedNodeId) return null;

    if (drillLevel === 1) {
      const node = scannedGraph.nodes.find(n => n.id === selectedNodeId);
      if (!node) return null;
      return { kind: 'arch' as const, node };
    }

    if (drillLevel === 2) {
      const svcGraph = findServiceGraph(scannedGraph.codeGraph, selectedService ?? '');
      const fileNode = svcGraph?.nodes.find(n => n.id === selectedNodeId);
      if (!fileNode) return null;
      const childIds = svcGraph!.edges
        .filter(e => e.type === 'contains' && e.source === selectedNodeId)
        .map(e => e.target);
      const children = childIds
        .map(id => svcGraph!.nodes.find(n => n.id === id))
        .filter(Boolean) as CodeGraphNode[];
      return { kind: 'file' as const, node: fileNode, children };
    }

    if (drillLevel >= 3) {
      const svcGraph = findServiceGraph(scannedGraph.codeGraph, selectedService ?? '');
      if (!svcGraph) return null;
      const node = svcGraph.nodes.find(n => n.id === selectedNodeId);
      if (!node) return null;
      const calls = svcGraph.edges
        .filter(e => e.type === 'calls' && e.source === selectedNodeId)
        .map(e => ({ node: svcGraph.nodes.find(n => n.id === e.target), line: e.line }))
        .filter(c => c.node);
      const calledBy = svcGraph.edges
        .filter(e => e.type === 'calls' && e.target === selectedNodeId)
        .map(e => ({ node: svcGraph.nodes.find(n => n.id === e.source), line: e.line }))
        .filter(c => c.node);
      return { kind: 'func' as const, node, calls, calledBy };
    }

    return null;
  }, [selectedNodeId, drillLevel, selectedService, scannedGraph]);

  const handleNavigateToFn = useCallback((fnId: string) => {
    setSelectedNodeId(fnId);
    setDrillLevel(4);
  }, []);

  // ── Sidebar tree ────────────────────────────────────────────────────────────

  const sidebarTree = useMemo(() => {
    if (!scannedGraph.codeGraph) return [];
    return Object.entries(scannedGraph.codeGraph.services).map(([svcName, svcGraph]) => {
      const files = svcGraph.nodes.filter(n => n.type === 'file');
      return {
        name: svcName,
        files: files.map(f => {
          const childIds = svcGraph.edges
            .filter(e => e.type === 'contains' && e.source === f.id)
            .map(e => e.target);
          const children = childIds
            .map(id => svcGraph.nodes.find(n => n.id === id))
            .filter(Boolean) as CodeGraphNode[];
          return { file: f, children };
        }),
      };
    });
  }, [scannedGraph.codeGraph]);

  const handleSidebarServiceClick = useCallback((svcName: string) => {
    setSelectedService(svcName);
    setSelectedFile(null);
    setSelectedNodeId(null);
    setDrillLevel(2);
  }, []);

  const handleSidebarFileClick = useCallback((svcName: string, fileId: string) => {
    setSelectedService(svcName);
    setSelectedFile(fileId);
    setSelectedNodeId(null);
    setDrillLevel(3);
  }, []);

  const handleSidebarFnClick = useCallback((svcName: string, fnId: string) => {
    setSelectedService(svcName);
    setSelectedNodeId(fnId);
    setDrillLevel(4);
  }, []);

  // ── Stats ───────────────────────────────────────────────────────────────────

  const svcStats = useMemo(() => {
    const sg = findServiceGraph(scannedGraph.codeGraph, selectedService ?? '');
    if (!sg) return null;
    return {
      files: sg.nodes.filter(n => n.type === 'file').length,
      functions: sg.nodes.filter(n => n.type === 'function').length,
      classes: sg.nodes.filter(n => n.type === 'class').length,
    };
  }, [selectedService, scannedGraph.codeGraph]);

  // ── Breadcrumb ──────────────────────────────────────────────────────────────

  const crumbs = useMemo(() => {
    const items: { label: string; onClick: () => void }[] = [
      { label: 'Architecture', onClick: goToLevel1 },
    ];
    if (drillLevel >= 2 && selectedService) {
      items.push({ label: selectedService, onClick: () => { setDrillLevel(2); setSelectedFile(null); setSelectedNodeId(null); } });
    }
    if (drillLevel >= 3 && selectedFile) {
      const sg = findServiceGraph(scannedGraph.codeGraph, selectedService ?? '');
      const fn = sg?.nodes.find(n => n.id === selectedFile);
      items.push({ label: fn?.name ?? selectedFile, onClick: () => { setDrillLevel(3); setSelectedNodeId(null); } });
    }
    if (drillLevel >= 4 && selectedNodeId) {
      const sg = findServiceGraph(scannedGraph.codeGraph, selectedService ?? '');
      const fn = sg?.nodes.find(n => n.id === selectedNodeId);
      items.push({ label: fn?.name ?? selectedNodeId, onClick: () => {} });
    }
    return items;
  }, [drillLevel, selectedService, selectedFile, selectedNodeId, scannedGraph.codeGraph, goToLevel1]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="w-screen h-screen bg-[#0a0f1a] flex flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/60 backdrop-blur shrink-0">
        <button
          onClick={onBackToRuntime}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          <ArrowLeft size={14} />
          Runtime
        </button>

        <div className="w-px h-5 bg-slate-700" />

        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm">{scannedGraph.repoLabel}</span>
          <span className="text-violet-400 text-[10px] px-1.5 py-0.5 bg-violet-950/60 rounded border border-violet-800/50">SCANNED</span>
        </div>

        <div className="w-px h-5 bg-slate-700" />

        {/* Back button (per level) */}
        {drillLevel > 1 && (
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <ChevronLeft size={14} />
            Back
          </button>
        )}

        {/* Breadcrumb */}
        <div className="flex items-center gap-1">
          {crumbs.map((crumb, i) => (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="text-slate-600" />}
              <button
                onClick={crumb.onClick}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  i === crumbs.length - 1
                    ? 'text-cyan-300 bg-cyan-950/40 font-medium'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {crumb.label}
              </button>
            </div>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="text-xs text-slate-500 mr-1">{LEVEL_LABELS[drillLevel]}</div>
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Layers size={14} />
            {sidebarOpen ? 'Hide Tree' : 'Show Tree'}
          </button>
          <button
            onClick={onScan}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-violet-400 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 transition-colors"
          >
            <ScanSearch size={14} />
            Scan Repo
          </button>
        </div>
      </div>

      {/* ── Main body ── */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-56 border-r border-slate-800 bg-slate-900/40 overflow-y-auto shrink-0">
            <div className="px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wide border-b border-slate-800/50 sticky top-0 bg-slate-900/80 backdrop-blur z-10">
              Code Tree
            </div>
            {sidebarTree.length === 0 && (
              <div className="px-3 py-6 text-xs text-slate-600 text-center">
                No code graph available.
              </div>
            )}
            {sidebarTree.map(svc => (
              <SidebarService
                key={svc.name}
                name={svc.name}
                files={svc.files}
                isActive={selectedService === svc.name}
                activeFileId={selectedFile}
                activeFnId={selectedNodeId}
                onServiceClick={() => handleSidebarServiceClick(svc.name)}
                onFileClick={(fileId) => handleSidebarFileClick(svc.name, fileId)}
                onFnClick={(fnId) => handleSidebarFnClick(svc.name, fnId)}
              />
            ))}
          </div>
        )}

        {/* Center: graph + hints */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Stats / hint bar */}
          <div className="flex items-center gap-3 px-4 py-1.5 border-b border-slate-800/50 text-xs shrink-0 bg-slate-900/20">
            {svcStats && drillLevel >= 2 && (
              <>
                <span className="flex items-center gap-1 text-slate-400"><FileCode size={11} className="text-violet-400" /> {svcStats.files}</span>
                <span className="flex items-center gap-1 text-slate-400"><FunctionSquare size={11} className="text-cyan-400" /> {svcStats.functions}</span>
                <span className="flex items-center gap-1 text-slate-400"><Box size={11} className="text-amber-400" /> {svcStats.classes}</span>
                <div className="w-px h-3 bg-slate-700" />
              </>
            )}
            {drillLevel === 1 && (
              <span className="text-slate-400">{scannedGraph.nodes.length} nodes · {scannedGraph.links.length} edges</span>
            )}
            <span className="ml-auto text-slate-500">{LEVEL_HINTS[drillLevel]}</span>
          </div>

          <CodeGraph2D
            nodes={graphData.nodes}
            edges={graphData.edges}
            selectedId={selectedNodeId}
            onSelect={setSelectedNodeId}
            onDrillIn={drillLevel < 4 ? handleDrillIn : undefined}
            emptyMessage={
              drillLevel === 2 ? 'No files found in this service' :
              drillLevel === 3 ? 'No functions or classes in this file' :
              drillLevel === 4 ? 'No call relationships found' :
              'No architecture data available'
            }
          />

          {/* Legend */}
          <div className="flex items-center gap-4 px-4 py-1.5 border-t border-slate-800/50 text-[10px] text-slate-500 shrink-0 bg-slate-900/20">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded bg-violet-500 inline-block" /> service / file
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block" /> function
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block" style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '8px solid #f59e0b' }} /> class / database
            </span>
            <div className="w-px h-3 bg-slate-700" />
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-cyan-500 inline-block" /> calls
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 border-t border-dashed border-violet-500 inline-block" /> imports
            </span>
          </div>
        </div>

        {/* ── Right detail panel ── */}
        {detail && (
          <div className="w-72 border-l border-slate-800 bg-slate-900/40 overflow-y-auto shrink-0">
            <div className="px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wide border-b border-slate-800/50 sticky top-0 bg-slate-900/80 backdrop-blur z-10">
              Details
            </div>
            <div className="p-3 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-2">
                {detail.kind === 'arch' && (
                  <Server size={14} className="text-slate-400 shrink-0" />
                )}
                {detail.kind === 'file' && (
                  <FileCode size={14} className="text-violet-400 shrink-0" />
                )}
                {detail.kind === 'func' && detail.node.type === 'class' && (
                  <Box size={14} className="text-amber-400 shrink-0" />
                )}
                {detail.kind === 'func' && detail.node.type === 'function' && (
                  <FunctionSquare size={14} className="text-cyan-400 shrink-0" />
                )}
                <span className="text-sm font-mono text-white break-all">{detail.node.name}</span>
              </div>

              {/* Architecture node (level 1) */}
              {detail.kind === 'arch' && (
                <div className="space-y-2">
                  {detail.node.description && (
                    <p className="text-xs text-slate-400 leading-relaxed">{detail.node.description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    {detail.node.nodeType && (
                      <div className="bg-slate-800/50 rounded px-2 py-1">
                        <span className="text-slate-500">Type: </span>
                        <span className="text-slate-300">{detail.node.nodeType}</span>
                      </div>
                    )}
                    {detail.node.language && (
                      <div className="bg-slate-800/50 rounded px-2 py-1">
                        <span className="text-slate-500">Lang: </span>
                        <span className="text-slate-300">{detail.node.language}</span>
                      </div>
                    )}
                    {detail.node.technology && (
                      <div className="bg-slate-800/50 rounded px-2 py-1">
                        <span className="text-slate-500">Tech: </span>
                        <span className="text-slate-300">{detail.node.technology}</span>
                      </div>
                    )}
                    {(detail.node as any).confidence && (
                      <div className="bg-slate-800/50 rounded px-2 py-1">
                        <span className="text-slate-500">Confidence: </span>
                        <span className="text-slate-300">{(detail.node as any).confidence}</span>
                      </div>
                    )}
                  </div>
                  {scannedGraph.codeGraph && findServiceGraph(scannedGraph.codeGraph, detail.node.name) && (
                    <button
                      onClick={() => handleDrillIn(detail.node.id)}
                      className="w-full text-xs text-violet-300 hover:text-violet-200 bg-violet-950/30 hover:bg-violet-950/50 border border-violet-800/30 rounded-lg px-3 py-2 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <FileCode size={12} />
                      Explore code
                    </button>
                  )}
                </div>
              )}

              {/* File node (level 2) */}
              {detail.kind === 'file' && (
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-500 font-mono">{detail.node.path ?? detail.node.name}</div>
                  {detail.node.language && (
                    <div className="text-[11px] text-slate-400">
                      Language: <span className="text-slate-300">{detail.node.language}</span>
                    </div>
                  )}
                  <div className="text-[11px] text-slate-400">
                    <span className="text-cyan-400">{detail.children.filter(c => c.type === 'function').length}</span> functions
                    {' · '}
                    <span className="text-amber-400">{detail.children.filter(c => c.type === 'class').length}</span> classes
                  </div>
                  <div className="space-y-1">
                    {detail.children.map(child => (
                      <button
                        key={child.id}
                        onClick={() => handleNavigateToFn(child.id)}
                        className="flex items-center gap-1.5 w-full text-left text-[11px] font-mono bg-slate-800/40 hover:bg-slate-800 px-2 py-1 rounded transition-colors"
                      >
                        {child.type === 'class' ? <Box size={10} className="text-amber-400 shrink-0" /> : <FunctionSquare size={10} className="text-cyan-400 shrink-0" />}
                        <span className="text-slate-300 truncate">{child.name}</span>
                        <span className="text-slate-600 ml-auto shrink-0">L{child.line}</span>
                      </button>
                    ))}
                    {detail.children.length === 0 && (
                      <p className="text-[11px] text-slate-600">No definitions found.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Function/class node (level 3+) */}
              {detail.kind === 'func' && (
                <div className="space-y-3">
                  <div className="text-[10px] text-slate-500 font-mono">
                    {detail.node.file}:{detail.node.line}
                  </div>

                  {/* Calls */}
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <ArrowRight size={9} className="text-cyan-400" /> Calls ({detail.calls.length})
                    </div>
                    <div className="space-y-1">
                      {detail.calls.map(({ node, line }) => (
                        <button
                          key={node!.id}
                          onClick={() => handleNavigateToFn(node!.id)}
                          className="flex items-center gap-1.5 w-full text-left text-[11px] text-cyan-300 hover:text-cyan-200 font-mono bg-slate-800/40 hover:bg-slate-800 px-2 py-1 rounded transition-colors"
                        >
                          <span className="truncate">{node!.name}</span>
                          {line && <span className="text-slate-600 ml-auto shrink-0">:{line}</span>}
                        </button>
                      ))}
                      {detail.calls.length === 0 && <p className="text-[10px] text-slate-600 px-1">None</p>}
                    </div>
                  </div>

                  {/* Called by */}
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                      <ArrowRight size={9} className="text-violet-400 rotate-180" /> Called by ({detail.calledBy.length})
                    </div>
                    <div className="space-y-1">
                      {detail.calledBy.map(({ node }) => (
                        <button
                          key={node!.id}
                          onClick={() => handleNavigateToFn(node!.id)}
                          className="flex items-center gap-1.5 w-full text-left text-[11px] text-violet-300 hover:text-violet-200 font-mono bg-slate-800/40 hover:bg-slate-800 px-2 py-1 rounded transition-colors"
                        >
                          <span className="truncate">{node!.name}</span>
                        </button>
                      ))}
                      {detail.calledBy.length === 0 && <p className="text-[10px] text-slate-600 px-1">None</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sidebar components ────────────────────────────────────────────────────────

function SidebarService({
  name, files, isActive, activeFileId, activeFnId,
  onServiceClick, onFileClick, onFnClick,
}: {
  name: string;
  files: Array<{ file: CodeGraphNode; children: CodeGraphNode[] }>;
  isActive: boolean;
  activeFileId: string | null;
  activeFnId: string | null;
  onServiceClick: () => void;
  onFileClick: (fileId: string) => void;
  onFnClick: (fnId: string) => void;
}) {
  const [open, setOpen] = useState(isActive);
  const fnCount = files.reduce((a, f) => a + f.children.filter(c => c.type === 'function').length, 0);
  const clsCount = files.reduce((a, f) => a + f.children.filter(c => c.type === 'class').length, 0);

  return (
    <div className="border-b border-slate-800/30">
      <button
        onClick={() => { onServiceClick(); setOpen(true); }}
        className={`w-full text-left flex items-center gap-1.5 py-2 px-3 hover:bg-slate-800/40 transition-colors ${isActive && !activeFileId ? 'bg-slate-800/30' : ''}`}
      >
        <span onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className="shrink-0">
          {open ? <ChevronDown size={12} className="text-slate-500" /> : <ChevronRight size={12} className="text-slate-500" />}
        </span>
        <Server size={12} className="text-violet-400 shrink-0" />
        <span className="text-xs text-slate-300 font-mono truncate">{name}</span>
        <span className="text-[9px] text-slate-600 ml-auto shrink-0">{files.length}f {fnCount}fn {clsCount}c</span>
      </button>
      {open && (
        <div>
          {files.map(({ file, children }) => (
            <SidebarFile
              key={file.id}
              file={file}
              children={children}
              isActive={activeFileId === file.id}
              activeFnId={activeFnId}
              onFileClick={() => onFileClick(file.id)}
              onFnClick={onFnClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarFile({
  file, children, isActive, activeFnId, onFileClick, onFnClick,
}: {
  file: CodeGraphNode;
  children: CodeGraphNode[];
  isActive: boolean;
  activeFnId: string | null;
  onFileClick: () => void;
  onFnClick: (fnId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="ml-3">
      <button
        onClick={() => { onFileClick(); setOpen(true); }}
        className={`w-full text-left flex items-center gap-1.5 py-1 px-2 hover:bg-slate-800/40 transition-colors ${isActive && !activeFnId ? 'bg-slate-800/30' : ''}`}
      >
        <span onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className="shrink-0">
          {open ? <ChevronDown size={10} className="text-slate-600" /> : <ChevronRight size={10} className="text-slate-600" />}
        </span>
        <FileCode size={11} className="text-violet-400/70 shrink-0" />
        <span className="text-[11px] text-slate-400 font-mono truncate">{file.path ?? file.name}</span>
        <span className="text-[9px] text-slate-600 ml-auto shrink-0">{children.length}</span>
      </button>
      {open && (
        <div className="ml-4 border-l border-slate-800/50 pl-1.5">
          {children.map(child => (
            <button
              key={child.id}
              onClick={() => onFnClick(child.id)}
              className={`w-full text-left flex items-center gap-1.5 py-0.5 px-2 rounded transition-colors ${activeFnId === child.id ? 'bg-cyan-950/40 text-cyan-300' : 'hover:bg-slate-800/40 text-slate-500'}`}
            >
              {child.type === 'class' ? <Box size={10} className="text-amber-400 shrink-0" /> : <FunctionSquare size={10} className="text-cyan-400 shrink-0" />}
              <span className="text-[10px] font-mono truncate">{child.name}</span>
              <span className="text-[9px] text-slate-600 ml-auto shrink-0">L{child.line}</span>
            </button>
          ))}
          {children.length === 0 && <span className="text-[9px] text-slate-600 px-2 py-0.5">empty</span>}
        </div>
      )}
    </div>
  );
}
