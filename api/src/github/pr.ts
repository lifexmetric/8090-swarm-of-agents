import { z } from "zod";
import type {
  PullRequestChangedFile,
  PullRequestCommit,
  PullRequestHunk,
  PullRequestRef,
} from "../types/domain.js";
import { redactSecrets } from "../util/redact.js";
import { stableId } from "../util/ids.js";

export const pullRequestUrlSchema = z.string().trim().transform((value, ctx) => {
  const parsed = parseGitHubPullRequestUrl(value);
  if (!parsed) {
    ctx.addIssue({
      code: "custom",
      message: "Expected a GitHub pull request URL such as https://github.com/owner/repo/pull/123",
    });
    return z.NEVER;
  }
  return value.trim();
});

export interface PullRequestRefInput {
  owner: string;
  repo: string;
  number: number;
  normalizedUrl: string;
}

export interface PublicPullRequest {
  url: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  state: string;
  author?: string | null;
  publicAccess: boolean;
  base: PullRequestRef;
  head: PullRequestRef;
  changedFiles: PullRequestChangedFile[];
  commits: PullRequestCommit[];
  hunks: PullRequestHunk[];
  fetchCompleteness: {
    filesTruncated: boolean;
    commitsTruncated: boolean;
    filePagesFetched: number;
    commitPagesFetched: number;
  };
}

interface GitHubPrResponse {
  html_url: string;
  number: number;
  title: string;
  state: string;
  user?: { login?: string | null } | null;
  base: { ref: string; sha: string; repo: { owner: { login: string }; name: string } };
  head: { ref: string; sha: string; repo: { owner: { login: string }; name: string } };
}

interface GitHubFileResponse {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface GitHubCommitResponse {
  sha: string;
  commit?: {
    message?: string;
    author?: { name?: string | null; date?: string | null } | null;
  };
  author?: { login?: string | null } | null;
}

function headers(): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "atlas-pr-handoff",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export function parseGitHubPullRequestUrl(input: string): PullRequestRefInput | null {
  const trimmed = input.trim();
  const normalized = trimmed.startsWith("github.com/") ? `https://${trimmed}` : trimmed;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }
  if (url.hostname !== "github.com") return null;
  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length < 4 || parts[2] !== "pull") return null;
  const number = Number.parseInt(parts[3], 10);
  if (!parts[0] || !parts[1] || !Number.isFinite(number) || number <= 0) return null;
  return {
    owner: parts[0],
    repo: parts[1].replace(/\.git$/i, ""),
    number,
    normalizedUrl: `https://github.com/${parts[0]}/${parts[1].replace(/\.git$/i, "")}/pull/${number}`,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) {
    const status = response.status === 404 ? "not found or not public" : `returned ${response.status}`;
    throw Object.assign(new Error(`GitHub PR fetch failed: ${status}`), { statusCode: response.status === 404 ? 404 : 502 });
  }
  return response.json() as Promise<T>;
}

function nextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const [rawUrl, rawRel] = part.split(";").map((item) => item.trim());
    if (rawRel === 'rel="next"') return rawUrl.replace(/^<|>$/g, "");
  }
  return null;
}

async function fetchPaged<T>(url: string, maxPages = 30): Promise<{ items: T[]; truncated: boolean; pagesFetched: number }> {
  const items: T[] = [];
  let next: string | null = `${url}${url.includes("?") ? "&" : "?"}per_page=100&page=1`;
  let pagesFetched = 0;
  while (next && pagesFetched < maxPages) {
    const response = await fetch(next, { headers: headers() });
    if (!response.ok) {
      const status = response.status === 404 ? "not found or not public" : `returned ${response.status}`;
      throw Object.assign(new Error(`GitHub PR fetch failed: ${status}`), { statusCode: response.status === 404 ? 404 : 502 });
    }
    const batch = await response.json() as T[];
    items.push(...batch);
    pagesFetched += 1;
    next = nextLink(response.headers.get("link"));
  }
  return { items, truncated: Boolean(next), pagesFetched };
}

export async function fetchPublicPullRequest(input: string): Promise<PublicPullRequest> {
  const ref = parseGitHubPullRequestUrl(input);
  if (!ref) throw Object.assign(new Error("Invalid GitHub pull request URL"), { statusCode: 400 });
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}`;
  const [pr, filesPage, commitsPage] = await Promise.all([
    fetchJson<GitHubPrResponse>(apiBase),
    fetchPaged<GitHubFileResponse>(`${apiBase}/files`),
    fetchPaged<GitHubCommitResponse>(`${apiBase}/commits`),
  ]);

  const changedFiles = filesPage.items.map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: file.patch ? redactSecrets(file.patch) : undefined,
    patchStatus: file.patch ? "available" as const : "missing" as const,
    patchUnavailableReason: file.patch ? undefined : patchUnavailableReason(file),
  }));

  return {
    url: ref.normalizedUrl,
    owner: ref.owner,
    repo: ref.repo,
    number: ref.number,
    title: redactSecrets(pr.title),
    state: pr.state,
    author: pr.user?.login ?? null,
    publicAccess: true,
    base: {
      owner: pr.base.repo.owner.login,
      repo: pr.base.repo.name,
      ref: pr.base.ref,
      sha: pr.base.sha,
    },
    head: {
      owner: pr.head.repo.owner.login,
      repo: pr.head.repo.name,
      ref: pr.head.ref,
      sha: pr.head.sha,
    },
    changedFiles,
    commits: commitsPage.items.map((commit) => ({
      sha: commit.sha,
      message: redactSecrets((commit.commit?.message ?? "").split("\n")[0] ?? "").slice(0, 300),
      author: commit.author?.login ?? commit.commit?.author?.name ?? null,
      date: commit.commit?.author?.date ?? null,
    })),
    hunks: changedFiles.flatMap((file) => parsePatchHunks(file.filename, file.patch ?? "")),
    fetchCompleteness: {
      filesTruncated: filesPage.truncated,
      commitsTruncated: commitsPage.truncated,
      filePagesFetched: filesPage.pagesFetched,
      commitPagesFetched: commitsPage.pagesFetched,
    },
  };
}

function patchUnavailableReason(file: GitHubFileResponse): string {
  if (file.status === "removed") return "GitHub did not provide patch text for this removed file.";
  if (file.status === "renamed") return "GitHub did not provide patch text for this renamed or moved file.";
  if (file.status === "changed" || file.status === "modified") return "GitHub did not provide patch text, commonly because the file is binary or the patch is too large.";
  return `GitHub did not provide patch text for ${file.status} file.`;
}

export function parsePatchHunks(filePath: string, patch: string): PullRequestHunk[] {
  if (!patch.trim()) return [];
  const lines = patch.split(/\r?\n/);
  const hunks: PullRequestHunk[] = [];
  let current: {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    header: string;
    lines: string[];
    addedLines: Array<{ line: number; content: string }>;
    removedLines: Array<{ line: number; content: string }>;
    oldCursor: number;
    newCursor: number;
  } | null = null;

  function finish() {
    if (!current) return;
    const body = current.lines.join("\n");
    hunks.push({
      id: stableId("pr-hunk", filePath, current.header, body),
      filePath,
      oldStart: current.oldStart,
      oldLines: current.oldLines,
      newStart: current.newStart,
      newLines: current.newLines,
      header: current.header,
      patch: redactSecrets(body).slice(0, 8000),
      addedLines: current.addedLines,
      removedLines: current.removedLines,
    });
    current = null;
  }

  for (const line of lines) {
    const header = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (header) {
      finish();
      const oldStart = Number.parseInt(header[1], 10);
      const newStart = Number.parseInt(header[3], 10);
      current = {
        oldStart,
        oldLines: Number.parseInt(header[2] ?? "1", 10),
        newStart,
        newLines: Number.parseInt(header[4] ?? "1", 10),
        header: line,
        lines: [line],
        addedLines: [],
        removedLines: [],
        oldCursor: oldStart,
        newCursor: newStart,
      };
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.addedLines.push({ line: current.newCursor, content: redactSecrets(line.slice(1)) });
      current.newCursor += 1;
      continue;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      current.removedLines.push({ line: current.oldCursor, content: redactSecrets(line.slice(1)) });
      current.oldCursor += 1;
      continue;
    }
    if (!line.startsWith("\\")) {
      current.oldCursor += 1;
      current.newCursor += 1;
    }
  }
  finish();
  return hunks;
}
