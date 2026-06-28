import { useState, useMemo, useCallback, useEffect } from 'react';
import { SlidersHorizontal, X, ScanSearch, Globe, ChevronDown } from 'lucide-react';
import Graph3D from './components/Graph3D';
import NodePanel from './components/NodePanel';
import EdgePanel from './components/EdgePanel';
import FlowSelector from './components/FlowSelector';
import FilterBar from './components/FilterBar';
import EvidencePanel from './components/EvidencePanel';
import AgentPanel from './components/AgentPanel';
import ScanModal from './components/ScanModal';
import CodeExplorer from './components/CodeExplorer';
import ArchitectureDiagram from './components/ArchitectureDiagram';
import type { AgentEvidence } from './components/EvidencePanel';
import { parseCalmDocument } from './lib/calmParser';
import type { GraphNode, GraphLink } from './lib/calmParser';
import { startHealthPoller } from './lib/healthPoller';
import type { HealthMap } from './lib/healthPoller';
import type { ScanResult, RepoCodeGraph } from './lib/scanEngine';
import rawArch from './data/architecture.json';

const defaultGraph = parseCalmDocument(rawArch as any);

interface ScannedGraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  repoLabel: string;
  repoUrl: string;
  graphLabel: string;
  repoId: string | null;
  codeGraph: RepoCodeGraph | null;
}

const SCANNED_STORAGE_KEY = 'visualizer-scanned-graph';
const SCANNED_REPOS_KEY = 'visualizer-scanned-repos';

interface RecentRepoEntry {
  repoUrl: string;
  repoLabel: string;
  graphData: ScannedGraphData;
}

export default function App() {
  const [runtimeGraph] = useState(defaultGraph);

  const [viewMode, setViewMode] = useState<'runtime' | 'scanned'>('runtime');
  const [scannedGraph, setScannedGraph] = useState<ScannedGraphData | null>(null);
  const [recentRepos, setRecentRepos] = useState<RecentRepoEntry[]>([]);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<GraphLink | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set(['network']));
  const [hiddenProtocols, setHiddenProtocols] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [runtimeReposOpen, setRuntimeReposOpen] = useState(false);
  const [healthMap, setHealthMap] = useState<HealthMap>(new Map());
  const [evidenceNode, setEvidenceNode] = useState<GraphNode | null>(null);
  const [agentEvidence, setAgentEvidence] = useState<AgentEvidence | null>(null);
  const [codeExplorerNode, setCodeExplorerNode] = useState<GraphNode | null>(null);

  // Load scanned graph + recent repos from localStorage on mount
  useEffect(() => {
    try {
      // Load multi-repo cache
      const reposRaw = localStorage.getItem(SCANNED_REPOS_KEY);
      if (reposRaw) {
        const repos = JSON.parse(reposRaw) as RecentRepoEntry[];
        setRecentRepos(repos);
      }
      // Restore last viewed scanned graph
      const saved = localStorage.getItem(SCANNED_STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved) as ScannedGraphData;
        setScannedGraph(data);
      }
    } catch { /* ignore corrupt storage */ }
  }, []);

  // Always run health poller for the runtime banking-system
  useEffect(() => startHealthPoller(setHealthMap), []);

  const isRuntime = viewMode === 'runtime';
  const { nodes: rtNodes, links: rtLinks, flows: rtFlows } = runtimeGraph;

  const visibleNodeCount = useMemo(
    () => rtNodes.filter(n => !hiddenTypes.has(n.nodeType)).length,
    [rtNodes, hiddenTypes],
  );
  const visibleLinkCount = useMemo(
    () => rtLinks.filter(l => !l.hidden && !hiddenProtocols.has(l.protocol)).length,
    [rtLinks, hiddenProtocols],
  );

  const saveToRecentRepos = useCallback((data: ScannedGraphData) => {
    setRecentRepos(prev => {
      const entry: RecentRepoEntry = { repoUrl: data.repoUrl, repoLabel: data.repoLabel, graphData: data };
      // Replace if same URL exists, otherwise prepend
      const filtered = prev.filter(r => r.repoUrl !== data.repoUrl);
      const next = [entry, ...filtered].slice(0, 10); // cap at 10
      try { localStorage.setItem(SCANNED_REPOS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleScanResult = useCallback((result: ScanResult) => {
    const repoUrl = result.meta.repo;
    const repoName = repoUrl.split('/').slice(-1)[0] ?? repoUrl;
    const newScanned: ScannedGraphData = {
      nodes: result.nodes,
      links: result.links,
      repoLabel: repoName,
      repoUrl,
      graphLabel: `${result.meta.services_found} services · scanned`,
      repoId: result.meta.repo_id ?? null,
      codeGraph: result.code_graph ?? null,
    };
    setScannedGraph(newScanned);
    setViewMode('scanned');
    setSelectedNode(null);
    setSelectedLink(null);
    setSelectedFlow(null);
    setEvidenceNode(null);
    setAgentEvidence(null);
    setCodeExplorerNode(null);
    setShowScan(false);

    try {
      localStorage.setItem(SCANNED_STORAGE_KEY, JSON.stringify(newScanned));
    } catch { /* storage full or unavailable */ }
    saveToRecentRepos(newScanned);
  }, [saveToRecentRepos]);

  const handleSwitchRepo = useCallback((repoUrl: string) => {
    const entry = recentRepos.find(r => r.repoUrl === repoUrl);
    if (!entry) return;
    setScannedGraph(entry.graphData);
    setViewMode('scanned');
    setSelectedNode(null);
    setSelectedLink(null);
    setSelectedFlow(null);
    setEvidenceNode(null);
    setAgentEvidence(null);
    setCodeExplorerNode(null);
    try { localStorage.setItem(SCANNED_STORAGE_KEY, JSON.stringify(entry.graphData)); } catch {}
  }, [recentRepos]);

  const handleBackToRuntime = useCallback(() => {
    setViewMode('runtime');
    setSelectedNode(null);
    setSelectedLink(null);
    setSelectedFlow(null);
    setEvidenceNode(null);
    setAgentEvidence(null);
    setCodeExplorerNode(null);
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    setSelectedLink(null);
    setEvidenceNode(null);
    setAgentEvidence(null);
    setCodeExplorerNode(null);
  }, []);

  const handleLinkClick = useCallback((link: GraphLink) => {
    setSelectedLink(link);
    setSelectedNode(null);
    setEvidenceNode(null);
    setAgentEvidence(null);
    setCodeExplorerNode(null);
  }, []);

  const handleToggleType = useCallback((type: string) => {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }, []);

  const handleToggleProtocol = useCallback((proto: string) => {
    setHiddenProtocols(prev => {
      const next = new Set(prev);
      next.has(proto) ? next.delete(proto) : next.add(proto);
      return next;
    });
  }, []);

  // ── Scanned view: Architecture Diagram ─────────────────────────────────────
  if (!isRuntime && scannedGraph) {
    return (
      <>
        <ArchitectureDiagram
          scannedGraph={scannedGraph}
          onBackToRuntime={handleBackToRuntime}
          onScan={() => setShowScan(true)}
          recentRepos={recentRepos.map(r => ({ repoLabel: r.repoLabel, repoUrl: r.repoUrl }))}
          onSwitchRepo={handleSwitchRepo}
        />
        {showScan && (
          <ScanModal
            onClose={() => setShowScan(false)}
            onResult={handleScanResult}
          />
        )}
      </>
    );
  }

  // ── Runtime view: 3D graph + panels ─────────────────────────────────────────
  return (
    <div className="w-screen h-screen bg-[#0a0f1a] overflow-hidden relative">
      <Graph3D
        nodes={rtNodes}
        links={rtLinks}
        selectedFlow={selectedFlow}
        hiddenTypes={hiddenTypes}
        hiddenProtocols={hiddenProtocols}
        onNodeClick={handleNodeClick}
        onLinkClick={handleLinkClick}
        healthMap={healthMap}
      />

      {/* Top bar */}
      <div className="absolute top-4 left-4 flex items-center gap-3 pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl px-4 py-2.5 flex items-center gap-4 pointer-events-auto">
          <div>
            <span className="text-white font-bold text-sm">Banking System</span>
            <span className="text-slate-500 text-xs ml-2">CALM 1.2</span>
          </div>
          <div className="w-px h-4 bg-slate-700" />
          <div className="text-slate-400 text-xs">
            <span className="text-white font-medium">{visibleNodeCount}</span> nodes
            <span className="mx-1.5 text-slate-600">·</span>
            <span className="text-white font-medium">{visibleLinkCount}</span> edges
          </div>
          <div className="w-px h-4 bg-slate-700" />
          <FlowSelector flows={rtFlows} selectedFlow={selectedFlow} onChange={setSelectedFlow} />
          {selectedFlow && (
            <button onClick={() => setSelectedFlow(null)} className="text-slate-500 hover:text-white">
              <X size={14} />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(v => !v)}
          className="bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl px-3 py-2.5 text-slate-400 hover:text-white transition-colors pointer-events-auto flex items-center gap-2 text-xs"
        >
          <SlidersHorizontal size={14} />
          Filters
          {(hiddenTypes.size > 1 || hiddenProtocols.size > 0) && (
            <span className="bg-violet-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center">
              {hiddenTypes.size - 1 + hiddenProtocols.size}
            </span>
          )}
        </button>

        <button
          onClick={() => setShowScan(true)}
          className="bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl px-3 py-2.5 text-slate-400 hover:text-violet-400 transition-colors pointer-events-auto flex items-center gap-2 text-xs"
        >
          <ScanSearch size={14} />
          Scan Repo
        </button>

        {/* Recent scanned repos dropdown */}
        {recentRepos.length > 0 && (
          <div className="relative pointer-events-auto">
            <button
              onClick={() => setRuntimeReposOpen(v => !v)}
              className="bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl px-3 py-2.5 text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-xs"
            >
              <Globe size={14} />
              Recent Scans
              <span className="bg-violet-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center">
                {recentRepos.length}
              </span>
              <ChevronDown size={12} className={`transition-transform ${runtimeReposOpen ? 'rotate-180' : ''}`} />
            </button>
            {runtimeReposOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setRuntimeReposOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 w-72 max-h-64 overflow-y-auto bg-slate-900 border border-slate-700 rounded-lg shadow-xl">
                  <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                    Recently Scanned Repositories
                  </div>
                  {recentRepos.map(r => (
                    <button
                      key={r.repoUrl}
                      onClick={() => { handleSwitchRepo(r.repoUrl); setRuntimeReposOpen(false); }}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs border-b border-slate-800/50 hover:bg-slate-800 transition-colors"
                    >
                      <Globe size={12} className="text-slate-500 shrink-0" />
                      <span className="flex-1 truncate text-slate-200">{r.repoLabel}</span>
                      <span className="shrink-0 text-[10px] text-slate-500 font-mono">
                        {r.graphData.nodes.length} nodes
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="absolute top-16 left-4 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-xl p-4 pointer-events-auto z-10 max-w-lg">
          <FilterBar
            hiddenTypes={hiddenTypes}
            hiddenProtocols={hiddenProtocols}
            onToggleType={handleToggleType}
            onToggleProtocol={handleToggleProtocol}
          />
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur border border-slate-800 rounded-xl px-3 py-2 pointer-events-none">
        <div className="flex gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-slate-200 inline-block rounded" />HTTPS sync</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 border-t-2 border-dashed border-orange-400 inline-block" />AMQP async</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 border-t border-dotted border-amber-400 inline-block" />JDBC/TCP</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />DOWN</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />External</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-400 inline-block" />Service</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />Database</span>
        </div>
      </div>

      {selectedNode && !evidenceNode && !codeExplorerNode && (
        <NodePanel
          node={selectedNode}
          allLinks={rtLinks}
          allNodes={rtNodes}
          health={healthMap.get(selectedNode.id)}
          hasCodeGraph={!!scannedGraph?.codeGraph || !!scannedGraph?.repoId}
          onClose={() => setSelectedNode(null)}
          onCollectEvidence={node => { setEvidenceNode(node); setSelectedNode(null); }}
          onExploreCode={node => { setCodeExplorerNode(node); setSelectedNode(null); }}
        />
      )}
      {selectedLink && !evidenceNode && !codeExplorerNode && (
        <EdgePanel
          link={selectedLink}
          allNodes={rtNodes}
          onClose={() => setSelectedLink(null)}
        />
      )}
      {evidenceNode && !agentEvidence && !codeExplorerNode && (
        <EvidencePanel
          node={evidenceNode}
          allLinks={rtLinks}
          allNodes={rtNodes}
          repoId={scannedGraph?.repoId ?? null}
          codeGraph={scannedGraph?.codeGraph ?? null}
          onClose={() => setEvidenceNode(null)}
          onSendToAgent={ev => { setAgentEvidence(ev); setEvidenceNode(null); }}
        />
      )}
      {agentEvidence && (
        <AgentPanel
          evidence={agentEvidence}
          onClose={() => setAgentEvidence(null)}
        />
      )}
      {codeExplorerNode && (
        <CodeExplorer
          serviceName={codeExplorerNode.name}
          repoId={scannedGraph?.repoId ?? null}
          codeGraph={scannedGraph?.codeGraph ?? null}
          onClose={() => setCodeExplorerNode(null)}
        />
      )}
      {showScan && (
        <ScanModal
          onClose={() => setShowScan(false)}
          onResult={handleScanResult}
        />
      )}
    </div>
  );
}
