import { z } from "zod";
import type { RepoRef } from "../types/domain.js";

const OWNER_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const repoUrlSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.replace(/\.git$/, ""))
  .refine((value) => {
    if (OWNER_REPO.test(value)) return true;
    try {
      const url = value.startsWith("github.com/") ? new URL(`https://${value}`) : new URL(value);
      return url.hostname === "github.com" && url.pathname.split("/").filter(Boolean).length >= 2;
    } catch {
      return false;
    }
  }, "Expected a public GitHub repository URL such as https://github.com/owner/repo");

export function parseGitHubRepo(input: string): RepoRef {
  const normalized = repoUrlSchema.parse(input);
  const pathParts = OWNER_REPO.test(normalized)
    ? normalized.split("/")
    : (normalized.startsWith("github.com/")
        ? new URL(`https://${normalized}`).pathname
        : new URL(normalized).pathname
      )
        .split("/")
        .filter(Boolean);

  const owner = pathParts[0];
  const repoName = pathParts[1];
  if (!owner || !repoName) {
    throw new Error("GitHub URL must include owner and repo name");
  }

  const name = repoName.replace(/\.git$/, "");
  const normalizedUrl = `https://github.com/${owner}/${name}`;
  return {
    owner,
    name,
    normalizedUrl,
    cloneUrl: `${normalizedUrl}.git`,
  };
}
