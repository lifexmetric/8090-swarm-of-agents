import type { GraphData, GraphLink, GraphNode, RepositoryRecord, ScanContext } from "../types/domain.js";

function evidenceList(items: GraphNode["evidence"] | GraphLink["evidence"]): string {
  if (!items || items.length === 0) return "- No direct evidence recorded.\n";
  return items
    .map(
      (evidence) =>
        `- \`${evidence.filePath}:L${evidence.lineStart}\` (${evidence.detector}, ${evidence.confidenceReason})\n  \`${evidence.snippet.replaceAll("`", "'")}\``,
    )
    .join("\n");
}

export function nodeContextMarkdown(node: GraphNode): string {
  return `# ${node.label}

## What it is
${node.whatItIs}

## Why it exists
${node.whyItExists}

## Ownership
${node.owns.length > 0 ? node.owns.map((item) => `- ${item}`).join("\n") : "- No ownership facts detected."}

## Confidence
${node.confidence}

## Risks
${node.risks.length > 0 ? node.risks.map((risk) => `- ${risk}`).join("\n") : "- No risks detected."}

## Evidence
${evidenceList(node.evidence)}
`;
}

export function edgeContextMarkdown(link: GraphLink): string {
  return `# ${link.source} -> ${link.target}

## Summary
${link.summary}

## Kind
${link.kind}

## Criticality
${link.criticality}/5

## Code
\`\`\`
${link.code}
\`\`\`

Source: \`${link.codePath}\`

## Contract
${link.contract}

## Failure Behavior
${link.failure}

## Risks
${link.risks.length > 0 ? link.risks.map((risk) => `- ${risk}`).join("\n") : "- No risks detected."}

## Evidence
${evidenceList(link.evidence)}
`;
}

export function buildScanContext(args: {
  repository: RepositoryRecord;
  graph: GraphData;
  commitSha: string;
  backboard?: ScanContext["backboard"];
}): ScanContext {
  const { repository, graph, commitSha, backboard } = args;
  const systemBrief = `# Atlas Scan Brief - ${repository.owner}/${repository.name}

Repository: ${repository.url}
Commit: ${commitSha}

## Graph
- Nodes: ${graph.nodes.length}
- Edges: ${graph.links.length}

## Evidence Policy
All node and edge claims are derived from deterministic scanner findings. Backboard synthesis may improve summaries and risk wording, but evidence links remain the source of truth.
`;

  return {
    systemBrief,
    nodeContext: graph.nodes.map((node) => ({
      nodeId: node.id,
      path: `node-context/${node.id}.md`,
      markdown: nodeContextMarkdown(node),
    })),
    edgeContext: graph.links.map((link) => ({
      edgeId: link.id,
      path: `link-context/${link.id}.md`,
      markdown: edgeContextMarkdown(link),
    })),
    backboard,
  };
}
