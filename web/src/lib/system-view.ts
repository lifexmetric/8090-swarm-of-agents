import type { Confidence, Evidence, GraphData, GraphLink, GraphNode } from "./data";

export interface SystemScope {
  repositoryId?: string | null;
  path?: string;
}

export type SystemNodeType = "repo" | "folder" | "file" | "boundary";

export interface SystemNodeMeta {
  type: SystemNodeType;
  repositoryId: string;
  path: string;
  scanId?: string;
  originalNodeId?: string;
  childFolders?: number;
  childFiles?: number;
  descendantFiles?: number;
}

export interface SystemBreadcrumb {
  label: string;
  scope: SystemScope;
}

export interface SystemProjection {
  graph: GraphData;
  scope: Required<SystemScope>;
  breadcrumbs: SystemBreadcrumb[];
  canGoUp: boolean;
}

type PathType = "folder" | "file";

interface PathEntry {
  repositoryId: string;
  path: string;
  type: PathType;
  evidence: Evidence[];
  sourceNodeIds: Set<string>;
}

interface RepositoryInfo {
  id: string;
  label: string;
  scanId?: string;
  evidence: Evidence[];
}

type SystemNode = GraphNode & { system?: SystemNodeMeta };

const DEFAULT_REPO_ID = "__repo__";
const STRONGEST_CONFIDENCE: Record<Confidence, number> = {
  confirmed: 3,
  inferred: 2,
  uncertain: 1,
};

export function getSystemNodeMeta(node: GraphNode | null | undefined): SystemNodeMeta | null {
  return ((node as SystemNode | null | undefined)?.system ?? null);
}

export function normalizeSystemPath(value?: string | null): string | null {
  if (!value) return null;
  let next = value.trim();
  if (!next || next === "." || next === "/") return "";
  next = next
    .replace(/^`|`$/g, "")
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  next = next.replace(/:L\d+(?:-L?\d+)?(?:\b.*)?$/i, "");
  next = next.replace(/:\d+(?::\d+)?$/, "");
  if (!next || next === "." || next.startsWith("http://") || next.startsWith("https://")) return null;
  if (/^(No code path|No .* available)/i.test(next)) return null;
  return next;
}

function basename(filePath: string): string {
  if (!filePath) return "";
  const parts = filePath.split("/");
  return parts[parts.length - 1] || filePath;
}

function dirname(filePath: string): string {
  const clean = normalizeSystemPath(filePath) ?? "";
  const parts = clean.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function isFilePath(filePath: string): boolean {
  const base = basename(filePath);
  if (!base) return false;
  if (/^(Dockerfile|Makefile|Procfile)$/i.test(base)) return true;
  if (/^(package-lock|package|tsconfig|jsconfig|README|CHANGELOG|LICENSE)(\.[\w.-]+)?$/i.test(base)) return true;
  return /\.[a-zA-Z0-9]{1,8}$/.test(base);
}

function isWithin(candidatePath: string, scopePath: string): boolean {
  if (!scopePath) return true;
  return candidatePath === scopePath || candidatePath.startsWith(`${scopePath}/`);
}

function directChildPath(candidatePath: string, scopePath: string): string | null {
  if (!isWithin(candidatePath, scopePath) || candidatePath === scopePath) return null;
  const rel = scopePath ? candidatePath.slice(scopePath.length + 1) : candidatePath;
  const first = rel.split("/")[0];
  return scopePath ? `${scopePath}/${first}` : first;
}

function confidenceMax(a: Confidence, b: Confidence): Confidence {
  return STRONGEST_CONFIDENCE[b] > STRONGEST_CONFIDENCE[a] ? b : a;
}

function uniqueByEvidence(items: Evidence[], max = 8): Evidence[] {
  const seen = new Set<string>();
  const out: Evidence[] = [];
  for (const item of items) {
    const key = `${item.filePath}:${item.lineStart}:${item.detector}:${item.snippet}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

function repoIdForNode(node: GraphNode | undefined): string {
  return node?.repositoryId ?? DEFAULT_REPO_ID;
}

function repoIdForLink(link: GraphLink, nodesById: Map<string, GraphNode>): string {
  return link.repositoryId ?? nodesById.get(link.source)?.repositoryId ?? nodesById.get(link.target)?.repositoryId ?? DEFAULT_REPO_ID;
}

function nodePathCandidates(node: GraphNode | undefined): string[] {
  if (!node) return [];
  const paths: string[] = [];
  const nodePath = normalizeSystemPath(node.path);
  if (nodePath) paths.push(nodePath);
  for (const evidence of node.evidence ?? []) {
    const evidencePath = normalizeSystemPath(evidence.filePath);
    if (evidencePath) paths.push(evidencePath);
  }
  return [...new Set(paths)];
}

function linkEvidencePaths(link: GraphLink): string[] {
  const paths = [
    normalizeSystemPath(link.codePath),
    ...(link.evidence ?? []).map((evidence) => normalizeSystemPath(evidence.filePath)),
  ].filter((item): item is string => Boolean(item));
  return [...new Set(paths)];
}

function addEntry(entries: Map<string, PathEntry>, args: {
  repositoryId: string;
  path: string;
  type: PathType;
  evidence?: Evidence[];
  sourceNodeId?: string;
}): void {
  const cleanPath = normalizeSystemPath(args.path);
  if (!cleanPath) return;
  const key = `${args.repositoryId}:${cleanPath}`;
  const existing = entries.get(key);
  if (existing) {
    existing.type = existing.type === "file" || args.type === "file" ? "file" : "folder";
    existing.evidence = uniqueByEvidence([...(existing.evidence ?? []), ...(args.evidence ?? [])]);
    if (args.sourceNodeId) existing.sourceNodeIds.add(args.sourceNodeId);
  } else {
    entries.set(key, {
      repositoryId: args.repositoryId,
      path: cleanPath,
      type: args.type,
      evidence: uniqueByEvidence(args.evidence ?? []),
      sourceNodeIds: new Set(args.sourceNodeId ? [args.sourceNodeId] : []),
    });
  }

  const parts = cleanPath.split("/");
  const parentCount = args.type === "file" ? parts.length - 1 : parts.length - 1;
  for (let i = 1; i <= parentCount; i += 1) {
    const parentPath = parts.slice(0, i).join("/");
    if (!parentPath) continue;
    const parentKey = `${args.repositoryId}:${parentPath}`;
    if (!entries.has(parentKey)) {
      entries.set(parentKey, {
        repositoryId: args.repositoryId,
        path: parentPath,
        type: "folder",
        evidence: [],
        sourceNodeIds: new Set(),
      });
    }
  }
}

function collectInventory(sourceGraph: GraphData): {
  entries: Map<string, PathEntry>;
  repositories: RepositoryInfo[];
  nodesById: Map<string, GraphNode>;
} {
  const entries = new Map<string, PathEntry>();
  const nodesById = new Map(sourceGraph.nodes.map((node) => [node.id, node]));
  const repos = new Map<string, RepositoryInfo>();

  function ensureRepo(repositoryId: string, partial?: Partial<RepositoryInfo>) {
    const existing = repos.get(repositoryId);
    if (existing) {
      existing.label = partial?.label ?? existing.label;
      existing.scanId = partial?.scanId ?? existing.scanId;
      existing.evidence = uniqueByEvidence([...(existing.evidence ?? []), ...(partial?.evidence ?? [])]);
      return existing;
    }
    const next: RepositoryInfo = {
      id: repositoryId,
      label: partial?.label ?? (repositoryId === DEFAULT_REPO_ID ? "repository" : repositoryId),
      scanId: partial?.scanId,
      evidence: partial?.evidence ?? [],
    };
    repos.set(repositoryId, next);
    return next;
  }

  for (const node of sourceGraph.nodes) {
    const repositoryId = repoIdForNode(node);
    const isRepoNode = node.scanId || node.domain === "System" || node.domain === "Repository" || node.domain === "Scoped Repository";
    ensureRepo(repositoryId, {
      label: isRepoNode ? node.label : undefined,
      scanId: node.scanId,
      evidence: node.evidence,
    });

    const nodePaths = nodePathCandidates(node);
    for (const candidate of nodePaths) {
      addEntry(entries, {
        repositoryId,
        path: candidate,
        type: isFilePath(candidate) ? "file" : "folder",
        evidence: node.evidence,
        sourceNodeId: node.id,
      });
    }
  }

  for (const link of sourceGraph.links) {
    const repositoryId = repoIdForLink(link, nodesById);
    ensureRepo(repositoryId);
    for (const candidate of linkEvidencePaths(link)) {
      addEntry(entries, {
        repositoryId,
        path: candidate,
        type: "file",
        evidence: link.evidence,
      });
    }
  }

  if (repos.size === 0) ensureRepo(DEFAULT_REPO_ID);

  return {
    entries,
    repositories: Array.from(repos.values()).sort((a, b) => a.label.localeCompare(b.label)),
    nodesById,
  };
}

function childCounts(entries: PathEntry[], repositoryId: string, pathValue: string): {
  childFolders: number;
  childFiles: number;
  descendantFiles: number;
} {
  const direct = new Map<string, PathEntry>();
  let descendantFiles = 0;
  for (const entry of entries) {
    if (entry.repositoryId !== repositoryId || entry.path === pathValue || !isWithin(entry.path, pathValue)) continue;
    if (entry.type === "file") descendantFiles += 1;
    const child = directChildPath(entry.path, pathValue);
    if (!child) continue;
    const key = `${repositoryId}:${child}`;
    if (!direct.has(key)) direct.set(key, entry);
  }
  let childFolders = 0;
  let childFiles = 0;
  for (const child of direct.values()) {
    if (child.type === "file") childFiles += 1;
    else childFolders += 1;
  }
  return { childFolders, childFiles, descendantFiles };
}

function formatCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function folderSummary(counts: {
  childFolders: number;
  childFiles: number;
  descendantFiles: number;
}): string {
  if (counts.childFolders > 0 && counts.childFiles > 0) {
    return `${formatCount(counts.childFolders, "folder")} · ${formatCount(counts.childFiles, "file")}`;
  }
  if (counts.childFolders > 0) return formatCount(counts.childFolders, "folder");
  if (counts.childFiles > 0) return formatCount(counts.childFiles, "file");
  if (counts.descendantFiles > 0) return formatCount(counts.descendantFiles, "nested file");
  return "No files";
}

function folderOwns(counts: {
  childFolders: number;
  childFiles: number;
  descendantFiles: number;
}): string[] {
  const owns = [folderSummary(counts)];
  if (counts.descendantFiles > counts.childFiles) {
    owns.push(formatCount(counts.descendantFiles, "descendant file"));
  }
  return owns;
}

function createSystemNode(entry: PathEntry, entries: PathEntry[]): SystemNode {
  const counts = childCounts(entries, entry.repositoryId, entry.path);
  const type = entry.type;
  const owns = type === "folder"
    ? folderOwns(counts)
    : [
        basename(entry.path).split(".").pop()?.toUpperCase() ?? "FILE",
        formatCount(entry.evidence.length, "evidence item"),
      ];

  return {
    id: `system:${entry.repositoryId}:${type}:${entry.path}`,
    label: basename(entry.path),
    kind: type,
    domain: type === "folder" ? "Folder" : "File",
    whatItIs: type === "folder"
      ? `Folder at ${entry.path || "repository root"}. Only this layer's immediate children are shown in System View.`
      : `Source or configuration file at ${entry.path}. File-level System View shows evidence-backed relationships touching this file.`,
    whyItExists: "Derived from scanner paths and evidence locations in the current repository graph.",
    owns,
    confidence: entry.evidence.length > 0 ? "confirmed" : "inferred",
    risks: [],
    path: entry.path,
    repositoryId: entry.repositoryId,
    evidence: uniqueByEvidence(entry.evidence),
    system: {
      type,
      repositoryId: entry.repositoryId,
      path: entry.path,
      childFolders: counts.childFolders,
      childFiles: counts.childFiles,
      descendantFiles: counts.descendantFiles,
    },
  };
}

function createRepoNode(repo: RepositoryInfo): SystemNode {
  return {
    id: `system:repo:${repo.id}`,
    label: repo.label,
    kind: "folder",
    domain: "Repository",
    whatItIs: `${repo.label} is a scanned repository. Double-click to enter its folder graph.`,
    whyItExists: "Represents one repository-level system in the workspace.",
    owns: repo.scanId ? [`scan ${repo.scanId}`] : [],
    confidence: "confirmed",
    risks: [],
    path: ".",
    repositoryId: repo.id,
    scanId: repo.scanId,
    evidence: repo.evidence,
    system: {
      type: "repo",
      repositoryId: repo.id,
      path: "",
      scanId: repo.scanId,
    },
  };
}

function createBoundaryNode(original: GraphNode, scope: Required<SystemScope>): SystemNode {
  return {
    ...original,
    id: `system:boundary:${scope.repositoryId}:${scope.path}:${original.id}`,
    system: {
      type: "boundary",
      repositoryId: original.repositoryId ?? scope.repositoryId ?? DEFAULT_REPO_ID,
      path: original.path ?? "",
      originalNodeId: original.id,
    },
  };
}

function representativePathForNode(node: GraphNode | undefined): string | null {
  if (!node) return null;
  const paths = nodePathCandidates(node);
  return paths[0] ?? null;
}

function edgeEndpointPath(
  link: GraphLink,
  side: "source" | "target",
  nodesById: Map<string, GraphNode>,
): string | null {
  const node = nodesById.get(side === "source" ? link.source : link.target);
  const nodePath = representativePathForNode(node);
  if (nodePath) return nodePath;
  if (side === "source") return linkEvidencePaths(link)[0] ?? null;
  return null;
}

function visibleNodeForEndpoint(args: {
  endpointNode: GraphNode | undefined;
  endpointPath: string | null;
  scope: Required<SystemScope>;
  entryByPath: Map<string, PathEntry>;
  visibleByPath: Map<string, SystemNode>;
  visibleNodes: Map<string, SystemNode>;
  fileMode: boolean;
}): SystemNode | null {
  const { endpointNode, endpointPath, scope, entryByPath, visibleByPath, visibleNodes, fileMode } = args;
  if (endpointPath && isWithin(endpointPath, scope.path)) {
    if (endpointPath === scope.path && isFilePath(scope.path)) {
      return visibleByPath.get(scope.path) ?? null;
    }
    const childPath = directChildPath(endpointPath, scope.path);
    if (childPath) {
      const visible = visibleByPath.get(childPath);
      if (visible) return visible;
      const entry = entryByPath.get(`${scope.repositoryId}:${childPath}`);
      if (entry) {
        const node = createSystemNode(entry, Array.from(entryByPath.values()));
        visibleNodes.set(node.id, node);
        visibleByPath.set(childPath, node);
        return node;
      }
    }
  }

  if (!endpointNode) return null;
  if (endpointPath && !fileMode) return null;
  const boundary = createBoundaryNode(endpointNode, scope);
  visibleNodes.set(boundary.id, boundary);
  return boundary;
}

function aggregateEdges(args: {
  sourceGraph: GraphData;
  scope: Required<SystemScope>;
  nodesById: Map<string, GraphNode>;
  entryByPath: Map<string, PathEntry>;
  visibleByPath: Map<string, SystemNode>;
  visibleNodes: Map<string, SystemNode>;
  fileMode: boolean;
}): GraphLink[] {
  const aggregations = new Map<string, GraphLink & { count: number }>();

  for (const link of args.sourceGraph.links) {
    const sourceOriginal = args.nodesById.get(link.source);
    const targetOriginal = args.nodesById.get(link.target);
    const repositoryId = repoIdForLink(link, args.nodesById);
    if (repositoryId !== args.scope.repositoryId && args.scope.repositoryId !== DEFAULT_REPO_ID) continue;

    const sourcePath = edgeEndpointPath(link, "source", args.nodesById);
    const targetPath = edgeEndpointPath(link, "target", args.nodesById);
    const evidencePaths = linkEvidencePaths(link);
    const evidenceInScope = evidencePaths.find((candidate) => isWithin(candidate, args.scope.path)) ?? null;
    const sourceVisibilityPath = args.fileMode && evidenceInScope ? evidenceInScope : sourcePath ?? evidenceInScope;
    const touchesScope = [sourcePath, targetPath, ...evidencePaths].some((candidate) =>
      candidate ? isWithin(candidate, args.scope.path) : false,
    );
    if (!touchesScope) continue;

    const sourceVisible = visibleNodeForEndpoint({
      endpointNode: sourceOriginal,
      endpointPath: sourceVisibilityPath,
      scope: args.scope,
      entryByPath: args.entryByPath,
      visibleByPath: args.visibleByPath,
      visibleNodes: args.visibleNodes,
      fileMode: args.fileMode,
    });
    const targetVisible = visibleNodeForEndpoint({
      endpointNode: targetOriginal,
      endpointPath: targetPath,
      scope: args.scope,
      entryByPath: args.entryByPath,
      visibleByPath: args.visibleByPath,
      visibleNodes: args.visibleNodes,
      fileMode: args.fileMode,
    });
    if (!sourceVisible || !targetVisible) continue;
    if (!args.fileMode && sourceVisible.id === targetVisible.id) continue;

    const key = `${sourceVisible.id}->${targetVisible.id}:${link.kind}`;
    const evidence = uniqueByEvidence([...(link.evidence ?? [])]);
    const existing = aggregations.get(key);
    if (!existing) {
      aggregations.set(key, {
        ...link,
        id: `system:edge:${key}`,
        source: sourceVisible.id,
        target: targetVisible.id,
        criticality: link.criticality,
        confidence: link.confidence,
        evidence,
        summary: "1 descendant relationship.",
        code: evidence[0]?.snippet || link.code,
        codePath: evidence[0] ? `${evidence[0].filePath}:L${evidence[0].lineStart}` : link.codePath,
        contract: `Aggregated ${link.kind} relationship in System View.`,
        count: 1,
      });
      continue;
    }

    existing.count += 1;
    existing.criticality = Math.max(existing.criticality, link.criticality);
    existing.confidence = confidenceMax(existing.confidence, link.confidence);
    existing.risks = [...new Set([...existing.risks, ...link.risks])];
    existing.evidence = uniqueByEvidence([...(existing.evidence ?? []), ...evidence]);
    if (!existing.beforeYouChange && link.beforeYouChange) existing.beforeYouChange = link.beforeYouChange;
  }

  return Array.from(aggregations.values()).map(({ count, ...link }) => ({
    ...link,
    summary: `${count} descendant relationship${count === 1 ? "" : "s"} between ${link.source.split(":").pop()} and ${link.target.split(":").pop()}.`,
    contract: `${link.contract}\nRelationship count: ${count}`,
  }));
}

function fileRelationshipGraph(args: {
  sourceGraph: GraphData;
  scope: Required<SystemScope>;
  entry: PathEntry;
  nodesById: Map<string, GraphNode>;
  entryByPath: Map<string, PathEntry>;
}): GraphData {
  const visibleNodes = new Map<string, SystemNode>();
  const visibleByPath = new Map<string, SystemNode>();
  const fileNode = createSystemNode(args.entry, Array.from(args.entryByPath.values()));
  visibleNodes.set(fileNode.id, fileNode);
  visibleByPath.set(args.entry.path, fileNode);

  const links = aggregateEdges({
    sourceGraph: args.sourceGraph,
    scope: args.scope,
    nodesById: args.nodesById,
    entryByPath: args.entryByPath,
    visibleByPath,
    visibleNodes,
    fileMode: true,
  });

  return { nodes: Array.from(visibleNodes.values()), links };
}

function folderLayerGraph(args: {
  sourceGraph: GraphData;
  scope: Required<SystemScope>;
  entries: PathEntry[];
  entryByPath: Map<string, PathEntry>;
  nodesById: Map<string, GraphNode>;
}): GraphData {
  const visibleNodes = new Map<string, SystemNode>();
  const visibleByPath = new Map<string, SystemNode>();

  for (const entry of args.entries) {
    if (entry.repositoryId !== args.scope.repositoryId) continue;
    const childPath = directChildPath(entry.path, args.scope.path);
    if (!childPath || visibleByPath.has(childPath)) continue;
    const childEntry = args.entryByPath.get(`${args.scope.repositoryId}:${childPath}`);
    if (!childEntry) continue;
    const node = createSystemNode(childEntry, args.entries);
    visibleNodes.set(node.id, node);
    visibleByPath.set(childPath, node);
  }

  const links = aggregateEdges({
    sourceGraph: args.sourceGraph,
    scope: args.scope,
    nodesById: args.nodesById,
    entryByPath: args.entryByPath,
    visibleByPath,
    visibleNodes,
    fileMode: false,
  });

  return { nodes: Array.from(visibleNodes.values()), links };
}

function repoLayerGraph(repositories: RepositoryInfo[]): GraphData {
  return {
    nodes: repositories.map(createRepoNode),
    links: [],
  };
}

function breadcrumbsFor(args: {
  scope: Required<SystemScope>;
  repository: RepositoryInfo | undefined;
  forceRepositoryLayer: boolean;
  repositories: RepositoryInfo[];
}): SystemBreadcrumb[] {
  if (!args.scope.repositoryId || args.forceRepositoryLayer) {
    return [{ label: "workspace", scope: { repositoryId: null, path: "" } }];
  }
  const crumbs: SystemBreadcrumb[] = [];
  if (args.repositories.length > 1) {
    crumbs.push({ label: "workspace", scope: { repositoryId: null, path: "" } });
  }
  crumbs.push({ label: args.repository?.label ?? "repository", scope: { repositoryId: args.scope.repositoryId, path: "" } });
  const parts = args.scope.path.split("/").filter(Boolean);
  parts.forEach((part, index) => {
    crumbs.push({
      label: part,
      scope: {
        repositoryId: args.scope.repositoryId,
        path: parts.slice(0, index + 1).join("/"),
      },
    });
  });
  return crumbs;
}

export function parentSystemScope(projection: SystemProjection): SystemScope | null {
  const { scope, breadcrumbs } = projection;
  if (!scope.repositoryId) return null;
  if (!scope.path) {
    return breadcrumbs.some((crumb) => !crumb.scope.repositoryId)
      ? { repositoryId: null, path: "" }
      : null;
  }
  return { repositoryId: scope.repositoryId, path: dirname(scope.path) };
}

export function buildSystemGraph(
  sourceGraph: GraphData,
  scopeInput: SystemScope = {},
  options: { forceRepositoryLayer?: boolean; repoLabel?: string } = {},
): SystemProjection {
  const { entries, repositories, nodesById } = collectInventory(sourceGraph);
  if (repositories.length === 1 && options.repoLabel && repositories[0].id === DEFAULT_REPO_ID) {
    repositories[0].label = options.repoLabel;
  }

  const forceRepositoryLayer = Boolean(options.forceRepositoryLayer);
  const requestedRepoId = scopeInput.repositoryId ?? null;
  const repositoryId = forceRepositoryLayer
    ? null
    : requestedRepoId ?? repositories[0]?.id ?? DEFAULT_REPO_ID;
  const pathValue = normalizeSystemPath(scopeInput.path) ?? "";
  const scope: Required<SystemScope> = { repositoryId, path: pathValue };
  const entryByPath = new Map(Array.from(entries.values()).map((entry) => [`${entry.repositoryId}:${entry.path}`, entry]));

  if (!repositoryId || forceRepositoryLayer) {
    const graph = repoLayerGraph(repositories);
    return {
      graph,
      scope,
      breadcrumbs: breadcrumbsFor({ scope, repository: undefined, forceRepositoryLayer: true, repositories }),
      canGoUp: false,
    };
  }

  const repository = repositories.find((repo) => repo.id === repositoryId);
  const scopedEntry = entryByPath.get(`${repositoryId}:${pathValue}`);
  const graph = scopedEntry?.type === "file"
    ? fileRelationshipGraph({ sourceGraph, scope, entry: scopedEntry, nodesById, entryByPath })
    : folderLayerGraph({
        sourceGraph,
        scope,
        entries: Array.from(entries.values()),
        entryByPath,
        nodesById,
      });

  const breadcrumbs = breadcrumbsFor({ scope, repository, forceRepositoryLayer: false, repositories });
  return {
    graph,
    scope,
    breadcrumbs,
    canGoUp: Boolean(parentSystemScope({ graph, scope, breadcrumbs, canGoUp: false })),
  };
}
