import fs from "node:fs/promises";
import path from "node:path";
import type { AtlasConfig } from "../config.js";
import { BackboardClient } from "../backboard/client.js";
import type { AtlasRepository } from "../db/database.js";
import { clonePublicRepoAtCommit } from "../github/clone.js";
import { parseGitHubRepo } from "../github/url.js";
import { buildScanContext } from "../graph/context.js";
import { buildGraphFromArtifacts } from "../graph/normalize.js";
import type { BackboardSynthesis, RepositoryRecord, ScanArtifacts, ScanRecord } from "../types/domain.js";
import { newId, stableId } from "../util/ids.js";
import { applyScanScope } from "../scanner/scope.js";
import { scanRepository } from "../scanner/scanner.js";

export interface BackboardLike {
  createAssistant(workspaceId: string): Promise<string>;
  synthesizeScan(args: {
    assistantId: string;
    repository: RepositoryRecord;
    commitSha: string;
    artifacts: ScanArtifacts;
  }): Promise<BackboardSynthesis>;
}

export class ScanService {
  private readonly backboard: BackboardLike;

  constructor(
    private readonly config: AtlasConfig,
    private readonly repository: AtlasRepository,
    backboard?: BackboardLike,
  ) {
    this.backboard = backboard ?? new BackboardClient(config);
  }

  async startScan(input: {
    repoUrl: string;
    workspaceId?: string;
    commitSha?: string;
  }): Promise<ScanRecord> {
    const workspaceId = input.workspaceId ?? this.config.workspaceId;
    const repoRef = parseGitHubRepo(input.repoUrl);
    if (this.config.githubAllowedOrgs.length > 0 && !this.config.githubAllowedOrgs.includes(repoRef.owner)) {
      throw new Error(`GitHub owner ${repoRef.owner} is not allowed by GITHUB_ALLOWED_ORGS`);
    }
    this.repository.ensureWorkspace(workspaceId);

    const repository = this.repository.upsertRepository({
      id: stableId("repo", workspaceId, repoRef.owner, repoRef.name, repoRef.treePath ?? ""),
      workspaceId,
      owner: repoRef.owner,
      name: repoRef.name,
      url: repoRef.targetUrl ?? repoRef.normalizedUrl,
      cloneUrl: repoRef.cloneUrl,
    });

    const scan = this.repository.createScan({
      id: newId("scan"),
      workspaceId,
      repositoryId: repository.id,
      repoUrl: repoRef.targetUrl ?? repoRef.normalizedUrl,
      commitSha: input.commitSha,
    });
    this.repository.addEvent({
      scanId: scan.id,
      type: "queued",
      message: `Queued ${repoRef.owner}/${repoRef.name}${repoRef.treePath ? ` @ ${repoRef.treePath}` : ""}`,
    });

    void this.processScan(scan.id).catch(() => {
      // The failure has already been recorded by processScan.
    });

    return scan;
  }

  async processScan(scanId: string): Promise<ScanRecord> {
    const scan = this.repository.getScan(scanId);
    if (!scan) throw new Error(`Scan not found: ${scanId}`);
    const repo = this.repository.getRepository(scan.repositoryId);
    if (!repo) throw new Error(`Repository not found for scan: ${scanId}`);
    const requestedScope = parseGitHubRepo(scan.repoUrl);

    try {
      this.repository.updateScanStatus(scanId, "running");
      this.repository.addEvent({
        scanId,
        type: "clone",
        message: `Cloning ${repo.owner}/${repo.name}${scan.commitSha ? ` at ${scan.commitSha}` : ""}`,
      });

      const cloned = await clonePublicRepoAtCommit({
        repoRef: {
          owner: repo.owner,
          name: repo.name,
          normalizedUrl: repo.url,
          cloneUrl: repo.cloneUrl,
        },
        reposDir: this.config.reposDir,
        scanId,
        commitSha: scan.commitSha ?? undefined,
        treeRef: requestedScope.treeRef,
        timeoutMs: this.config.scanTimeoutSeconds * 1000,
      });

      this.repository.addEvent({
        scanId,
        type: "scan",
        message: `Resolved commit ${cloned.commitSha}; running deterministic scanners`,
      });

      let scanRoot = cloned.localPath;
      if (requestedScope.treePath) {
        scanRoot = path.resolve(cloned.localPath, requestedScope.treePath);
        const relative = path.relative(cloned.localPath, scanRoot);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
          throw new Error("Requested tree path escapes the repository root");
        }
        const scopedStat = await fs.stat(scanRoot).catch(() => null);
        if (!scopedStat?.isDirectory()) {
          throw new Error(`Requested tree path not found or not a directory: ${requestedScope.treePath}`);
        }
        this.repository.addEvent({
          scanId,
          type: "scan",
          message: `Scanning subdirectory ${requestedScope.treePath}`,
        });
      }

      const artifacts = applyScanScope(
        await scanRepository(scanRoot, {
          maxFiles: this.config.scanMaxFiles,
          maxFileBytes: this.config.scanMaxFileBytes,
        }),
        requestedScope,
      );

      this.repository.updateRepositoryPackage(repo.id, artifacts.package.name ?? null, cloned.commitSha);

      this.repository.addEvent({
        scanId,
        type: "backboard",
        message: `Calling Backboard with ${artifacts.findings.length} findings and ${artifacts.selectedSnippets.length} snippets`,
      });

      const assistantId = await this.ensureAssistant(scan.workspaceId);
      const updatedRepo = this.repository.getRepository(repo.id) ?? repo;
      const backboard = await this.backboard.synthesizeScan({
        assistantId,
        repository: updatedRepo,
        commitSha: cloned.commitSha,
        artifacts,
      });
      this.repository.recordBackboard({
        workspaceId: scan.workspaceId,
        repositoryId: repo.id,
        scanId,
        backboard,
        requestSummary: `${repo.owner}/${repo.name}@${cloned.commitSha}`,
      });
      if (backboard.memoryStatus?.attempted && !backboard.memoryStatus.succeeded) {
        this.repository.addEvent({
          scanId,
          type: "backboard",
          message: `Backboard memory write failed: ${backboard.memoryStatus.error ?? "unknown error"}`,
        });
      }

      const graph = buildGraphFromArtifacts({
        repository: updatedRepo,
        commitSha: cloned.commitSha,
        artifacts,
        backboard,
      });

      const context = buildScanContext({
        repository: updatedRepo,
        graph,
        commitSha: cloned.commitSha,
        scanScope: artifacts.scanScope,
        backboard: {
          assistantId: backboard.assistantId,
          threadId: backboard.threadId,
          runId: backboard.runId,
          memoryMode: backboard.memoryMode,
          memoryOperationId: backboard.memoryOperationId,
          memoryStatus: backboard.memoryStatus ?? null,
          durableFacts: backboard.durableFacts ?? [],
          advisorySynthesis: backboard.synthesized,
        },
      });

      this.repository.addEvent({
        scanId,
        type: "persist",
        message: `Persisting ${graph.nodes.length} nodes and ${graph.links.length} edges`,
      });
      this.repository.replaceGraphRows({
        workspaceId: scan.workspaceId,
        repositoryId: repo.id,
        scanId,
        graph,
      });
      this.repository.completeScan({
        scanId,
        commitSha: cloned.commitSha,
        graph,
        context,
        artifacts,
        backboard,
      });
      this.repository.addEvent({
        scanId,
        type: "complete",
        message: `Completed scan for ${repo.owner}/${repo.name}${requestedScope.treePath ? ` @ ${requestedScope.treePath}` : ""}`,
      });

      return this.repository.getScan(scanId)!;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown scan failure";
      this.repository.updateScanStatus(scanId, "failed", message);
      this.repository.addEvent({
        scanId,
        type: "error",
        message,
      });
      throw error;
    }
  }

  private async ensureAssistant(workspaceId: string): Promise<string> {
    const existing = this.repository.getWorkspaceAssistantId(workspaceId);
    if (existing) return existing;
    if (this.config.backboardAssistantId) {
      this.repository.setWorkspaceAssistantId(workspaceId, this.config.backboardAssistantId);
      return this.config.backboardAssistantId;
    }
    const assistantId = await this.backboard.createAssistant(workspaceId);
    this.repository.setWorkspaceAssistantId(workspaceId, assistantId);
    return assistantId;
  }
}
