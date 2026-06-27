import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { RepoRef } from "../types/domain.js";

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd?: string, timeoutMs?: number): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
    timeout: timeoutMs,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  });
  return stdout.trim();
}

export interface CloneResult {
  repoRef: RepoRef;
  localPath: string;
  commitSha: string;
}

export async function clonePublicRepoAtCommit(options: {
  repoRef: RepoRef;
  reposDir: string;
  scanId: string;
  commitSha?: string;
  treeRef?: string;
  timeoutMs?: number;
}): Promise<CloneResult> {
  const target = path.join(options.reposDir, options.scanId);
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(path.dirname(target), { recursive: true });

  const cloneArgs = ["clone", "--depth", "1"];
  if (options.treeRef && !options.commitSha) {
    cloneArgs.push("--branch", options.treeRef, "--single-branch");
  }
  cloneArgs.push(options.repoRef.cloneUrl, target);
  await git(cloneArgs, undefined, options.timeoutMs);

  if (options.commitSha) {
    await git(["fetch", "--depth", "1", "origin", options.commitSha], target, options.timeoutMs);
    await git(["checkout", "--detach", options.commitSha], target, options.timeoutMs);
  }

  const commitSha = await git(["rev-parse", "HEAD"], target, options.timeoutMs);
  return {
    repoRef: options.repoRef,
    localPath: target,
    commitSha,
  };
}
