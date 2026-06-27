import { useRef, useCallback, useMemo, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import type { GraphNode, GraphLink } from '../lib/calmParser';
import type { HealthMap } from '../lib/healthPoller';
import { NODE_COLORS, HEALTH_DOWN_COLOR } from '../constants/styleMap';

interface Props {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedFlow: string | null;
  hiddenTypes: Set<string>;
  hiddenProtocols: Set<string>;
  onNodeClick: (node: GraphNode) => void;
  onLinkClick: (link: GraphLink) => void;
  healthMap?: HealthMap;
}

export default function Graph3D({
  nodes,
  links,
  selectedFlow,
  hiddenTypes,
  hiddenProtocols,
  onNodeClick,
  onLinkClick,
  healthMap = new Map() as HealthMap,
}: Props) {
  const fgRef = useRef<any>(null);
  const [w, h] = [window.innerWidth, window.innerHeight];

  const visibleNodes = useMemo(
    () => nodes.filter(n => !hiddenTypes.has(n.nodeType)),
    [nodes, hiddenTypes]
  );

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map(n => n.id)),
    [visibleNodes]
  );

  const visibleLinks = useMemo(
    () =>
      links.filter(l => {
        if (l.hidden) return false;
        if (hiddenProtocols.has(l.protocol)) return false;
        const src = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
        const dst = typeof l.target === 'string' ? l.target : (l.target as GraphNode).id;
        return visibleNodeIds.has(src) && visibleNodeIds.has(dst);
      }),
    [links, hiddenProtocols, visibleNodeIds]
  );

  const flowNodeIds = useMemo(() => {
    if (!selectedFlow) return null;
    return new Set(nodes.filter(n => n.flowIds.includes(selectedFlow)).map(n => n.id));
  }, [nodes, selectedFlow]);

  const flowLinkIds = useMemo(() => {
    if (!selectedFlow) return null;
    return new Set(links.filter(l => l.flowIds.includes(selectedFlow)).map(l => l.id));
  }, [links, selectedFlow]);

  const nodeThreeObject = useCallback(
    (node: object) => {
      const n = node as GraphNode;
      const healthEntry = healthMap.get(n.id);
      const isDown = healthEntry?.status === 'down';
      const inFlow = !flowNodeIds || flowNodeIds.has(n.id);
      const color = isDown ? HEALTH_DOWN_COLOR : (NODE_COLORS[n.nodeType] ?? '#94a3b8');
      const opacity = inFlow ? 1 : 0.06;

      const geo = new THREE.SphereGeometry(n.size * 0.5, 16, 16);
      const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity });
      const mesh = new THREE.Mesh(geo, mat);

      // Flow highlight ring
      if (inFlow && selectedFlow) {
        const ringGeo = new THREE.RingGeometry(n.size * 0.6, n.size * 0.78, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.5,
        });
        mesh.add(new THREE.Mesh(ringGeo, ringMat));
      }

      // DOWN halo ring — bright red outer glow
      if (isDown) {
        const haloGeo = new THREE.RingGeometry(n.size * 0.65, n.size * 0.95, 32);
        const haloMat = new THREE.MeshBasicMaterial({
          color: HEALTH_DOWN_COLOR,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        });
        mesh.add(new THREE.Mesh(haloGeo, haloMat));
      }

      return mesh;
    },
    [flowNodeIds, selectedFlow, healthMap]
  );

  // For links, handle dimming via color (return near-bg color for out-of-flow links)
  const linkColor = useCallback(
    (link: object) => {
      const l = link as GraphLink;
      const srcId = typeof l.source === 'string' ? l.source : (l.source as GraphNode).id;
      if (healthMap.get(srcId)?.status === 'down') return HEALTH_DOWN_COLOR;
      if (!flowLinkIds) return l.color;
      return flowLinkIds.has(l.id) ? l.color : '#0d1525';
    },
    [flowLinkIds, healthMap]
  );

  const linkWidth = useCallback(
    (link: object) => {
      const l = link as GraphLink;
      if (!flowLinkIds) return l.width;
      return flowLinkIds.has(l.id) ? l.width : 0.1;
    },
    [flowLinkIds]
  );

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    setTimeout(() => fg.cameraPosition({ x: 0, y: -200, z: 400 }, { x: 0, y: 0, z: 0 }, 1500), 300);
  }, []);

  const handleNodeClick = useCallback(
    (node: object) => onNodeClick(node as GraphNode),
    [onNodeClick]
  );

  const handleLinkClick = useCallback(
    (link: object) => onLinkClick(link as GraphLink),
    [onLinkClick]
  );

  return (
    <ForceGraph3D
      ref={fgRef}
      width={w}
      height={h}
      graphData={{ nodes: visibleNodes, links: visibleLinks }}
      nodeId="id"
      nodeLabel="name"
      nodeThreeObject={nodeThreeObject}
      nodeThreeObjectExtend={false}
      linkSource="source"
      linkTarget="target"
      linkColor={linkColor}
      linkWidth={linkWidth}
      linkDirectionalArrowLength={4}
      linkDirectionalArrowRelPos={1}
      linkDirectionalArrowColor={linkColor}
      linkCurvature={0.1}
      onNodeClick={handleNodeClick}
      onLinkClick={handleLinkClick}
      backgroundColor="#0a0f1a"
      showNavInfo={false}
    />
  );
}
