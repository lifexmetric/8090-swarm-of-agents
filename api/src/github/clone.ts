import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { RepoRef } from "../types/domain.js";

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
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
}): Promise<CloneResult> {
  const target = path.join(options.reposDir, options.scanId);
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(path.dirname(target), { recursive: true });

  await git(["clone", "--depth", "1", options.repoRef.cloneUrl, target]);

  if (options.commitSha) {
    await git(["fetch", "--depth", "1", "origin", options.commitSha], target);
    await git(["checkout", "--detach", options.commitSha], target);
  }

  const commitSha = await git(["rev-parse", "HEAD"], target);
  return {
    repoRef: options.repoRef,
    localPath: target,
    commitSha,
  };
}
