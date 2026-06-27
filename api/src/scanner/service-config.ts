import { stableId } from "../util/ids.js";
import type { Evidence, Finding } from "../types/domain.js";

export const SERVICE_CONFIG_FILE = "service.config.json";

interface ServiceConfigDependency {
  name?: string;
  url?: string;
  env?: string;
}

interface ServiceConfigShape {
  name?: string;
  title?: string;
  domain?: string;
  port?: number;
  endpoint?: string;
  dependencies?: ServiceConfigDependency[];
  topicsProduced?: string[];
  topicsConsumed?: string[];
  dataStores?: string[];
}

function evidenceFromConfig(args: {
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
    snippet: args.line.trim().slice(0, 700),
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
  return {
    id: stableId(kind, label, value, evidence.filePath, evidence.lineStart),
    kind,
    label,
    value,
    ...evidence,
  };
}

export function serviceNameFromConfigPath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const match = normalized.match(/\/([^/]+)\/service\.config\.json$/);
  return match?.[1] ?? null;
}

export function parseServiceConfig(relativePath: string, text: string): Finding[] {
  if (!relativePath.endsWith(SERVICE_CONFIG_FILE)) return [];

  const findings: Finding[] = [];
  let parsed: ServiceConfigShape;
  try {
    parsed = JSON.parse(text) as ServiceConfigShape;
  } catch {
    return findings;
  }

  const serviceName = parsed.name ?? serviceNameFromConfigPath(relativePath);
  if (!serviceName) return findings;

  const declaration = evidenceFromConfig({
    filePath: relativePath,
    line: `"name": "${serviceName}"`,
    lineNumber: 1,
    detector: "service-config-declaration",
    confidenceReason: "Runnable microservice declared in service.config.json.",
  });
  findings.push(
    findingFromEvidence(
      "config",
      serviceName,
      [parsed.domain ?? "Service", parsed.endpoint ?? "", String(parsed.port ?? "")].filter(Boolean).join("|"),
      declaration,
    ),
  );

  for (const dep of parsed.dependencies ?? []) {
    if (!dep.name) continue;
    const ev = evidenceFromConfig({
      filePath: relativePath,
      line: `"name": "${dep.name}", "url": "${dep.url ?? ""}"`,
      lineNumber: 1,
      detector: "service-config-dependency",
      confidenceReason: "Downstream HTTP service dependency declared in service.config.json.",
    });
    findings.push(findingFromEvidence("http", dep.name, dep.url ?? dep.env ?? dep.name, ev));
  }

  for (const topic of parsed.topicsProduced ?? []) {
    const ev = evidenceFromConfig({
      filePath: relativePath,
      line: `"topicsProduced": ["${topic}"]`,
      lineNumber: 1,
      detector: "service-config-topic-produced",
      confidenceReason: "Kafka/event topic produced by this service.",
    });
    findings.push(findingFromEvidence("queue", topic, "produced", ev));
  }

  for (const topic of parsed.topicsConsumed ?? []) {
    const ev = evidenceFromConfig({
      filePath: relativePath,
      line: `"topicsConsumed": ["${topic}"]`,
      lineNumber: 1,
      detector: "service-config-topic-consumed",
      confidenceReason: "Kafka/event topic consumed by this service.",
    });
    findings.push(findingFromEvidence("queue", topic, "consumed", ev));
  }

  for (const store of parsed.dataStores ?? []) {
    const ev = evidenceFromConfig({
      filePath: relativePath,
      line: `"dataStores": ["${store}"]`,
      lineNumber: 1,
      detector: "service-config-datastore",
      confidenceReason: "Data store or broker connection declared for this service.",
    });
    const label = store.includes("://") ? store.split("://")[1]?.split(/[/:]/)[0] ?? store : store;
    findings.push(findingFromEvidence("database", label, store, ev));
  }

  return findings;
}
