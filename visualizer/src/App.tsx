import { useState, useMemo, useCallback, useEffect } from 'react';
import { SlidersHorizontal, X, ScanSearch } from 'lucide-react';
import Graph3D from './components/Graph3D';
import NodePanel from './components/NodePanel';
import EdgePanel from './components/EdgePanel';
import FlowSelector from './components/FlowSelector';
import FilterBar from './components/FilterBar';
import EvidencePanel from './components/EvidencePanel';
import AgentPanel from './components/AgentPanel';
import ScanModal from './components/ScanModal';
import type { AgentEvidence } from './components/EvidencePanel';
import { parseCalmDocument } from './lib/calmParser';
import type { GraphNode, GraphLink } from './lib/calmParser';
import { startHealthPoller } from './lib/healthPoller';
import type { HealthMap } from './lib/healthPoller';
import type { ScanResult } from './lib/scanEngine';
import rawArch from './data/architecture.json';

const defaultGraph = parseCalmDocument(rawArch as any);

export default function App() {
  const [graph, setGraph] = useState(defaultGraph);
  const { nodes, links, flows } = graph;

  const [repoLabel, setRepoLabel] = useState('Banking System');
  const [graphLabel, setGraphLabel] = useState('CALM 1.2');

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<GraphLink | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set(['network']));
  const [hiddenProtocols, setHiddenProtocols] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [healthMap, setHealthMap] = useState<HealthMap>(new Map());
  const [evidenceNode, setEvidenceNode] = useState<GraphNode | null>(null);
  const [agentEvidence, setAgentEvidence] = useState<AgentEvidence | null>(null);

  useEffect(() => startHealthPoller(setHealthMap), []);

  const handleScanResult = useCallback((result: ScanResult) => {
    // Scan engine returns raw node/link objects — wrap them as a parseable graph
    setGraph({ nodes: result.nodes, links: result.links, flows: [] });
    const repoName = result.meta.repo.split('/').slice(-1)[0] ?? result.meta.repo;
    setRepoLabel(repoName);
    setGraphLabel(`${result.meta.services_found} services · scanned`);
    setSelectedNode(null);
    setSelectedLink(null);
    setSelectedFlow(null);
    setEvidenceNode(null);
    setAgentEvidence(null);
    setShowScan(false);
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    setSelectedLink(null);
  }, []);

  const handleLinkClick = useCallback((link: GraphLink) => {
    setSelectedLink(link);
    setSelectedNode(null);
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

  const visibleNodeCount = useMemo(
    () => nodes.filter(n => !hiddenTypes.has(n.nodeType)).length,
    [nodes, hiddenTypes],
  );
  const visibleLinkCount = useMemo(
    () => links.filter(l => !l.hidden && !hiddenProtocols.has(l.protocol)).length,
    [links, hiddenProtocols],
  );

  return (
    <div className="w-screen h-screen bg-[#0a0f1a] overflow-hidden relative">
      <Graph3D
        nodes={nodes}
        links={links}
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
            <span className="text-white font-bold text-sm">{repoLabel}</span>
            <span className="text-slate-500 text-xs ml-2">{graphLabel}</span>
          </div>
          <div className="w-px h-4 bg-slate-700" />
          <div className="text-slate-400 text-xs">
            <span className="text-white font-medium">{visibleNodeCount}</span> nodes
            <span className="mx-1.5 text-slate-600">·</span>
            <span className="text-white font-medium">{visibleLinkCount}</span> edges
          </div>
          <div className="w-px h-4 bg-slate-700" />
          <FlowSelector flows={flows} selectedFlow={selectedFlow} onChange={setSelectedFlow} />
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

      {selectedNode && !evidenceNode && (
        <NodePanel
          node={selectedNode}
          allLinks={links}
          allNodes={nodes}
          health={healthMap.get(selectedNode.id)}
          onClose={() => setSelectedNode(null)}
          onCollectEvidence={node => { setEvidenceNode(node); setSelectedNode(null); }}
        />
      )}
      {selectedLink && !evidenceNode && (
        <EdgePanel
          link={selectedLink}
          allNodes={nodes}
          onClose={() => setSelectedLink(null)}
        />
      )}
      {evidenceNode && !agentEvidence && (
        <EvidencePanel
          node={evidenceNode}
          allLinks={links}
          allNodes={nodes}
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
      {showScan && (
        <ScanModal
          onClose={() => setShowScan(false)}
          onResult={handleScanResult}
        />
      )}
    </div>
  );
}
