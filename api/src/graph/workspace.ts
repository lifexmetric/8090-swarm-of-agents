import type { Evidence, GraphData, GraphLink, GraphNode, RepositoryRecord, ScanRecord, WorkspaceGraph } from "../types/domain.js";
import { stableId } from "../util/ids.js";

function systemNodeId(repo: RepositoryRecord): string {
  return stableId("system", repo.id);
}

function repoRootNodeId(graph: GraphData, repo: RepositoryRecord): string | null {
  return graph.nodes.find((node) => node.repositoryId === repo.id && node.label === `${repo.owner}/${repo.name}`)?.id ?? null;
}

function repoRootNode(graph: GraphData, repo: RepositoryRecord): GraphNode | undefined {
  return graph.nodes.find((node) => node.repositoryId === repo.id && node.label === `${repo.owner}/${repo.name}`);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function systemNodeFromScan(repo: RepositoryRecord, scan: ScanRecord): GraphNode | null {
  if (!scan.graph) return null;
  const root = repoRootNode(scan.graph, repo);
  const risks = unique(scan.graph.nodes.flatMap((node) => node.risks)).slice(0, 8);
  const owns = unique([
    ...(repo.packageName ? [repo.packageName] : []),
    ...(root?.owns ?? []),
  ]);

  return {
    id: systemNodeId(repo),
    label: `${repo.owner}/${repo.name}`,
    kind: "service",
    domain: "System",
    whatItIs: root?.whatItIs ?? `${repo.owner}/${repo.name} is a scanned repository in this workspace.`,
    whyItExists: root?.whyItExists ?? "Represents one deployable or package-level system in the architecture map.",
    owns,
    confidence: root?.confidence ?? "confirmed",
    risks,
    path: ".",
    repositoryId: repo.id,
    scanId: scan.id,
    evidence: root?.evidence ?? [],
  };
}

function evidenceForPackageDependency(graph: GraphData, packageName: string): Evidence[] {
  return graph.links
    .filter((link) => link.contract.includes(`dependency ${packageName}@`) || link.target.endsWith(stableId("package", packageName)))
    .flatMap((link) => link.evidence ?? [])
    .slice(0, 6);
}

function evidenceForProducedPackage(graph: GraphData, repo: RepositoryRecord, packageName: string): Evidence[] {
  return graph.nodes
    .filter((node) => node.repositoryId === repo.id)
    .flatMap((node) => node.evidence ?? [])
    .filter((evidence) => evidence.detector === "package-json-name" && evidence.snippet.includes(packageName))
    .slice(0, 6);
}

function dependencyVersion(link: GraphLink, packageName: string): string {
  const prefix = `package.json dependency ${packageName}@`;
  return link.contract.startsWith(prefix) ? link.contract.slice(prefix.length) : "declared";
}

export function buildWorkspaceGraph(args: {
  workspaceId: string;
  repositories: RepositoryRecord[];
  scans: ScanRecord[];
}): WorkspaceGraph {
  const graphs = args.scans.flatMap((scan) => (scan.graph ? [scan.graph] : []));
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const repoById = new Map(args.repositories.map((repo) => [repo.id, repo]));
  const graphByRepoId = new Map<string, GraphData>();
  const systemNodeByRepoId = new Map<string, GraphNode>();
  for (const scan of args.scans) {
    if (!scan.graph) continue;
    graphByRepoId.set(scan.repositoryId, scan.graph);
    const repo = repoById.get(scan.repositoryId);
    if (!repo) continue;
    const systemNode = systemNodeFromScan(repo, scan);
    if (!systemNode) continue;
    nodes.push(systemNode);
    systemNodeByRepoId.set(repo.id, systemNode);
  }

  const producedByPackage = new Map<string, RepositoryRecord>();
  for (const repo of args.repositories) {
    if (repo.packageName) producedByPackage.set(repo.packageName, repo);
  }

  const crossRepoConnections: WorkspaceGraph["crossRepoConnections"] = [];

  for (const scan of args.scans) {
    const sourceRepo = repoById.get(scan.repositoryId);
    const graph = scan.graph;
    if (!sourceRepo || !graph) continue;

    const dependencyLinks = graph.links.filter((link) => link.contract.startsWith("package.json dependency "));
    for (const link of dependencyLinks) {
      const packageName = link.contract.replace("package.json dependency ", "").split("@").slice(0, -1).join("@");
      if (!packageName) continue;
      const targetRepo = producedByPackage.get(packageName);
      if (!targetRepo || targetRepo.id === sourceRepo.id) continue;

      const sourceRoot = repoRootNodeId(graph, sourceRepo);
      const targetGraph = graphByRepoId.get(targetRepo.id);
      const targetRoot = targetGraph ? repoRootNodeId(targetGraph, targetRepo) : null;
      if (!sourceRoot || !targetRoot) continue;
      const sourceSystem = systemNodeByRepoId.get(sourceRepo.id);
      const targetSystem = systemNodeByRepoId.get(targetRepo.id);
      if (!sourceSystem || !targetSystem) continue;

      const sourceEvidence = evidenceForPackageDependency(graph, packageName);
      const targetEvidence = targetGraph ? evidenceForProducedPackage(targetGraph, targetRepo, packageName) : [];
      if (sourceEvidence.length === 0 || targetEvidence.length === 0) continue;
      const evidence = [...sourceEvidence, ...targetEvidence];
      const id = stableId("cross-repo", sourceRepo.id, targetRepo.id, packageName);
      const version = dependencyVersion(link, packageName);
      const relationshipSummary =
        `${sourceRepo.owner}/${sourceRepo.name} consumes the npm package ${packageName}, ` +
        `which is produced by ${targetRepo.owner}/${targetRepo.name}. ` +
        "This is a package-level code dependency, not a direct network call.";
      const relationshipContract = [
        "Relationship type: Package consumer -> package producer",
        `Consumer repo: ${sourceRepo.owner}/${sourceRepo.name}`,
        `Producer repo: ${targetRepo.owner}/${targetRepo.name}`,
        `Package: ${packageName}`,
        `Version range: ${version}`,
        "Mechanism: package.json dependency resolved through the package registry",
      ].join("\n");
      crossRepoConnections.push({
        id,
        sourceRepositoryId: sourceRepo.id,
        targetRepositoryId: targetRepo.id,
        sourcePackage: packageName,
        targetPackage: targetRepo.packageName ?? packageName,
        sourceEvidence,
        targetEvidence,
        evidence,
        summary: relationshipSummary,
      });

      links.push({
        id,
        source: sourceSystem.id,
        target: targetSystem.id,
        kind: "package",
        criticality: 3,
        summary: relationshipSummary,
        code: evidence[0]?.snippet ?? `package dependency ${packageName}`,
        codePath: `${evidence[0]?.filePath ?? "package.json"}:L${evidence[0]?.lineStart ?? 1}`,
        contract: relationshipContract,
        failure:
          `If ${targetRepo.owner}/${targetRepo.name} changes the ${packageName} package API, package name, ` +
          `or published compatible versions, ${sourceRepo.owner}/${sourceRepo.name} can fail during install, build, or runtime.`,
        risks: [],
        confidence: "confirmed",
        beforeYouChange:
          `Check both sides before changing this relationship: ${sourceRepo.owner}/${sourceRepo.name} declares ` +
          `${packageName}@${version}, and ${targetRepo.owner}/${targetRepo.name} declares package name ${packageName}.`,
        evidence,
      });
    }
  }

  return {
    workspaceId: args.workspaceId,
    repositories: args.repositories,
    nodes,
    links,
    crossRepoConnections,
  };
}
