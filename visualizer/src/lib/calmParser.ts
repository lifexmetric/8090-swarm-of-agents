import { NODE_COLORS, NODE_SIZES, EDGE_COLORS, EDGE_WIDTHS } from '../constants/styleMap';
import type { NodeType, Protocol } from '../constants/styleMap';

// ── Raw CALM types ────────────────────────────────────────────────────────────

interface CalmInterface {
  'unique-id': string;
  type: string;
  port?: number;
}

interface CalmNode {
  'unique-id': string;
  'node-type': string;
  name: string;
  description?: string;
  'development-language'?: string;
  interfaces?: CalmInterface[];
  metadata?: Record<string, unknown>;
}

interface CalmRelationship {
  'unique-id': string;
  'relationship-type': {
    connects?: {
      source: { node: string };
      destination: { node: string };
    };
    interacts?: {
      actor: string;
      nodes: string[];
    };
    'deployed-in'?: {
      container: string;
      nodes: string[];
    };
  };
  protocol?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

interface CalmFlowStep {
  'service-name'?: string;
  'connects-to'?: string;
}

interface CalmFlow {
  'unique-id': string;
  name: string;
  description?: string;
  steps?: CalmFlowStep[];
}

interface CalmDocument {
  nodes: CalmNode[];
  relationships: CalmRelationship[];
  flows?: CalmFlow[];
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  name: string;
  nodeType: NodeType;
  description: string;
  language?: string;
  port?: number;
  repo?: string;
  technology?: string;
  criticality?: string;
  color: string;
  size: number;
  flowIds: string[];
  metadata: Record<string, unknown>;
  // set by health poller later
  health?: 'up' | 'down' | 'unknown';
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  protocol: Protocol;
  description: string;
  criticality: string;
  color: string;
  width: number;
  isAsync: boolean;
  flowIds: string[];
  breakingScenario: boolean;
  hidden: boolean;
}

export interface ParsedFlow {
  id: string;
  name: string;
  description: string;
  nodeIds: string[];
  linkIds: string[];
}

export interface ParsedGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  flows: ParsedFlow[];
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseCalmDocument(doc: CalmDocument): ParsedGraph {
  // Pass 1: build node map
  const nodeMap = new Map<string, GraphNode>();
  for (const n of doc.nodes) {
    const type = n['node-type'] as NodeType;
    const port = n.interfaces?.find(i => i.port)?.port;
    const meta = n.metadata ?? {};
    nodeMap.set(n['unique-id'], {
      id: n['unique-id'],
      name: n.name,
      nodeType: type,
      description: n.description ?? '',
      language: n['development-language'],
      port,
      repo: meta['repo'] as string | undefined,
      technology: meta['technology'] as string | undefined,
      criticality: meta['criticality'] as string | undefined,
      color: NODE_COLORS[type] ?? '#94a3b8',
      size: NODE_SIZES[type] ?? 7,
      flowIds: [],
      metadata: meta,
    });
  }

  // Pass 2: build links
  const links: GraphLink[] = [];
  const linkMap = new Map<string, GraphLink>();

  for (const rel of doc.relationships) {
    const rt = rel['relationship-type'];
    const protocol = (rel.protocol ?? 'HTTPS') as Protocol;
    const criticality = (rel.metadata?.['criticality'] as string) ?? 'medium';
    const hidden = protocol === 'deployed-in' || !!rt['deployed-in'];

    const makeLink = (src: string, dst: string, id: string): GraphLink => ({
      id,
      source: src,
      target: dst,
      protocol,
      description: rel.description ?? '',
      criticality,
      color: EDGE_COLORS[protocol] ?? '#94a3b8',
      width: EDGE_WIDTHS[criticality] ?? EDGE_WIDTHS.default,
      isAsync: protocol === 'AMQP',
      flowIds: [],
      breakingScenario:
        (src === 'payments-service' && dst === 'swift-ach-rail') ||
        (dst === 'payments-service' && src === 'swift-ach-rail'),
      hidden,
    });

    if (rt.connects) {
      const src = rt.connects.source.node;
      const dst = rt.connects.destination.node;
      const link = makeLink(src, dst, rel['unique-id']);
      links.push(link);
      linkMap.set(rel['unique-id'], link);
    } else if (rt.interacts) {
      for (const targetNode of rt.interacts.nodes) {
        const id = `${rel['unique-id']}-${targetNode}`;
        const link: GraphLink = {
          id,
          source: rt.interacts.actor,
          target: targetNode,
          protocol: 'interacts',
          description: rel.description ?? '',
          criticality: 'low',
          color: EDGE_COLORS['interacts'],
          width: 1,
          isAsync: false,
          flowIds: [],
          breakingScenario: false,
          hidden: false,
        };
        links.push(link);
        linkMap.set(id, link);
      }
    } else if (rt['deployed-in']) {
      for (const targetNode of rt['deployed-in'].nodes) {
        const id = `${rel['unique-id']}-${targetNode}`;
        const link = makeLink(rt['deployed-in'].container, targetNode, id);
        links.push(link);
        linkMap.set(id, link);
      }
    }
  }

  // Pass 3: parse flows + annotate nodes and links
  const flows: ParsedFlow[] = [];
  for (const f of doc.flows ?? []) {
    const nodeIds = new Set<string>();
    const linkIds = new Set<string>();

    for (const step of f.steps ?? []) {
      if (step['service-name']) nodeIds.add(step['service-name']);
      if (step['connects-to']) nodeIds.add(step['connects-to']);
    }

    // Link flows to edges: any edge whose source AND target are both in this flow's nodes
    for (const link of links) {
      const src = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
      const dst = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
      if (nodeIds.has(src) && nodeIds.has(dst)) {
        linkIds.add(link.id);
        link.flowIds.push(f['unique-id']);
      }
    }

    for (const nid of nodeIds) {
      const node = nodeMap.get(nid);
      if (node) node.flowIds.push(f['unique-id']);
    }

    flows.push({
      id: f['unique-id'],
      name: f.name,
      description: f.description ?? '',
      nodeIds: [...nodeIds],
      linkIds: [...linkIds],
    });
  }

  return {
    nodes: [...nodeMap.values()],
    links,
    flows,
  };
}
