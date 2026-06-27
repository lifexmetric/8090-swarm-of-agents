import type { AtlasConfig } from "../config.js";
import type { BackboardMemoryStatus, BackboardSynthesis, DurableMemoryFact, RepositoryRecord, ScanArtifacts } from "../types/domain.js";
import { compactForPrompt, redactSecrets } from "../util/redact.js";
import { stableId } from "../util/ids.js";

interface BackboardAssistantResponse {
  id?: string;
  assistant_id?: string;
  [key: string]: unknown;
}

interface BackboardMessageResponse {
  id?: string;
  message_id?: string;
  thread_id?: string;
  run_id?: string;
  content?: unknown;
  message?: { content?: unknown; id?: string };
  output?: unknown;
  [key: string]: unknown;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item) {
          return asText((item as { text: unknown }).text);
        }
        return JSON.stringify(item);
      })
      .join("\n");
  }
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return "";
}

function extractJsonObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.unshift(fenced[1].trim());
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try next candidate.
    }
  }
  return undefined;
}

function listFromJson(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function recordFromJson(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

export function buildDurableMemoryFacts(args: {
  repository: RepositoryRecord;
  commitSha: string;
  artifacts: ScanArtifacts;
}): DurableMemoryFact[] {
  const repo = `${args.repository.owner}/${args.repository.name}`;
  const facts: DurableMemoryFact[] = [];
  const packageNameFinding = args.artifacts.findings.find(
    (finding) => finding.detector === "package-json-name" && finding.value === args.artifacts.package.name,
  );
  if (args.artifacts.package.name && packageNameFinding) {
    facts.push({
      id: stableId("memory-fact", args.repository.id, args.commitSha, "package-name", args.artifacts.package.name),
      scope: "repository",
      repositoryId: args.repository.id,
      repo,
      commitSha: args.commitSha,
      fact: `${repo} declares package identity ${args.artifacts.package.name}.`,
      confidence: "confirmed",
      evidenceIds: [packageNameFinding.id],
      evidenceRefs: [
        {
          evidenceId: packageNameFinding.id,
          filePath: packageNameFinding.filePath,
          lineStart: packageNameFinding.lineStart,
          lineEnd: packageNameFinding.lineEnd,
          detector: packageNameFinding.detector,
          snippet: redactSecrets(packageNameFinding.snippet),
        },
      ],
    });
  }

  for (const finding of args.artifacts.findings.filter((item) => item.kind === "package").slice(0, 40)) {
    if (finding.detector === "package-json-name") continue;
    facts.push({
      id: stableId("memory-fact", args.repository.id, args.commitSha, "dependency", finding.label),
      scope: "dependency",
      repositoryId: args.repository.id,
      repo,
      commitSha: args.commitSha,
      fact: `${repo} declares dependency ${finding.label}.`,
      confidence: "confirmed",
      evidenceIds: [finding.id],
      evidenceRefs: [
        {
          evidenceId: finding.id,
          filePath: finding.filePath,
          lineStart: finding.lineStart,
          lineEnd: finding.lineEnd,
          detector: finding.detector,
          snippet: redactSecrets(finding.snippet),
        },
      ],
    });
  }

  return facts;
}

export class BackboardClient {
  constructor(private readonly config: AtlasConfig) {}

  private async request<T>(path: string, body: unknown): Promise<T> {
    if (!this.config.backboardApiKey) {
      throw new Error("BACKBOARD_API_KEY is required for real Backboard scans");
    }

    const response = await fetch(`${this.config.backboardApiBase}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.backboardApiKey}`,
        "X-API-Key": this.config.backboardApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    const parsed = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message =
        parsed && typeof parsed === "object" && "message" in parsed
          ? String((parsed as { message: unknown }).message)
          : `Backboard API returned ${response.status}`;
      throw new Error(message);
    }
    return parsed as T;
  }

  async createAssistant(workspaceId: string): Promise<string> {
    const body: Record<string, unknown> = {
      name: `Atlas workspace ${workspaceId}`,
      system_prompt:
        "You are Atlas' architecture analysis assistant. Use deterministic scan artifacts as source of truth. Do not invent nodes or edges without evidence. Persist reusable repo knowledge in memory.",
      metadata: {
        product: "atlas",
        workspaceId,
      },
    };
    if (this.config.backboardModel) body.model = this.config.backboardModel;

    const response = await this.request<BackboardAssistantResponse>("/assistants", body);
    const assistantId = response.id ?? response.assistant_id;
    if (!assistantId) throw new Error("Backboard assistant creation response did not include an assistant id");
    return assistantId;
  }

  async synthesizeScan(args: {
    assistantId: string;
    repository: RepositoryRecord;
    commitSha: string;
    artifacts: ScanArtifacts;
  }): Promise<BackboardSynthesis> {
    const compactArtifacts = {
      repository: {
        owner: args.repository.owner,
        name: args.repository.name,
        url: args.repository.url,
        commitSha: args.commitSha,
        packageName: args.artifacts.package.name,
      },
      inventory: {
        files: args.artifacts.files.slice(0, 240),
        languageCounts: args.artifacts.languageCounts,
        dependencies: args.artifacts.package.dependencies,
        devDependencies: args.artifacts.package.devDependencies,
      },
      findings: args.artifacts.findings.slice(0, 220).map((finding) => ({
        id: finding.id,
        kind: finding.kind,
        label: finding.label,
        value: finding.value,
        filePath: finding.filePath,
        lineStart: finding.lineStart,
        snippet: finding.snippet,
        detector: finding.detector,
        confidenceReason: finding.confidenceReason,
      })),
      selectedSnippets: args.artifacts.selectedSnippets.slice(0, 80),
    };

    const prompt = `Analyze this Atlas repository scan. Return concise JSON with keys: repoPurpose, keyModules, detectedDependencies, riskAreas, nodeSummaries, edgeSummaries, crossRepoConnectionClues. Use only provided evidence. If a claim is unsupported, omit it.

${compactForPrompt(compactArtifacts, this.config.scanMaxPromptChars)}`;

    const response = await this.request<BackboardMessageResponse>("/threads/messages", {
      assistant_id: args.assistantId,
      role: "user",
      content: prompt,
      memory: "Off",
      metadata: {
        product: "atlas",
        repositoryId: args.repository.id,
        repo: `${args.repository.owner}/${args.repository.name}`,
        commitSha: args.commitSha,
      },
    });

    const threadId = response.thread_id;
    if (!threadId) throw new Error("Backboard message response did not include a thread id");
    const content = asText(response.content ?? response.message?.content ?? response.output ?? response);
    const parsed = extractJsonObject(content);
    const durableFacts = buildDurableMemoryFacts(args);
    const memoryStatus = await this.addMemorySafe({
      assistantId: args.assistantId,
      repository: args.repository,
      commitSha: args.commitSha,
      facts: durableFacts,
    });

    return {
      assistantId: args.assistantId,
      threadId,
      runId: response.run_id ?? null,
      messageId: response.message_id ?? response.message?.id ?? response.id ?? null,
      content,
      memoryMode: this.config.backboardMemoryMode,
      memoryOperationId: memoryStatus.operationId ?? null,
      memoryStatus,
      durableFacts,
      responseJson: response,
      synthesized: parsed
        ? {
            repoPurpose: typeof parsed.repoPurpose === "string" ? parsed.repoPurpose : undefined,
            keyModules: listFromJson(parsed.keyModules),
            detectedDependencies: listFromJson(parsed.detectedDependencies),
            riskAreas: listFromJson(parsed.riskAreas),
            nodeSummaries: recordFromJson(parsed.nodeSummaries),
            edgeSummaries: recordFromJson(parsed.edgeSummaries),
            crossRepoConnectionClues: listFromJson(parsed.crossRepoConnectionClues),
          }
        : undefined,
    };
  }

  private async addMemorySafe(args: {
    assistantId: string;
    repository: RepositoryRecord;
    commitSha: string;
    facts: DurableMemoryFact[];
  }): Promise<BackboardMemoryStatus> {
    if (args.facts.length === 0) {
      return { attempted: false, succeeded: false, operationId: null, factCount: 0 };
    }
    try {
      const response = await this.request<Record<string, unknown>>(`/assistants/${args.assistantId}/memories`, {
        content: compactForPrompt(
          {
            purpose:
              "Durable Atlas repo/system knowledge for future human and AI-agent handoff. Store only these evidence-indexed facts; do not infer additional architecture.",
            repository: `${args.repository.owner}/${args.repository.name}`,
            repositoryId: args.repository.id,
            commitSha: args.commitSha,
            facts: args.facts,
          },
          12_000,
        ),
        metadata: {
          product: "atlas",
          repositoryId: args.repository.id,
          repo: `${args.repository.owner}/${args.repository.name}`,
          commitSha: args.commitSha,
          factCount: args.facts.length,
          evidenceIndexed: true,
        },
      });
      const id = response.id ?? response.memory_id ?? response.operation_id;
      return {
        attempted: true,
        succeeded: true,
        operationId: typeof id === "string" ? id : null,
        factCount: args.facts.length,
      };
    } catch (error) {
      return {
        attempted: true,
        succeeded: false,
        operationId: null,
        error: error instanceof Error ? error.message : "Unknown Backboard memory failure",
        factCount: args.facts.length,
      };
    }
  }
}
