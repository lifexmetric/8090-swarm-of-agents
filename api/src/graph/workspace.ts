import type { Evidence, GraphData, GraphLink, RepositoryRecord, ScanRecord, WorkspaceGraph } from "../types/domain.js";
import { stableId } from "../util/ids.js";

function repoRootNodeId(graph: GraphData, repo: RepositoryRecord): string | null {
  return graph.nodes.find((node) => node.repositoryId === repo.id && node.label === `${repo.owner}/${repo.name}`)?.id ?? null;
}

function evidenceForPackageDependency(graph: GraphData, packageName: string): Evidence[] {
  return graph.links
    .filter((link) => link.contract.includes(`dependency ${packageName}@`) || link.target.endsWith(stableId("package", packageName)))
    .flatMap((link) => link.evidence ?? [])
    .slice(0, 6);
}

export function buildWorkspaceGraph(args: {
  workspaceId: string;
  repositories: RepositoryRecord[];
  scans: ScanRecord[];
}): WorkspaceGraph {
  const graphs = args.scans.flatMap((scan) => (scan.graph ? [scan.graph] : []));
  const nodes = graphs.flatMap((graph) => graph.nodes);
  const links: GraphLink[] = graphs.flatMap((graph) => graph.links);
  const repoById = new Map(args.repositories.map((repo) => [repo.id, repo]));
  const graphByRepoId = new Map<string, GraphData>();
  for (const scan of args.scans) {
    if (scan.graph) graphByRepoId.set(scan.repositoryId, scan.graph);
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

      const evidence = evidenceForPackageDependency(graph, packageName);
      const id = stableId("cross-repo", sourceRepo.id, targetRepo.id, packageName);
      crossRepoConnections.push({
        id,
        sourceRepositoryId: sourceRepo.id,
        targetRepositoryId: targetRepo.id,
        sourcePackage: packageName,
        targetPackage: targetRepo.packageName ?? packageName,
        evidence,
        summary: `${sourceRepo.owner}/${sourceRepo.name} depends on package ${packageName}, which is produced by ${targetRepo.owner}/${targetRepo.name}.`,
      });

      links.push({
        id,
        source: sourceRoot,
        target: targetRoot,
        kind: "config",
        criticality: 3,
        summary: `${sourceRepo.owner}/${sourceRepo.name} depends on package ${packageName} from ${targetRepo.owner}/${targetRepo.name}.`,
        code: evidence[0]?.snippet ?? `package dependency ${packageName}`,
        codePath: `${evidence[0]?.filePath ?? "package.json"}:L${evidence[0]?.lineStart ?? 1}`,
        contract: `Cross-repo package relationship: ${packageName}`,
        failure: "Version mismatch or package publishing failure can break the dependent repository.",
        risks: [],
        confidence: evidence.length > 0 ? "confirmed" : "inferred",
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
