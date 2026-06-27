import type { RepoRef, ScanArtifacts, ScanScope } from "../types/domain.js";

function normalizeTreePath(treePath: string): string {
  return treePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function prefixRepoPath(treePath: string, filePath: string): string {
  const prefix = normalizeTreePath(treePath);
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized === prefix || normalized.startsWith(`${prefix}/`)) return normalized;
  return `${prefix}/${normalized}`;
}

export function scanScopeFromRepoRef(repoRef: RepoRef): ScanScope | undefined {
  if (!repoRef.treeRef && !repoRef.treePath && !repoRef.targetUrl) return undefined;
  return {
    targetUrl: repoRef.targetUrl,
    treeRef: repoRef.treeRef,
    treePath: repoRef.treePath,
  };
}

export function applyScanScope(artifacts: ScanArtifacts, repoRef: RepoRef): ScanArtifacts {
  const scanScope = scanScopeFromRepoRef(repoRef);
  if (!scanScope?.treePath) {
    return scanScope ? { ...artifacts, scanScope } : artifacts;
  }

  const treePath = normalizeTreePath(scanScope.treePath);
  return {
    ...artifacts,
    scanScope,
    repoRoot: treePath,
    files: artifacts.files.map((file) => ({
      ...file,
      path: prefixRepoPath(treePath, file.path),
    })),
    findings: artifacts.findings.map((finding) => ({
      ...finding,
      filePath: prefixRepoPath(treePath, finding.filePath),
    })),
    selectedSnippets: artifacts.selectedSnippets.map((snippet) => ({
      ...snippet,
      filePath: prefixRepoPath(treePath, snippet.filePath),
    })),
  };
}

export function scopedRepositoryLabel(
  repository: { owner: string; name: string },
  scanScope?: ScanScope,
): string {
  if (scanScope?.treePath) {
    return `${repository.owner}/${repository.name}/${normalizeTreePath(scanScope.treePath)}`;
  }
  return `${repository.owner}/${repository.name}`;
}

export function scopedRepositoryPath(scanScope?: ScanScope): string {
  return scanScope?.treePath ? normalizeTreePath(scanScope.treePath) : ".";
}

export function scopedRepositoryUrl(
  repository: { url: string },
  scanScope?: ScanScope,
): string {
  return scanScope?.targetUrl ?? repository.url;
}
