import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function defaultRootDir(): string {
  const cwd = process.cwd();
  if (path.basename(cwd) === "api") return path.resolve(cwd, "..");
  return cwd;
}

export interface AtlasConfig {
  rootDir: string;
  port: number;
  host: string;
  databaseUrl: string;
  databasePath: string;
  workspaceId: string;
  backboardApiKey?: string;
  backboardApiBase: string;
  backboardAssistantId?: string;
  backboardMemoryMode: string;
  backboardModel?: string;
  scanMaxFiles: number;
  scanMaxFileBytes: number;
  scanMaxPromptChars: number;
  reposDir: string;
}

function firstNonEmpty(...values: Array<string | undefined | null>): string | undefined {
  return values.find((value) => value !== undefined && value !== null && value.trim().length > 0)?.trim();
}

function readInt(names: string | string[], fallback: number): number {
  const raw = firstNonEmpty(...(Array.isArray(names) ? names : [names]).map((name) => process.env[name]));
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveFileDatabaseUrl(databaseUrl: string, rootDir: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("Only SQLite file DATABASE_URL values are supported, for example file:./.atlas/atlas.db");
  }

  const raw = databaseUrl.slice("file:".length);
  const decoded = decodeURIComponent(raw);
  return path.isAbsolute(decoded) ? decoded : path.resolve(rootDir, decoded);
}

export function loadConfig(overrides: Partial<AtlasConfig> = {}): AtlasConfig {
  const rootDir = overrides.rootDir ?? firstNonEmpty(process.env.ATLAS_ROOT_DIR) ?? defaultRootDir();
  dotenv.config({ path: path.join(rootDir, ".env"), override: false });
  dotenv.config({ path: path.join(API_DIR, ".env"), override: false });

  const databaseUrl = overrides.databaseUrl ?? firstNonEmpty(process.env.DATABASE_URL) ?? "file:./.atlas/atlas.db";
  const databasePath = overrides.databasePath ?? resolveFileDatabaseUrl(databaseUrl, rootDir);

  return {
    rootDir,
    port: overrides.port ?? readInt("PORT", 3001),
    host: overrides.host ?? firstNonEmpty(process.env.HOST) ?? "127.0.0.1",
    databaseUrl,
    databasePath,
    workspaceId: overrides.workspaceId ?? firstNonEmpty(process.env.ATLAS_WORKSPACE_ID) ?? "default",
    backboardApiKey: overrides.backboardApiKey ?? firstNonEmpty(process.env.BACKBOARD_API_KEY),
    backboardApiBase:
      overrides.backboardApiBase ??
      firstNonEmpty(process.env.BACKBOARD_API_BASE, process.env.BACKBOARD_BASE_URL) ??
      "https://app.backboard.io/api",
    backboardAssistantId:
      overrides.backboardAssistantId ?? firstNonEmpty(process.env.BACKBOARD_ASSISTANT_ID),
    backboardMemoryMode:
      overrides.backboardMemoryMode ??
      firstNonEmpty(process.env.BACKBOARD_MEMORY_MODE, process.env.BACKBOARD_MEMORY) ??
      "Auto",
    backboardModel: overrides.backboardModel ?? firstNonEmpty(process.env.BACKBOARD_MODEL),
    scanMaxFiles: overrides.scanMaxFiles ?? readInt(["SCAN_MAX_FILES", "ATLAS_MAX_FILES"], 1200),
    scanMaxFileBytes:
      overrides.scanMaxFileBytes ??
      readInt("SCAN_MAX_FILE_BYTES", readInt("ATLAS_MAX_FILE_SIZE_KB", 220) * 1024),
    scanMaxPromptChars: overrides.scanMaxPromptChars ?? readInt("SCAN_MAX_PROMPT_CHARS", 42_000),
    reposDir:
      overrides.reposDir ??
      firstNonEmpty(process.env.ATLAS_REPOS_DIR, process.env.ATLAS_REPO_TMP_DIR) ??
      path.join(rootDir, ".atlas", "repos"),
  };
}
