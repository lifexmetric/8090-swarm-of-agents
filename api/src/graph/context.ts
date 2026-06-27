import { scopedRepositoryLabel, scopedRepositoryUrl } from "../scanner/scope.js";
import type { Confidence, GraphData, GraphLink, GraphNode, HandoffContextMap, RepositoryRecord, ScanContext, ScanScope } from "../types/domain.js";

function evidenceList(items: GraphNode["evidence"] | GraphLink["evidence"]): string {
  if (!items || items.length === 0) {
    return "_No direct evidence was captured. Treat the claims above as inferred and confirm them against the code before relying on them._";
  }
  return items
    .map((evidence, i) => {
      const range =
        evidence.lineEnd && evidence.lineEnd !== evidence.lineStart
          ? `L${evidence.lineStart}-L${evidence.lineEnd}`
          : `L${evidence.lineStart}`;
      const lines = [
        `**${i + 1}. \`${evidence.filePath}:${range}\`**`,
        `- Detector: \`${evidence.detector}\``,
      ];
      if (evidence.confidenceReason) lines.push(`- Why it's trusted: ${evidence.confidenceReason}`);
      if (evidence.snippet && evidence.snippet.trim()) {
        lines.push("", "```", evidence.snippet.trimEnd(), "```");
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function criticalityBar(c: number): string {
  return "█".repeat(Math.max(0, Math.min(5, c))) + "░".repeat(Math.max(0, 5 - c));
}

function criticalityNote(c: number): string {
  if (c >= 5) return "on the critical path — failures here are user-visible and tend to cause incidents.";
  if (c >= 4) return "high impact — changes here ripple to other services.";
  if (c >= 3) return "moderate impact — degrades a feature, but not the whole system.";
  if (c >= 2) return "limited impact — mostly contained to the two endpoints.";
  return "peripheral — low blast radius.";
}

function confidenceNote(c: Confidence): string {
  return c === "confirmed"
    ? "Explicit in the code — high trust."
    : c === "inferred"
      ? "Inferred from code patterns — likely correct, but spot-check before relying on it."
      : "Partially inferred — verify directly against the code before relying on it.";
}

function labelFor(graph: GraphData | undefined, nodeId: string): string {
  return graph?.nodes.find((n) => n.id === nodeId)?.label ?? nodeId;
}

export function nodeContextMarkdown(node: GraphNode, graph?: GraphData): string {
  const deps = graph ? graph.links.filter((l) => l.source === node.id) : [];
  const dependents = graph ? graph.links.filter((l) => l.target === node.id) : [];
  const maxCrit = [...deps, ...dependents].reduce((m, l) => Math.max(m, l.criticality), 0);

  function depLine(link: GraphLink, direction: "out" | "in"): string {
    const peerId = direction === "out" ? link.target : link.source;
    const arrow = direction === "out" ? "→" : "←";
    return `- ${arrow} **${labelFor(graph, peerId)}** · ${link.kind} · criticality ${link.criticality}/5 — ${link.summary}`;
  }

  return `# ${node.label}

> Node handoff context. Generated from a static repository scan — enough to pick up work here without prior knowledge. Claims carry confidence and evidence so you know what to trust vs. verify.

**Kind:** ${node.kind} · **Domain:** ${node.domain} · **Confidence:** ${node.confidence}
${node.path ? `**Path:** \`${node.path}\`` : ""}

## At a glance
- **Type:** ${node.kind}
- **Domain:** ${node.domain}
- **Location:** ${node.path ? `\`${node.path}\`` : "not resolved to a single path"}
- **Fan-out (depends on):** ${deps.length}
- **Blast radius (depended on by):** ${dependents.length}
- **Max criticality touching this node:** ${maxCrit ? `${maxCrit}/5` : "—"}
- **Confidence:** ${node.confidence} — ${confidenceNote(node.confidence)}
${maxCrit >= 4 ? "\n> ⚠️ This node sits on a critical path — changes here can ripple system-wide.\n" : ""}
## What it is
${node.whatItIs}

## Why it exists
${node.whyItExists}

## Ownership
${node.owns.length > 0 ? node.owns.map((item) => `- ${item}`).join("\n") : "- No ownership facts detected."}

## Depends on (${deps.length} outbound)
${deps.length > 0 ? deps.map((l) => depLine(l, "out")).join("\n") : "- No outbound dependencies detected."}

## Depended on by (${dependents.length} inbound · blast radius)
${dependents.length > 0 ? dependents.map((l) => depLine(l, "in")).join("\n") : "- Nothing depends on this node."}

## Risks
${node.risks.length > 0 ? node.risks.map((risk) => `- ${risk}`).join("\n") : "- No risks detected."}

## Evidence
${evidenceList(node.evidence)}

## Change checklist
- [ ] Read "Ownership" and the outbound dependencies before editing.
- [ ] Check each of the ${dependents.length} inbound dependent(s) — they may break if you change this node's behavior.
${maxCrit >= 4 ? "- [ ] This is on a critical path; coordinate and add tests before shipping.\n" : ""}- [ ] Verify any inferred/uncertain claims above against the code.
`;
}

export function edgeContextMarkdown(link: GraphLink, graph?: GraphData): string {
  const srcLabel = labelFor(graph, link.source);
  const tgtLabel = labelFor(graph, link.target);

  return `# ${srcLabel} → ${tgtLabel}

> Connection handoff context. Everything below is derived from a static scan of the repository; confidence and evidence are noted so you can trust or verify each claim without extra background.

**Relationship:** ${link.kind} · **Criticality:** ${link.criticality}/5 · **Confidence:** ${link.confidence}

## TL;DR
${link.summary}

## Endpoints
| Side | Component |
| --- | --- |
| Upstream (caller) | ${srcLabel} |
| Downstream (callee) | ${tgtLabel} |

## How they connect (code)
\`${link.codePath}\`
\`\`\`
${link.code}
\`\`\`

## Contract
\`\`\`
${link.contract}
\`\`\`

## Failure behavior
${link.failure}

## Criticality
${criticalityBar(link.criticality)} ${link.criticality}/5 — ${criticalityNote(link.criticality)}

## Confidence
**${link.confidence}** — ${confidenceNote(link.confidence)}

## Risks
${link.risks.length > 0 ? link.risks.map((risk) => `- ${risk}`).join("\n") : "- None flagged by the scan."}
${link.beforeYouChange ? `\n## ⚠️ Before you change this\n${link.beforeYouChange}\n` : ""}
## Evidence
${evidenceList(link.evidence)}

## Change checklist
- [ ] Confirm the contract above still matches the code at \`${link.codePath}\`.
- [ ] Check the failure behavior — will your change alter how errors propagate?
- [ ] Assess blast radius on **${tgtLabel}** and anything downstream of it.
${link.beforeYouChange ? "- [ ] Honor the \"before you change\" note above.\n" : ""}- [ ] Add or update tests covering this ${link.kind} relationship.
`;
}

export function buildHandoffMap(args: {
  repository: RepositoryRecord;
  graph: GraphData;
  commitSha: string;
}): HandoffContextMap {
  const byFile = new Map<string, HandoffContextMap["files"][number]>();

  function entry(filePath: string): HandoffContextMap["files"][number] {
    const existing = byFile.get(filePath);
    if (existing) return existing;
    const next = { filePath, nodes: [], edges: [] };
    byFile.set(filePath, next);
    return next;
  }

  for (const node of args.graph.nodes) {
    for (const evidence of node.evidence ?? []) {
      entry(evidence.filePath).nodes.push({
        nodeId: node.id,
        label: node.label,
        kind: node.kind,
        confidence: node.confidence,
        evidenceId: evidence.id,
        lineStart: evidence.lineStart,
        lineEnd: evidence.lineEnd,
        snippet: evidence.snippet,
        detector: evidence.detector,
        confidenceReason: evidence.confidenceReason,
      });
    }
  }

  for (const edge of args.graph.links) {
    for (const evidence of edge.evidence ?? []) {
      entry(evidence.filePath).edges.push({
        edgeId: edge.id,
        source: edge.source,
        target: edge.target,
        kind: edge.kind,
        confidence: edge.confidence,
        evidenceId: evidence.id,
        lineStart: evidence.lineStart,
        lineEnd: evidence.lineEnd,
        snippet: evidence.snippet,
        detector: evidence.detector,
        confidenceReason: evidence.confidenceReason,
      });
    }
  }

  return {
    purpose:
      "Map changed files and line ranges from a future Git PR diff back to evidence-backed Atlas nodes and edges. Use this for human and AI-agent handoff; do not treat unmapped files as architectural claims without fresh evidence.",
    repositoryId: args.repository.id,
    commitSha: args.commitSha,
    files: Array.from(byFile.values()).sort((a, b) => a.filePath.localeCompare(b.filePath)),
  };
}

export function buildScanContext(args: {
  repository: RepositoryRecord;
  graph: GraphData;
  commitSha: string;
  backboard?: ScanContext["backboard"];
  scanScope?: ScanScope;
}): ScanContext {
  const { repository, graph, commitSha, backboard, scanScope } = args;
  const scopedLabel = scopedRepositoryLabel(repository, scanScope);
  const scopedUrl = scopedRepositoryUrl(repository, scanScope);
  const scopeLine = scanScope?.treePath
    ? `\nScan scope: \`${scanScope.treePath}\` (GitHub tree URL)\n`
    : "\n";
  const systemBrief = `# Atlas Scan Brief - ${scopedLabel}

Repository: ${scopedUrl}
Commit: ${commitSha}${scopeLine}
## Graph
- Nodes: ${graph.nodes.length}
- Edges: ${graph.links.length}

## Evidence Policy
Node and edge claims in this package are derived from deterministic scanner findings and carry evidence IDs, paths, line ranges, snippets, detectors, and confidence. Backboard synthesis is advisory metadata only unless a future slice explicitly cites stable evidence IDs for a claim.
`;

  return {
    systemBrief,
    nodeContext: graph.nodes.map((node) => ({
      nodeId: node.id,
      path: `node-context/${node.id}.md`,
      markdown: nodeContextMarkdown(node, graph),
    })),
    edgeContext: graph.links.map((link) => ({
      edgeId: link.id,
      path: `link-context/${link.id}.md`,
      markdown: edgeContextMarkdown(link, graph),
    })),
    handoff: buildHandoffMap({
      repository,
      graph,
      commitSha,
    }),
    backboard,
  };
}
