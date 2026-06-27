/**
 * Vercel serverless entry point for the Atlas API.
 *
 * Wraps the Fastify app as a standard Node.js HTTP handler.
 * SQLite and cloned repos are stored in /tmp (Vercel Lambda writable dir).
 * The scan is run synchronously within the HTTP request (synchronousScan: true)
 * so the serverless function does not return before the scan completes.
 *
 * Required Vercel environment variables:
 *   BACKBOARD_API_KEY       – Backboard API key
 *   BACKBOARD_ASSISTANT_ID  – (optional) reuse an existing assistant
 *   ATLAS_API_AUTH_TOKEN    – (optional) bearer token guard for the API
 *   ATLAS_WORKSPACE_ID      – (optional, defaults to "default")
 */

import http from "node:http";
import os from "node:os";
import path from "node:path";
import { AtlasRepository, migrate, openDatabase } from "./src/db/database.js";
import { buildApp } from "./src/server/app.js";
import type { AtlasConfig } from "./src/config.js";
import type { FastifyInstance } from "fastify";

let _app: FastifyInstance | null = null;

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const v = Number.parseInt(raw, 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function getApp(): Promise<FastifyInstance> {
  if (_app) return _app;

  const tmpDir = os.tmpdir();
  const dbPath = path.join(tmpDir, "atlas.db");

  const config: AtlasConfig = {
    rootDir: tmpDir,
    port: 3001,
    host: "0.0.0.0",
    databaseUrl: `file:${dbPath}`,
    databasePath: dbPath,
    workspaceId: process.env.ATLAS_WORKSPACE_ID?.trim() || "default",
    backboardApiKey: process.env.BACKBOARD_API_KEY?.trim(),
    backboardApiBase:
      process.env.BACKBOARD_API_BASE?.trim() ||
      process.env.BACKBOARD_BASE_URL?.trim() ||
      "https://app.backboard.io/api",
    backboardAssistantId: process.env.BACKBOARD_ASSISTANT_ID?.trim(),
    backboardMemoryMode:
      process.env.BACKBOARD_MEMORY_MODE?.trim() ||
      process.env.BACKBOARD_MEMORY?.trim() ||
      "Auto",
    backboardModel: process.env.BACKBOARD_MODEL?.trim(),
    scanMaxFiles: readInt("SCAN_MAX_FILES", 1200),
    scanMaxFileBytes: readInt("SCAN_MAX_FILE_BYTES", 225_280),
    scanMaxPromptChars: readInt("SCAN_MAX_PROMPT_CHARS", 42_000),
    // Keep well under Vercel's 60 s Pro / 300 s max-duration limit.
    scanTimeoutSeconds: readInt("ATLAS_SCAN_TIMEOUT_SECONDS", 55),
    reposDir: path.join(tmpDir, "atlas-repos"),
    githubAllowedOrgs: process.env.GITHUB_ALLOWED_ORGS
      ? process.env.GITHUB_ALLOWED_ORGS.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    corsOrigin: process.env.CORS_ORIGIN?.trim() || "*",
    apiAuthToken: process.env.ATLAS_API_AUTH_TOKEN?.trim(),
    synchronousScan: true,
  };

  const db = openDatabase(dbPath);
  migrate(db);
  const repository = new AtlasRepository(db);
  repository.ensureWorkspace(config.workspaceId);

  _app = await buildApp({ config, repository });
  await _app.ready();
  return _app;
}

export default async function handler(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const app = await getApp();
  app.server.emit("request", req, res);
}
