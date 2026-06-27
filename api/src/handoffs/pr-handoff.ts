import type {
  Confidence,
  DurableMemoryFact,
  GraphData,
  HandoffContextMap,
  PullRequestAgentPacket,
  PullRequestHandoffBrief,
  PullRequestHandoffMapping,
  PullRequestHandoffRecord,
  PullRequestHunk,
  RepositoryRecord,
  ScanRecord,
} from "../types/domain.js";
import type { PublicPullRequest } from "../github/pr.js";
import { redactSecrets } from "../util/redact.js";
import { stableId } from "../util/ids.js";
import { nowIso } from "../util/time.js";

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function hunkEnd(hunk: PullRequestHunk): number {
  return Math.max(hunk.newStart, hunk.newStart + Math.max(0, hunk.newLines - 1));
}

function confidenceRank(confidence: Confidence): number {
  if (confidence === "confirmed") return 3;
  if (confidence === "inferred") return 2;
  return 1;
}

function strongerConfidence(values: Confidence[]): Confidence {
  return values.sort((a, b) => confidenceRank(b) - confidenceRank(a))[0] ?? "uncertain";
}

function testFiles(files: string[]): string[] {
  return files.filter((file) => /(^|\/)(__tests__|tests?|spec|test)(\/|\.|-|_)/i.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(file));
}

function codeFiles(files: string[]): string[] {
  return files.filter((file) => !testFiles([file]).length && !/\.(md|mdx|txt|png|jpg|jpeg|gif|svg|lock)$/i.test(file));
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function sentenceList(items: string[], fallback: string): string[] {
  return items.length > 0 ? unique(items) : [fallback];
}

function mappingEvidenceRefs(mappings: PullRequestHandoffMapping[]): string[] {
  const refs: string[] = [];
  for (const mapping of mappings) {
    for (const node of mapping.nodes) {
      if (node.evidenceId) refs.push(`${node.evidenceId} ${node.label} ${mapping.filePath}:L${node.lineStart}`);
    }
    for (const edge of mapping.edges) {
      if (edge.evidenceId) refs.push(`${edge.evidenceId} ${edge.source}->${edge.target} ${mapping.filePath}:L${edge.lineStart}`);
    }
  }
  return unique(refs).slice(0, 40);
}

export function mapPullRequestToGraph(args: {
  pr: PublicPullRequest;
  graph?: GraphData | null;
  context?: HandoffContextMap | null;
}): PullRequestHandoffMapping[] {
  const files = new Map((args.context?.files ?? []).map((file) => [file.filePath, file]));
  const nodesById = new Map((args.graph?.nodes ?? []).map((node) => [node.id, node]));
  const edgesById = new Map((args.graph?.links ?? []).map((edge) => [edge.id, edge]));

  return args.pr.hunks.map((hunk) => {
    const fileContext = files.get(hunk.filePath);
    const start = hunk.newStart;
    const end = hunkEnd(hunk);
    const uncertainty: string[] = [];
    if (!fileContext) {
      uncertainty.push("No completed Atlas scan evidence is indexed for this changed file.");
    }

    const nodes = (fileContext?.nodes ?? [])
      .map((node) => {
        const exactLineOverlap = overlaps(start, end, node.lineStart, node.lineEnd);
        const graphNode = nodesById.get(node.nodeId);
        return {
          nodeId: node.nodeId,
          label: node.label,
          kind: node.kind,
          confidence: node.confidence,
          reason: exactLineOverlap
            ? "PR hunk line range overlaps this node evidence."
            : "PR hunk touches the same file as this node evidence; verify exact runtime impact.",
          evidenceId: node.evidenceId,
          lineStart: node.lineStart,
          lineEnd: node.lineEnd,
          snippet: redactSecrets(node.snippet).slice(0, 700),
          detector: node.detector,
          risks: graphNode?.risks ?? [],
        };
      })
      .sort((a, b) => {
        const aExact = a.reason.startsWith("PR hunk line range") ? 1 : 0;
        const bExact = b.reason.startsWith("PR hunk line range") ? 1 : 0;
        return bExact - aExact || confidenceRank(b.confidence) - confidenceRank(a.confidence);
      })
      .slice(0, 8)
      .map(({ risks: _risks, ...node }) => node);

    const edges = (fileContext?.edges ?? [])
      .map((edge) => {
        const exactLineOverlap = overlaps(start, end, edge.lineStart, edge.lineEnd);
        const graphEdge = edgesById.get(edge.edgeId);
        return {
          edgeId: edge.edgeId,
          source: edge.source,
          target: edge.target,
          kind: edge.kind,
          confidence: edge.confidence,
          reason: exactLineOverlap
            ? "PR hunk line range overlaps this edge evidence."
            : "PR hunk touches the same file as this edge evidence; verify exact contract impact.",
          evidenceId: edge.evidenceId,
          lineStart: edge.lineStart,
          lineEnd: edge.lineEnd,
          snippet: redactSecrets(edge.snippet).slice(0, 700),
          detector: edge.detector,
          risks: graphEdge?.risks ?? [],
        };
      })
      .sort((a, b) => {
        const aExact = a.reason.startsWith("PR hunk line range") ? 1 : 0;
        const bExact = b.reason.startsWith("PR hunk line range") ? 1 : 0;
        return bExact - aExact || confidenceRank(b.confidence) - confidenceRank(a.confidence);
      })
      .slice(0, 8)
      .map(({ risks: _risks, ...edge }) => edge);

    if (fileContext && nodes.length === 0 && edges.length === 0) {
      uncertainty.push("The changed file exists in scan context, but no graph node or edge evidence mapped to this hunk.");
    }
    if ([...nodes, ...edges].some((item) => item.reason.includes("same file"))) {
      uncertainty.push("Some mappings are file-level proximity, not exact line overlap.");
    }

    return {
      hunkId: hunk.id,
      filePath: hunk.filePath,
      nodes,
      edges,
      uncertainty,
    };
  });
}

export function buildPullRequestMemoryFacts(args: {
  handoffId: string;
  pr: PublicPullRequest;
  repository?: RepositoryRecord | null;
  mappings: PullRequestHandoffMapping[];
}): DurableMemoryFact[] {
  const repo = `${args.pr.owner}/${args.pr.repo}`;
  const facts: DurableMemoryFact[] = [];
  const seen = new Set<string>();
  for (const mapping of args.mappings) {
    for (const node of mapping.nodes) {
      if (!node.evidenceId || seen.has(`node:${node.evidenceId}:${node.nodeId}`)) continue;
      seen.add(`node:${node.evidenceId}:${node.nodeId}`);
      facts.push({
        id: stableId("memory-fact", "handoff", args.handoffId, args.pr.head.sha, node.nodeId, node.evidenceId),
        scope: "finding",
        repositoryId: args.repository?.id ?? stableId("repo", "unknown", args.pr.owner, args.pr.repo),
        repo,
        commitSha: args.pr.head.sha,
        fact: `${repo} PR #${args.pr.number} touches Atlas node ${node.label} in ${mapping.filePath}.`,
        confidence: node.reason.includes("overlaps") ? node.confidence : "inferred",
        evidenceIds: [node.evidenceId],
        evidenceRefs: [{
          evidenceId: node.evidenceId,
          filePath: mapping.filePath,
          lineStart: node.lineStart,
          lineEnd: node.lineEnd,
          detector: node.detector,
          snippet: node.snippet,
        }],
      });
    }
    for (const edge of mapping.edges) {
      if (!edge.evidenceId || seen.has(`edge:${edge.evidenceId}:${edge.edgeId}`)) continue;
      seen.add(`edge:${edge.evidenceId}:${edge.edgeId}`);
      facts.push({
        id: stableId("memory-fact", "handoff", args.handoffId, args.pr.head.sha, edge.edgeId, edge.evidenceId),
        scope: "finding",
        repositoryId: args.repository?.id ?? stableId("repo", "unknown", args.pr.owner, args.pr.repo),
        repo,
        commitSha: args.pr.head.sha,
        fact: `${repo} PR #${args.pr.number} may affect Atlas edge ${edge.source} -> ${edge.target} in ${mapping.filePath}.`,
        confidence: edge.reason.includes("overlaps") ? edge.confidence : "inferred",
        evidenceIds: [edge.evidenceId],
        evidenceRefs: [{
          evidenceId: edge.evidenceId,
          filePath: mapping.filePath,
          lineStart: edge.lineStart,
          lineEnd: edge.lineEnd,
          detector: edge.detector,
          snippet: edge.snippet,
        }],
      });
    }
    if (facts.length >= 30) break;
  }
  return facts;
}

export function buildPullRequestHandoffRecord(args: {
  handoffId: string;
  workspaceId: string;
  pr: PublicPullRequest;
  repository?: RepositoryRecord | null;
  scan?: ScanRecord | null;
  mappings: PullRequestHandoffMapping[];
  memoryFacts?: DurableMemoryFact[];
  memoryStatus?: PullRequestHandoffRecord["memoryStatus"];
  backboardAssistantId?: string | null;
}): PullRequestHandoffRecord {
  const now = nowIso();
  const files = args.pr.changedFiles.map((file) => file.filename);
  const tests = testFiles(files);
  const nonTests = codeFiles(files);
  const mappedNodes = unique(args.mappings.flatMap((mapping) => mapping.nodes.map((node) => `${node.label} (${node.kind})`)));
  const mappedEdges = unique(args.mappings.flatMap((mapping) => mapping.edges.map((edge) => `${edge.source} -> ${edge.target} (${edge.kind})`)));
  const allUncertainty = unique(args.mappings.flatMap((mapping) => mapping.uncertainty));
  const todoFiles = args.pr.hunks
    .filter((hunk) => /\b(TODO|FIXME|XXX|WIP|follow[- ]?up)\b/i.test(hunk.patch))
    .map((hunk) => hunk.filePath);
  const riskHints = args.pr.hunks
    .filter((hunk) => /\b(auth|token|secret|password|migration|schema|delete|drop|payment|queue|retry|timeout|cache|database|sql)\b/i.test(hunk.patch))
    .map((hunk) => hunk.filePath);
  const confidence = strongerConfidence([
    ...args.mappings.flatMap((mapping) => [...mapping.nodes.map((node) => node.confidence), ...mapping.edges.map((edge) => edge.confidence)]),
    allUncertainty.length > 0 ? "uncertain" : "confirmed",
  ]);

  const humanBrief: PullRequestHandoffBrief = {
    summary: `${args.pr.owner}/${args.pr.repo} PR #${args.pr.number} "${args.pr.title}" is ${args.pr.state} with ${files.length} changed file(s), ${args.pr.commits.length} commit(s), base ${args.pr.base.ref}@${args.pr.base.sha.slice(0, 12)}, and head ${args.pr.head.ref}@${args.pr.head.sha.slice(0, 12)}. Public PR metadata was fetched without a GitHub token. Mapping confidence is ${confidence}.`,
    taskState: sentenceList([
      `${args.pr.commits.length} public commit(s) fetched from the PR.`,
      ...args.pr.commits.slice(-5).map((commit) => `${commit.sha.slice(0, 12)} ${commit.message}`),
      ...(todoFiles.length > 0 ? [`TODO/FIXME-style markers appear in ${unique(todoFiles).join(", ")}.`] : []),
    ], "No commit or task-state detail was available beyond public PR metadata."),
    impactedArchitecture: sentenceList([
      ...mappedNodes.map((node) => `Touched node: ${node}.`),
      ...mappedEdges.map((edge) => `Touched connection: ${edge}.`),
    ], "No Atlas graph node or edge could be mapped from the current scan evidence."),
    risks: sentenceList([
      ...(riskHints.length > 0 ? [`Sensitive or high-risk code terms appear in ${unique(riskHints).join(", ")}.`] : []),
      ...(allUncertainty.length > 0 ? ["Some PR hunks do not have exact evidence-backed architecture mappings."] : []),
      ...(args.scan ? [] : ["No completed scan was found for this repository in the selected workspace."]),
    ], "No deterministic risk keywords or mapping gaps were detected; still inspect changed contracts before continuing."),
    missingTests: sentenceList([
      ...(nonTests.length > 0 && tests.length === 0 ? ["The PR changes code files but no obvious test files were changed."] : []),
      ...(tests.length > 0 ? [`Changed test files: ${tests.join(", ")}.`] : []),
    ], "No obvious missing-test signal was detected from filenames."),
    nextSteps: [
      "Review exact changed hunks and mapped evidence before editing.",
      "Run the repository's targeted tests for changed modules, then broader integration checks for mapped edges.",
      "Verify each file-level-only mapping against the current branch because it is not exact line evidence.",
      ...(todoFiles.length > 0 ? ["Resolve or explicitly defer TODO/FIXME-style markers found in the PR diff."] : []),
    ],
    uncertainty: sentenceList([
      ...allUncertainty,
      ...(args.scan ? [] : ["No scan context exists for this repository, so architecture impact is limited to PR file metadata."]),
    ], "No unsupported architecture claims were added beyond mapped evidence and public PR metadata."),
    evidence: mappingEvidenceRefs(args.mappings),
  };

  const agentPacket: PullRequestAgentPacket = {
    objective: `Continue unfinished work from ${args.pr.url} using only public PR metadata, redacted hunks, and Atlas evidence-backed graph context.`,
    repo: `${args.pr.owner}/${args.pr.repo}`,
    prUrl: args.pr.url,
    base: args.pr.base,
    head: args.pr.head,
    constraints: [
      "No GitHub token was required or used for public PR intake.",
      "Do not store secrets from diffs, prompts, exports, or memory.",
      "Treat file-level mappings as inferred until verified in the checked-out branch.",
      "Do not claim unsupported repo relationships; use uncertainty when evidence is missing.",
      ...(args.scan?.commitSha ? [`Atlas scan context came from commit ${args.scan.commitSha}; compare against PR base ${args.pr.base.sha}.`] : []),
    ],
    exactFilesAndHunks: args.pr.hunks,
    suggestedNextActions: humanBrief.nextSteps,
    knownUnknowns: humanBrief.uncertainty,
    evidenceRefs: humanBrief.evidence,
    backboardMemoryRefs: [],
  };

  return {
    id: args.handoffId,
    workspaceId: args.workspaceId,
    repositoryId: args.repository?.id ?? null,
    scanId: args.scan?.id ?? null,
    prUrl: args.pr.url,
    owner: args.pr.owner,
    repo: args.pr.repo,
    number: args.pr.number,
    title: args.pr.title,
    state: args.pr.state,
    author: args.pr.author ?? null,
    publicAccess: args.pr.publicAccess,
    base: args.pr.base,
    head: args.pr.head,
    changedFiles: args.pr.changedFiles,
    commits: args.pr.commits,
    hunks: args.pr.hunks,
    mappings: args.mappings,
    humanBrief,
    agentPacket,
    memoryFacts: args.memoryFacts ?? [],
    memoryStatus: args.memoryStatus ?? null,
    backboardAssistantId: args.backboardAssistantId ?? null,
    backboardThreadId: null,
    backboardMemoryOperationId: args.memoryStatus?.operationId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
