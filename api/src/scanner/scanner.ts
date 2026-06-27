import fs from "node:fs/promises";
import path from "node:path";
import { stableId } from "../util/ids.js";
import { redactSecrets } from "../util/redact.js";
import type { Evidence, FileInventory, Finding, PackageInventory, ScanArtifacts } from "../types/domain.js";

const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "vendor",
  ".cache",
  ".parcel-cache",
]);

const SECRET_FILE_NAMES = new Set([
  ".env",
  "id_rsa",
  "id_ed25519",
]);

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const CONFIG_FILE_RE = /(^|\/)(package\.json|tsconfig[^/]*\.json|next\.config\.[jt]s|vite\.config\.[jt]s|webpack\.config\.[jt]s|drizzle\.config\.[jt]s|prisma\/schema\.prisma)$/;
const DOC_FILE_RE = /(^|\/)(readme|architecture|docs?)[^/]*\.md$/i;
const SQL_FILE_RE = /\.sql$/i;

const DB_PACKAGES = new Set([
  "@prisma/client",
  "prisma",
  "pg",
  "mysql",
  "mysql2",
  "sqlite",
  "sqlite3",
  "better-sqlite3",
  "drizzle-orm",
  "typeorm",
  "sequelize",
  "mongoose",
]);

const QUEUE_PACKAGES = new Set([
  "kafkajs",
  "amqplib",
  "bullmq",
  "bull",
  "bee-queue",
  "@aws-sdk/client-sqs",
  "@google-cloud/pubsub",
]);

export interface ScannerOptions {
  maxFiles: number;
  maxFileBytes: number;
}

interface ReadFileCandidate extends FileInventory {
  absolutePath: string;
}

function languageFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") return "typescript";
  if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") return "javascript";
  if (ext === ".json") return "json";
  if (ext === ".md") return "markdown";
  if (ext === ".sql") return "sql";
  if (ext === ".prisma") return "prisma";
  return ext.slice(1) || "text";
}

function shouldIgnore(relativePath: string): boolean {
  const parts = relativePath.split(path.sep);
  if (parts.some((part) => IGNORED_DIRS.has(part))) return true;
  const base = path.basename(relativePath);
  if (SECRET_FILE_NAMES.has(base.toLowerCase())) return true;
  if (base.toLowerCase().startsWith(".env.") && base !== ".env.example") return true;
  if (/secret|credentials/i.test(base)) return true;
  if (base.endsWith(".pem") || base.endsWith(".key") || base.endsWith(".p12")) return true;
  return false;
}

function isReadableTarget(relativePath: string): boolean {
  const ext = path.extname(relativePath).toLowerCase();
  return (
    SOURCE_EXTENSIONS.has(ext) ||
    CONFIG_FILE_RE.test(relativePath) ||
    DOC_FILE_RE.test(relativePath) ||
    SQL_FILE_RE.test(relativePath) ||
    relativePath.endsWith("schema.prisma")
  );
}

async function walkRepo(root: string, options: ScannerOptions): Promise<{
  candidates: ReadFileCandidate[];
  ignoredFiles: number;
  totalFilesSeen: number;
}> {
  const candidates: ReadFileCandidate[] = [];
  let ignoredFiles = 0;
  let totalFilesSeen = 0;

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(root, absolutePath);
      if (shouldIgnore(relativePath)) {
        ignoredFiles += 1;
        continue;
      }
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      totalFilesSeen += 1;
      if (!isReadableTarget(relativePath)) continue;
      const stat = await fs.stat(absolutePath);
      candidates.push({
        absolutePath,
        path: relativePath.split(path.sep).join("/"),
        bytes: stat.size,
        language: languageFor(relativePath),
      });
      if (candidates.length >= options.maxFiles) return;
    }
  }

  await walk(root);
  return { candidates, ignoredFiles, totalFilesSeen };
}

function evidenceFromLine(args: {
  filePath: string;
  line: string;
  lineNumber: number;
  detector: string;
  confidenceReason: string;
}): Evidence {
  return {
    filePath: args.filePath,
    lineStart: args.lineNumber,
    lineEnd: args.lineNumber,
    snippet: redactSecrets(args.line.trim()).slice(0, 700),
    detector: args.detector,
    confidenceReason: args.confidenceReason,
  };
}

function findingFromEvidence(
  kind: Finding["kind"],
  label: string,
  value: string,
  evidence: Evidence,
): Finding {
  const redactedValue = redactSecrets(value);
  return {
    id: stableId(kind, label, redactedValue, evidence.filePath, evidence.lineStart),
    kind,
    label,
    value: redactedValue,
    ...evidence,
  };
}

function parsePackageJson(relativePath: string, text: string): {
  pkg: PackageInventory;
  findings: Finding[];
  evidence: Evidence[];
} {
  const pkg: PackageInventory = {
    dependencies: {},
    devDependencies: {},
  };
  const findings: Finding[] = [];
  const evidence: Evidence[] = [];

  try {
    const parsed = JSON.parse(text) as {
      name?: string;
      version?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    pkg.name = parsed.name;
    pkg.version = parsed.version;
    pkg.dependencies = parsed.dependencies ?? {};
    pkg.devDependencies = parsed.devDependencies ?? {};

    const lines = text.split(/\r?\n/);
    if (pkg.name) {
      const lineIndex = lines.findIndex((line) => line.includes('"name"'));
      const ev = evidenceFromLine({
        filePath: relativePath,
        line: lineIndex >= 0 ? lines[lineIndex] : `"name": "${pkg.name}"`,
        lineNumber: lineIndex >= 0 ? lineIndex + 1 : 1,
        detector: "package-json-name",
        confidenceReason: "Package identity is declared in package.json.",
      });
      findings.push(findingFromEvidence("package", "package-name", pkg.name, ev));
      evidence.push(ev);
    }

    for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
      const lineIndex = lines.findIndex((line) => line.includes(`"${name}"`));
      const ev = evidenceFromLine({
        filePath: relativePath,
        line: lineIndex >= 0 ? lines[lineIndex] : `"${name}": "${version}"`,
        lineNumber: lineIndex >= 0 ? lineIndex + 1 : 1,
        detector: "package-json-dependency",
        confidenceReason: "Dependency is declared in package.json.",
      });
      findings.push(findingFromEvidence("package", name, version, ev));
      evidence.push(ev);
    }
  } catch {
    // Invalid package.json still appears as a config clue below.
  }

  return { pkg, findings, evidence };
}

function extractImportValues(line: string): string[] {
  const values: string[] = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[\w*{}\s,]+?\s+from\s+)?["']([^"']+)["']/g,
    /\brequire\(["']([^"']+)["']\)/g,
    /\bimport\(["']([^"']+)["']\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) {
      if (match[1]) values.push(match[1]);
    }
  }
  return values;
}

function externalPackageName(importValue: string): string | null {
  if (importValue.startsWith(".") || importValue.startsWith("/") || importValue.startsWith("#")) {
    return null;
  }
  const parts = importValue.split("/");
  if (importValue.startsWith("@")) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

function scanTextFile(relativePath: string, text: string): {
  findings: Finding[];
  snippets: Evidence[];
} {
  const findings: Finding[] = [];
  const snippets: Evidence[] = [];
  const lines = text.split(/\r?\n/);
  const ext = path.extname(relativePath).toLowerCase();

  if (CONFIG_FILE_RE.test(relativePath)) {
    const ev = evidenceFromLine({
      filePath: relativePath,
      line: lines[0] ?? relativePath,
      lineNumber: 1,
      detector: "config-file",
      confidenceReason: "Known configuration file path.",
    });
    findings.push(findingFromEvidence("config", path.basename(relativePath), relativePath, ev));
    snippets.push(ev);
  }

  if (DOC_FILE_RE.test(relativePath)) {
    const headingLine = lines.findIndex((line) => line.trim().startsWith("#"));
    const ev = evidenceFromLine({
      filePath: relativePath,
      line: headingLine >= 0 ? lines[headingLine] : lines[0] ?? relativePath,
      lineNumber: headingLine >= 0 ? headingLine + 1 : 1,
      detector: "docs-supporting-evidence",
      confidenceReason: "README or docs can support purpose, but does not create hard graph edges.",
    });
    findings.push(findingFromEvidence("doc", path.basename(relativePath), relativePath, ev));
    snippets.push(ev);
  }

  if (SQL_FILE_RE.test(relativePath)) {
    const ev = evidenceFromLine({
      filePath: relativePath,
      line: lines.find((line) => line.trim()) ?? relativePath,
      lineNumber: Math.max(1, lines.findIndex((line) => line.trim()) + 1),
      detector: "sql-file",
      confidenceReason: "SQL file indicates relational database usage.",
    });
    findings.push(findingFromEvidence("database", "sql", relativePath, ev));
    snippets.push(ev);
  }

  if (ext === ".prisma" || relativePath.endsWith("schema.prisma")) {
    const ev = evidenceFromLine({
      filePath: relativePath,
      line: lines.find((line) => /datasource|provider\s*=/.test(line)) ?? relativePath,
      lineNumber: Math.max(1, lines.findIndex((line) => /datasource|provider\s*=/.test(line)) + 1),
      detector: "prisma-schema",
      confidenceReason: "Prisma schema declares database access.",
    });
    findings.push(findingFromEvidence("database", "prisma", relativePath, ev));
    snippets.push(ev);
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    for (const importValue of extractImportValues(line)) {
      const ev = evidenceFromLine({
        filePath: relativePath,
        line,
        lineNumber,
        detector: importValue.startsWith(".") ? "relative-import" : "package-import",
        confidenceReason: "Import or require statement directly references another module/package.",
      });
      findings.push(findingFromEvidence("import", importValue, importValue, ev));
      snippets.push(ev);
    }

    for (const match of line.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)) {
      const ev = evidenceFromLine({
        filePath: relativePath,
        line,
        lineNumber,
        detector: "process-env-reference",
        confidenceReason: "Code directly reads an environment variable.",
      });
      findings.push(findingFromEvidence("env", match[1], match[1], ev));
      snippets.push(ev);
    }

    if (/\b(fetch|axios|got|request)\s*(?:\.|\()/.test(line) || /\baxios\.[a-z]+/.test(line)) {
      const ev = evidenceFromLine({
        filePath: relativePath,
        line,
        lineNumber,
        detector: "http-client-call",
        confidenceReason: "Known HTTP client call or helper appears in source.",
      });
      findings.push(findingFromEvidence("http", "http-client", line.trim(), ev));
      snippets.push(ev);
    }

    if (
      /\b(router|app|fastify)\.(get|post|put|patch|delete)\s*\(/.test(line) ||
      /\bexport\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/.test(line) ||
      /(^|\/)(api|routes)(\/|$)/.test(relativePath)
    ) {
      const ev = evidenceFromLine({
        filePath: relativePath,
        line,
        lineNumber,
        detector: "api-route-detector",
        confidenceReason: "Route-like source path or handler declaration.",
      });
      findings.push(findingFromEvidence("api-route", relativePath, relativePath, ev));
      snippets.push(ev);
    }

    if (/\b(prisma|pg|mysql|sqlite|drizzle|mongoose|sequelize|sql`|db\.query|pool\.query)\b/i.test(line)) {
      const ev = evidenceFromLine({
        filePath: relativePath,
        line,
        lineNumber,
        detector: "database-code-clue",
        confidenceReason: "Database client, query helper, or SQL template is referenced in source.",
      });
      findings.push(findingFromEvidence("database", "database", line.trim(), ev));
      snippets.push(ev);
    }

    if (/\b(kafka|rabbitmq|amqplib|sqs|pubsub|queue|topic|producer|consumer)\b/i.test(line)) {
      const ev = evidenceFromLine({
        filePath: relativePath,
        line,
        lineNumber,
        detector: "queue-event-code-clue",
        confidenceReason: "Queue, stream, producer, or consumer terminology is referenced in source.",
      });
      findings.push(findingFromEvidence("queue", "queue", line.trim(), ev));
      snippets.push(ev);
    }
  });

  return { findings, snippets };
}

export function packageFromImport(importValue: string): string | null {
  return externalPackageName(importValue);
}

export async function scanRepository(repoRoot: string, options: ScannerOptions): Promise<ScanArtifacts> {
  const { candidates, ignoredFiles, totalFilesSeen } = await walkRepo(repoRoot, options);
  const files: FileInventory[] = [];
  const findings: Finding[] = [];
  const selectedSnippets: Evidence[] = [];
  const packageInventory: PackageInventory = {
    dependencies: {},
    devDependencies: {},
  };
  const languageCounts: Record<string, number> = {};
  let oversizedFiles = 0;

  for (const candidate of candidates) {
    files.push({
      path: candidate.path,
      bytes: candidate.bytes,
      language: candidate.language,
    });
    languageCounts[candidate.language] = (languageCounts[candidate.language] ?? 0) + 1;

    if (candidate.bytes > options.maxFileBytes) {
      oversizedFiles += 1;
      continue;
    }

    const text = await fs.readFile(candidate.absolutePath, "utf8");
    if (candidate.path === "package.json") {
      const parsed = parsePackageJson(candidate.path, text);
      packageInventory.name = parsed.pkg.name;
      packageInventory.version = parsed.pkg.version;
      packageInventory.dependencies = parsed.pkg.dependencies;
      packageInventory.devDependencies = parsed.pkg.devDependencies;
      findings.push(...parsed.findings);
      selectedSnippets.push(...parsed.evidence.slice(0, 25));
    }

    const scanned = scanTextFile(candidate.path, text);
    findings.push(...scanned.findings);
    selectedSnippets.push(...scanned.snippets.slice(0, 120));
  }

  for (const pkgName of Object.keys({ ...packageInventory.dependencies, ...packageInventory.devDependencies })) {
    if (DB_PACKAGES.has(pkgName)) {
      const evidence = findings.find((finding) => finding.kind === "package" && finding.label === pkgName);
      if (evidence) {
        findings.push({
          ...evidence,
          id: stableId("database-package", pkgName, evidence.filePath),
          kind: "database",
          detector: "database-package",
          confidenceReason: `${pkgName} is a known database client or ORM package.`,
        });
      }
    }
    if (QUEUE_PACKAGES.has(pkgName)) {
      const evidence = findings.find((finding) => finding.kind === "package" && finding.label === pkgName);
      if (evidence) {
        findings.push({
          ...evidence,
          id: stableId("queue-package", pkgName, evidence.filePath),
          kind: "queue",
          detector: "queue-package",
          confidenceReason: `${pkgName} is a known queue or stream client package.`,
        });
      }
    }
  }

  return {
    repoRoot,
    package: packageInventory,
    files,
    findings,
    selectedSnippets: selectedSnippets.slice(0, 160),
    languageCounts,
    skipped: {
      oversizedFiles,
      ignoredFiles,
      totalFilesSeen,
    },
  };
}
