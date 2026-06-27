import type { AtlasConfig } from "../config.js";
import { BackboardClient } from "../backboard/client.js";
import type { AtlasRepository } from "../db/database.js";
import { fetchPublicPullRequest } from "../github/pr.js";
import {
  buildPullRequestHandoffRecord,
  buildPullRequestMemoryFacts,
  mapPullRequestToGraph,
} from "../handoffs/pr-handoff.js";
import type {
  BackboardMemoryStatus,
  DurableMemoryFact,
  PullRequestAgentPacket,
  PullRequestHandoffRecord,
  ScanRecord,
} from "../types/domain.js";
import { stableId } from "../util/ids.js";

export interface HandoffBackboardLike {
  createAssistant(workspaceId: string): Promise<string>;
  storeHandoffMemory(args: {
    assistantId: string;
    workspaceId: string;
    handoffId: string;
    prUrl: string;
    facts: DurableMemoryFact[];
  }): Promise<BackboardMemoryStatus>;
}

export class HandoffService {
  private readonly backboard: HandoffBackboardLike;

  constructor(
    private readonly config: AtlasConfig,
    private readonly repository: AtlasRepository,
    backboard?: HandoffBackboardLike,
  ) {
    this.backboard = backboard ?? new BackboardClient(config);
  }

  async createFromPullRequest(input: {
    prUrl: string;
    workspaceId?: string;
  }): Promise<PullRequestHandoffRecord> {
    const workspaceId = input.workspaceId ?? this.config.workspaceId;
    const pr = await fetchPublicPullRequest(input.prUrl);
    if (this.config.githubAllowedOrgs.length > 0 && !this.config.githubAllowedOrgs.includes(pr.owner)) {
      throw new Error(`GitHub owner ${pr.owner} is not allowed by GITHUB_ALLOWED_ORGS`);
    }
    this.repository.ensureWorkspace(workspaceId);

    const repository = this.repository.upsertRepository({
      id: stableId("repo", workspaceId, pr.owner, pr.repo),
      workspaceId,
      owner: pr.owner,
      name: pr.repo,
      url: `https://github.com/${pr.owner}/${pr.repo}`,
      cloneUrl: `https://github.com/${pr.owner}/${pr.repo}.git`,
      lastCommitSha: pr.head.sha,
    });
    const scan = this.findLatestCompletedScan(workspaceId, repository.id);
    const mappings = mapPullRequestToGraph({
      pr,
      graph: scan?.graph ?? null,
      context: scan?.context?.handoff ?? null,
    });
    const handoffId = stableId("handoff", workspaceId, pr.owner, pr.repo, String(pr.number), pr.head.sha);
    const memoryFacts = buildPullRequestMemoryFacts({ handoffId, pr, repository, mappings });
    const assistantId = await this.ensureAssistantIfPossible(workspaceId);
    const memoryStatus = assistantId
      ? await this.backboard.storeHandoffMemory({
          assistantId,
          workspaceId,
          handoffId,
          prUrl: pr.url,
          facts: memoryFacts,
        })
      : {
          attempted: false,
          succeeded: false,
          operationId: null,
          error: "Backboard is not configured; PR handoff memory was not written.",
          factCount: memoryFacts.length,
        };

    const record = buildPullRequestHandoffRecord({
      handoffId,
      workspaceId,
      pr,
      repository,
      scan,
      mappings,
      memoryFacts,
      memoryStatus,
      backboardAssistantId: assistantId,
    });
    record.agentPacket.backboardMemoryRefs = memoryStatus.operationId ? [memoryStatus.operationId] : [];
    record.backboardMemoryOperationId = memoryStatus.operationId ?? null;

    return this.repository.createPullRequestHandoff(record);
  }

  getHandoff(id: string): PullRequestHandoffRecord | null {
    return this.repository.getPullRequestHandoff(id);
  }

  getContext(id: string): { handoff: PullRequestHandoffRecord; markdown: string } | null {
    const handoff = this.repository.getPullRequestHandoff(id);
    if (!handoff) return null;
    return {
      handoff,
      markdown: this.contextMarkdown(handoff),
    };
  }

  getAgentPacket(id: string): PullRequestAgentPacket | null {
    return this.repository.getPullRequestHandoff(id)?.agentPacket ?? null;
  }

  contextMarkdown(handoff: PullRequestHandoffRecord): string {
    const lines = [
      `# PR Handoff ${handoff.owner}/${handoff.repo}#${handoff.number}`,
      ``,
      handoff.humanBrief.summary,
      ``,
      `## Repo State`,
      `- PR: ${handoff.prUrl}`,
      `- Base: ${handoff.base.owner}/${handoff.base.repo}:${handoff.base.ref}@${handoff.base.sha}`,
      `- Head: ${handoff.head.owner}/${handoff.head.repo}:${handoff.head.ref}@${handoff.head.sha}`,
      `- Public access: ${handoff.publicAccess ? "confirmed without GitHub token" : "not confirmed"}`,
      ``,
      `## Changed Files`,
      ...handoff.changedFiles.map((file) => `- ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})`),
      ``,
      `## Impacted Architecture`,
      ...handoff.humanBrief.impactedArchitecture.map((item) => `- ${item}`),
      ``,
      `## Risks`,
      ...handoff.humanBrief.risks.map((item) => `- ${item}`),
      ``,
      `## Missing Tests`,
      ...handoff.humanBrief.missingTests.map((item) => `- ${item}`),
      ``,
      `## Next Steps`,
      ...handoff.humanBrief.nextSteps.map((item) => `- ${item}`),
      ``,
      `## Uncertainty`,
      ...handoff.humanBrief.uncertainty.map((item) => `- ${item}`),
      ``,
      `## Evidence`,
      ...(handoff.humanBrief.evidence.length > 0
        ? handoff.humanBrief.evidence.map((item) => `- ${item}`)
        : ["- No Atlas graph evidence mapped to the PR hunks."]),
      ``,
      `## Hunk Map`,
      ...handoff.mappings.flatMap((mapping) => [
        `### ${mapping.filePath} / ${mapping.hunkId}`,
        ...(mapping.nodes.length > 0 ? mapping.nodes.map((node) => `- Node ${node.label} (${node.nodeId}): ${node.reason} Evidence ${node.evidenceId ?? "none"}.`) : ["- No mapped nodes."]),
        ...(mapping.edges.length > 0 ? mapping.edges.map((edge) => `- Edge ${edge.source} -> ${edge.target} (${edge.edgeId}): ${edge.reason} Evidence ${edge.evidenceId ?? "none"}.`) : ["- No mapped edges."]),
        ...mapping.uncertainty.map((item) => `- Uncertainty: ${item}`),
      ]),
    ];
    return lines.join("\n");
  }

  private findLatestCompletedScan(workspaceId: string, repositoryId: string): ScanRecord | null {
    return this.repository.listLatestCompletedScans(workspaceId).find((scan) => scan.repositoryId === repositoryId) ?? null;
  }

  private async ensureAssistantIfPossible(workspaceId: string): Promise<string | null> {
    const existing = this.repository.getWorkspaceAssistantId(workspaceId);
    if (existing) return existing;
    if (this.config.backboardAssistantId) {
      this.repository.setWorkspaceAssistantId(workspaceId, this.config.backboardAssistantId);
      return this.config.backboardAssistantId;
    }
    if (!this.config.backboardApiKey) return null;
    const assistantId = await this.backboard.createAssistant(workspaceId);
    this.repository.setWorkspaceAssistantId(workspaceId, assistantId);
    return assistantId;
  }
}
