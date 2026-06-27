import path from "node:path";
import type {
  BackboardSynthesis,
  EdgeKind,
  Evidence,
  Finding,
  GraphData,
  GraphLink,
  GraphNode,
  RepositoryRecord,
  ScanArtifacts,
} from "../types/domain.js";
import { stableId } from "../util/ids.js";
import { packageFromImport } from "../scanner/scanner.js";
import { serviceNameFromConfigPath } from "../scanner/service-config.js";
import { scopedRepositoryLabel, scopedRepositoryPath, scopedRepositoryUrl } from "../scanner/scope.js";

function evidenceFromFinding(finding: Finding): Evidence {
  return {
    id: finding.id,
    filePath: finding.filePath,
    lineStart: finding.lineStart,
    lineEnd: finding.lineEnd,
    snippet: finding.snippet,
    detector: finding.detector,
    confidenceReason: finding.confidenceReason,
  };
}

function firstEvidence(findings: Finding[], kind: Finding["kind"], label?: string): Evidence[] {
  return findings
    .filter((finding) => finding.kind === kind && (!label || finding.label === label || finding.value === label))
    .slice(0, 6)
    .map(evidenceFromFinding);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function moduleNameForFile(filePath: string): string {
  const serviceMatch = filePath.replace(/\\/g, "/").match(/\/([^/]+-service)\//);
  if (serviceMatch) return serviceMatch[1];
  const parts = filePath.split("/");
  if (parts[0] === "src" && parts[1]) return parts[1].replace(/\.[^.]+$/, "");
  if (["app", "pages", "server", "api", "routes", "lib"].includes(parts[0]) && parts[1]) {
    return parts[0] === "lib" ? parts[1].replace(/\.[^.]+$/, "") : parts[0];
  }
  if (parts.length > 1) return parts[0];
  return path.basename(filePath).replace(/\.[^.]+$/, "");
}

function microserviceNodeId(repositoryId: string, serviceName: string): string {
  return stableId("repo", repositoryId, "microservice", serviceName);
}

function topicNodeId(repositoryId: string, topic: string): string {
  return stableId("repo", repositoryId, "topic", topic);
}

function datastoreNodeId(repositoryId: string, storeLabel: string): string {
  return stableId("repo", repositoryId, "datastore", storeLabel);
}

function serviceConfigPath(serviceName: string, findings: Finding[]): string | undefined {
  const declaration = findings.find(
    (finding) => finding.detector === "service-config-declaration" && finding.label === serviceName,
  );
  if (!declaration) return undefined;
  return declaration.filePath.replace(/\/service\.config\.json$/, "");
}

function addServiceMeshFromConfig(args: {
  repository: RepositoryRecord;
  artifacts: ScanArtifacts;
  repoNodeId: string;
  nodes: Map<string, GraphNode>;
  links: Map<string, GraphLink>;
}): boolean {
  const { repository, artifacts, repoNodeId, nodes, links } = args;
  const declarations = artifacts.findings.filter((finding) => finding.detector === "service-config-declaration");
  if (declarations.length === 0) return false;

  for (const declaration of declarations) {
    const serviceName = declaration.label;
    const [domain = "Service", endpoint = "", port = ""] = declaration.value.split("|");
    const servicePath = serviceConfigPath(serviceName, artifacts.findings) ?? serviceName;
    const nodeId = microserviceNodeId(repository.id, serviceName);
    const evidence = [evidenceFromFinding(declaration)];

    addNode(nodes, {
      id: nodeId,
      label: serviceName,
      kind: "service",
      domain,
      whatItIs: endpoint
        ? `Runnable microservice exposing ${endpoint}${port ? ` on port ${port}` : ""}.`
        : `Runnable microservice declared in service.config.json.`,
      whyItExists: "Part of the scanned service catalog with declared downstream dependencies and event flows.",
      owns: unique([
        ...(endpoint ? [endpoint] : []),
        ...(port ? [`port ${port}`] : []),
      ]),
      confidence: "confirmed",
      risks: [],
      path: servicePath,
      repositoryId: repository.id,
      evidence,
    });

    addLink(links, {
      id: stableId(repository.id, "repo-service", serviceName),
      source: repoNodeId,
      target: nodeId,
      kind: "config",
      criticality: 2,
      summary: `${declaration.label} is a declared microservice in this scan scope.`,
      code: declaration.snippet,
      codePath: `${declaration.filePath}:L${declaration.lineStart}`,
      contract: `service.config.json declaration: ${serviceName}`,
      failure: "Service startup depends on declared downstream dependencies and broker connectivity.",
      risks: [],
      confidence: "confirmed",
      repositoryId: repository.id,
      evidence,
    });
  }

  for (const finding of artifacts.findings.filter((item) => item.detector === "service-config-dependency")) {
    const sourceName = serviceNameFromConfigPath(finding.filePath);
    if (!sourceName) continue;
    const sourceId = microserviceNodeId(repository.id, sourceName);
    const targetId = microserviceNodeId(repository.id, finding.label);
    if (!nodes.has(sourceId)) continue;

    if (!nodes.has(targetId)) {
      addNode(nodes, {
        id: targetId,
        label: finding.label,
        kind: "service",
        domain: "Service",
        whatItIs: `Downstream service referenced by ${sourceName}.`,
        whyItExists: "Declared as an HTTP dependency in service.config.json.",
        owns: [],
        confidence: "confirmed",
        risks: [],
        path: finding.label,
        repositoryId: repository.id,
        evidence: [evidenceFromFinding(finding)],
      });
    }

    addLink(links, {
      id: stableId(repository.id, "service-call", sourceName, finding.label),
      source: sourceId,
      target: targetId,
      kind: "sync",
      criticality: 3,
      summary: `${sourceName} calls ${finding.label} over HTTP.`,
      code: finding.snippet,
      codePath: `${finding.filePath}:L${finding.lineStart}`,
      contract: `HTTP dependency: ${finding.value}`,
      failure: "Downstream service outage or contract drift breaks this call path.",
      risks: [],
      confidence: "confirmed",
      repositoryId: repository.id,
      evidence: [evidenceFromFinding(finding)],
    });
  }

  for (const finding of artifacts.findings.filter((item) => item.detector.startsWith("service-config-topic-"))) {
    const sourceName = serviceNameFromConfigPath(finding.filePath);
    if (!sourceName) continue;
    const sourceId = microserviceNodeId(repository.id, sourceName);
    if (!nodes.has(sourceId)) continue;
    const topicId = topicNodeId(repository.id, finding.label);
    const produced = finding.value === "produced";

    if (!nodes.has(topicId)) {
      addNode(nodes, {
        id: topicId,
        label: finding.label,
        kind: "queue",
        domain: "Messaging",
        whatItIs: `Event topic ${finding.label}.`,
        whyItExists: "Declared in service.config.json as part of the async event topology.",
        owns: [],
        confidence: "confirmed",
        risks: [],
        repositoryId: repository.id,
        evidence: [evidenceFromFinding(finding)],
      });
    }

    addLink(links, {
      id: stableId(repository.id, "service-topic", sourceName, finding.label, finding.value),
      source: produced ? sourceId : topicId,
      target: produced ? topicId : sourceId,
      kind: "async",
      criticality: 2,
      summary: produced
        ? `${sourceName} publishes events to ${finding.label}.`
        : `${sourceName} consumes events from ${finding.label}.`,
      code: finding.snippet,
      codePath: `${finding.filePath}:L${finding.lineStart}`,
      contract: `Event topic ${finding.value}: ${finding.label}`,
      failure: "Broker lag, schema drift, or missing consumers can break async workflows.",
      risks: [],
      confidence: "confirmed",
      repositoryId: repository.id,
      evidence: [evidenceFromFinding(finding)],
    });
  }

  for (const finding of artifacts.findings.filter((item) => item.detector === "service-config-datastore")) {
    const sourceName = serviceNameFromConfigPath(finding.filePath);
    if (!sourceName) continue;
    const sourceId = microserviceNodeId(repository.id, sourceName);
    if (!nodes.has(sourceId)) continue;
    const storeId = datastoreNodeId(repository.id, finding.label);
    const kind: GraphNode["kind"] = /kafka|queue|topic|sqs|pubsub|rabbit/i.test(finding.value) ? "queue" : "database";

    if (!nodes.has(storeId)) {
      addNode(nodes, {
        id: storeId,
        label: finding.label,
        kind,
        domain: kind === "queue" ? "Messaging" : "Data",
        whatItIs: `Data store or broker connection (${finding.value}).`,
        whyItExists: "Declared in service.config.json for durable state or async messaging.",
        owns: [],
        confidence: "confirmed",
        risks: [],
        repositoryId: repository.id,
        evidence: [evidenceFromFinding(finding)],
      });
    }

    addLink(links, {
      id: stableId(repository.id, "service-datastore", sourceName, finding.label),
      source: sourceId,
      target: storeId,
      kind: kind === "queue" ? "async" : "db",
      criticality: 3,
      summary: `${sourceName} connects to ${finding.label}.`,
      code: finding.snippet,
      codePath: `${finding.filePath}:L${finding.lineStart}`,
      contract: `Data store: ${finding.value}`,
      failure: "Store or broker outage breaks reads, writes, or event delivery for this service.",
      risks: [],
      confidence: "confirmed",
      repositoryId: repository.id,
      evidence: [evidenceFromFinding(finding)],
    });
  }

  return true;
}

function moduleNameForRelativeImport(sourceFilePath: string, importValue: string): string | null {
  if (!importValue.startsWith(".")) return null;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(sourceFilePath), importValue));
  return moduleNameForFile(resolved);
}

function packageNameEvidence(findings: Finding[], packageName?: string): Evidence[] {
  if (!packageName) return [];
  return findings
    .filter((finding) => finding.detector === "package-json-name" && finding.value === packageName)
    .slice(0, 3)
    .map(evidenceFromFinding);
}

function moduleNodeId(repositoryId: string, moduleName: string): string {
  return stableId("repo", repositoryId, "module", moduleName);
}

function externalNodeId(repositoryId: string, packageName: string): string {
  return stableId("repo", repositoryId, "package", packageName);
}

function detectorEvidence(findings: Finding[], detector: string): Evidence[] {
  return findings
    .filter((finding) => finding.detector === detector)
    .slice(0, 8)
    .map(evidenceFromFinding);
}

function confidenceForEvidence(evidence: Evidence[]): "confirmed" | "inferred" | "uncertain" {
  if (evidence.some((item) => item.detector.includes("package") || item.detector.includes("import"))) {
    return "confirmed";
  }
  return evidence.length > 0 ? "inferred" : "uncertain";
}

function addNode(nodes: Map<string, GraphNode>, node: GraphNode): void {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, node);
    return;
  }
  existing.evidence = unique([...(existing.evidence ?? []), ...(node.evidence ?? [])]);
  existing.owns = unique([...existing.owns, ...node.owns]);
  existing.risks = unique([...existing.risks, ...node.risks]);
}

function addLink(links: Map<string, GraphLink>, link: GraphLink): void {
  const existing = links.get(link.id);
  if (!existing) {
    links.set(link.id, link);
    return;
  }
  existing.evidence = unique([...(existing.evidence ?? []), ...(link.evidence ?? [])]).slice(0, 10);
  existing.risks = unique([...existing.risks, ...link.risks]);
}

function edgeKindForPackage(packageName: string, artifacts: ScanArtifacts): EdgeKind {
  void packageName;
  void artifacts;
  return "package";
}

function nodeKindForPackage(packageName: string): GraphNode["kind"] {
  const lower = packageName.toLowerCase();
  if (/(prisma|pg|mysql|sqlite|drizzle|typeorm|mongoose|sequelize)/.test(lower)) return "database";
  if (/(kafka|amqp|rabbit|sqs|pubsub|bull)/.test(lower)) return "queue";
  if (/(auth|jwt|oauth|openid|passport)/.test(lower)) return "auth";
  return "external";
}

function humanPackageSummary(packageName: string): string {
  if (nodeKindForPackage(packageName) === "database") return `${packageName} database or ORM dependency detected from code/package metadata.`;
  if (nodeKindForPackage(packageName) === "queue") return `${packageName} queue, worker, or stream dependency detected from code/package metadata.`;
  if (nodeKindForPackage(packageName) === "auth") return `${packageName} authentication or identity dependency detected from code/package metadata.`;
  return `${packageName} package dependency or imported external module.`;
}

export function buildGraphFromArtifacts(args: {
  repository: RepositoryRecord;
  commitSha: string;
  artifacts: ScanArtifacts;
  backboard?: BackboardSynthesis | null;
}): GraphData {
  const { repository, artifacts } = args;
  const nodes = new Map<string, GraphNode>();
  const links = new Map<string, GraphLink>();

  const repoNodeId = stableId("repo", repository.id, "root");
  const repoDocs = firstEvidence(artifacts.findings, "doc");
  const packageEvidence = firstEvidence(artifacts.findings, "config", "package.json");
  const directPackageNameEvidence = packageNameEvidence(artifacts.findings, artifacts.package.name);
  const scopedLabel = scopedRepositoryLabel(repository, artifacts.scanScope);
  const scopedPath = scopedRepositoryPath(artifacts.scanScope);
  const scopedUrl = scopedRepositoryUrl(repository, artifacts.scanScope);
  const repoPurpose = artifacts.scanScope?.treePath
    ? `${scopedLabel} is the scanned GitHub tree path inside ${repository.owner}/${repository.name}.`
    : artifacts.package.name
      ? `${repository.owner}/${repository.name} appears to publish or run ${artifacts.package.name}.`
      : `${repository.owner}/${repository.name} repository root.`;

  addNode(nodes, {
    id: repoNodeId,
    label: scopedLabel,
    kind: "service",
    domain: artifacts.scanScope?.treePath ? "Scoped Repository" : "Repository",
    whatItIs: repoPurpose,
    whyItExists: artifacts.scanScope?.treePath
      ? `Scoped scan rooted at ${artifacts.scanScope.treePath} from ${scopedUrl}.`
      : "Repository root for the scanned codebase.",
    owns: [artifacts.package.name ?? (artifacts.scanScope?.treePath ?? repository.name)],
    confidence: repoDocs.length > 0 || packageEvidence.length > 0 || directPackageNameEvidence.length > 0 ? "confirmed" : "inferred",
    risks: [],
    path: scopedPath,
    repositoryId: repository.id,
    evidence: [...directPackageNameEvidence, ...repoDocs.slice(0, 3), ...packageEvidence.slice(0, 2)],
  });

  const hasServiceMesh = addServiceMeshFromConfig({
    repository,
    artifacts,
    repoNodeId,
    nodes,
    links,
  });

  const sourceFindings = artifacts.findings.filter((finding) =>
    ["import", "http", "env", "api-route", "database", "queue"].includes(finding.kind),
  );
  const modules = new Map<string, Finding[]>();
  if (!hasServiceMesh) {
    for (const finding of sourceFindings) {
      const moduleName = moduleNameForFile(finding.filePath);
      modules.set(moduleName, [...(modules.get(moduleName) ?? []), finding]);
    }
  }

  for (const [moduleName, findings] of modules) {
    const nodeId = moduleNodeId(repository.id, moduleName);
    const apiRoutes = findings.filter((finding) => finding.kind === "api-route").length;
    const httpCalls = findings.filter((finding) => finding.kind === "http").length;
    const dbCalls = findings.filter((finding) => finding.kind === "database").length;
    const queueCalls = findings.filter((finding) => finding.kind === "queue").length;
    const envRefs = findings.filter((finding) => finding.kind === "env").map((finding) => finding.label);

    addNode(nodes, {
      id: nodeId,
      label: moduleName,
      kind: "service",
      domain: apiRoutes > 0 ? "API" : "Code",
      whatItIs: `Source module inferred from files under ${moduleName}.`,
      whyItExists:
        apiRoutes > 0
          ? "Contains route handlers or API endpoint declarations."
          : "Groups related source files and imports inside the repository.",
      owns: unique([
        ...(apiRoutes > 0 ? [`${apiRoutes} route clue${apiRoutes === 1 ? "" : "s"}`] : []),
        ...(httpCalls > 0 ? [`${httpCalls} HTTP client clue${httpCalls === 1 ? "" : "s"}`] : []),
        ...(dbCalls > 0 ? [`${dbCalls} database clue${dbCalls === 1 ? "" : "s"}`] : []),
        ...(queueCalls > 0 ? [`${queueCalls} queue/event clue${queueCalls === 1 ? "" : "s"}`] : []),
        ...envRefs.slice(0, 6),
      ]),
      confidence: confidenceForEvidence(findings.map(evidenceFromFinding)),
      risks: [],
      path: moduleName,
      repositoryId: repository.id,
      evidence: findings.slice(0, 8).map(evidenceFromFinding),
    });

    addLink(links, {
      id: stableId(repository.id, "root-module", moduleName),
      source: repoNodeId,
      target: nodeId,
      kind: "config",
      criticality: 1,
      summary: `${repository.name} contains the ${moduleName} source area.`,
      code: findings[0]?.snippet ?? moduleName,
      codePath: `${findings[0]?.filePath ?? moduleName}:L${findings[0]?.lineStart ?? 1}`,
      contract: "Repository source ownership edge.",
      failure: "No runtime failure behavior inferred for source ownership.",
      risks: [],
      confidence: "confirmed",
      repositoryId: repository.id,
      evidence: findings.slice(0, 3).map(evidenceFromFinding),
    });
  }

  const dependencies = {
    ...artifacts.package.dependencies,
    ...artifacts.package.devDependencies,
  };

  for (const packageName of Object.keys(dependencies)) {
    const evidence = firstEvidence(artifacts.findings, "package", packageName);
    const nodeId = externalNodeId(repository.id, packageName);
    addNode(nodes, {
      id: nodeId,
      label: packageName,
      kind: nodeKindForPackage(packageName),
      domain: nodeKindForPackage(packageName) === "external" ? "Dependency" : "Infrastructure",
      whatItIs: humanPackageSummary(packageName),
      whyItExists: "Declared in package.json and available to this repository.",
      owns: [],
      confidence: "confirmed",
      risks: [],
      repositoryId: repository.id,
      evidence,
    });

    addLink(links, {
      id: stableId(repository.id, "depends-on", packageName),
      source: repoNodeId,
      target: nodeId,
      kind: edgeKindForPackage(packageName, artifacts),
      criticality: Object.prototype.hasOwnProperty.call(artifacts.package.dependencies, packageName) ? 3 : 1,
      summary: `${repository.name} declares ${packageName} as a ${Object.prototype.hasOwnProperty.call(artifacts.package.dependencies, packageName) ? "runtime" : "development"} dependency.`,
      code: evidence[0]?.snippet ?? `"${packageName}": "${dependencies[packageName]}"`,
      codePath: `${evidence[0]?.filePath ?? "package.json"}:L${evidence[0]?.lineStart ?? 1}`,
      contract: `package.json dependency ${packageName}@${dependencies[packageName]}`,
      failure: "Install/build/runtime behavior depends on package availability and version compatibility.",
      risks: [],
      confidence: "confirmed",
      repositoryId: repository.id,
      evidence,
    });
  }

  const importFindings = hasServiceMesh
    ? []
    : artifacts.findings.filter((finding) => finding.kind === "import");
  for (const finding of importFindings) {
    const sourceModule = moduleNodeId(repository.id, moduleNameForFile(finding.filePath));
    const relativeModuleName = moduleNameForRelativeImport(finding.filePath, finding.value);
    if (relativeModuleName) {
      const target = moduleNodeId(repository.id, relativeModuleName);
      if (nodes.has(sourceModule) && !nodes.has(target)) {
        addNode(nodes, {
          id: target,
          label: relativeModuleName,
          kind: "service",
          domain: "Code",
          whatItIs: `Local module referenced by relative import ${finding.value}.`,
          whyItExists: "Imported by another source module inside the repository.",
          owns: [],
          confidence: "confirmed",
          risks: [],
          path: relativeModuleName,
          repositoryId: repository.id,
          evidence: [evidenceFromFinding(finding)],
        });
      }
      if (nodes.has(sourceModule) && nodes.has(target) && sourceModule !== target) {
        addLink(links, {
          id: stableId(repository.id, "relative-import", sourceModule, target, finding.value),
          source: sourceModule,
          target,
          kind: "config",
          criticality: 2,
          summary: `${moduleNameForFile(finding.filePath)} imports local module ${relativeModuleName}.`,
          code: finding.snippet,
          codePath: `${finding.filePath}:L${finding.lineStart}`,
          contract: `Relative import path: ${finding.value}`,
          failure: "Internal import resolution failure breaks build or runtime startup.",
          risks: [],
          confidence: "confirmed",
          repositoryId: repository.id,
          evidence: [evidenceFromFinding(finding)],
        });
      }
      continue;
    }
    const packageName = packageFromImport(finding.value);
    if (!packageName) continue;
    const target = externalNodeId(repository.id, packageName);
    const evidence = [evidenceFromFinding(finding)];
    if (!nodes.has(target)) {
      addNode(nodes, {
        id: target,
        label: packageName,
        kind: nodeKindForPackage(packageName),
        domain: "Imported package",
        whatItIs: humanPackageSummary(packageName),
        whyItExists: "Imported by repository source.",
        owns: [],
        confidence: "confirmed",
        risks: [],
        repositoryId: repository.id,
        evidence,
      });
    }
    addLink(links, {
      id: stableId(repository.id, "imports", sourceModule, packageName),
      source: sourceModule,
      target,
      kind: edgeKindForPackage(packageName, artifacts),
      criticality: 2,
      summary: `${moduleNameForFile(finding.filePath)} imports ${packageName}.`,
      code: finding.snippet,
      codePath: `${finding.filePath}:L${finding.lineStart}`,
      contract: `Import path: ${finding.value}`,
      failure: "Import resolution failure breaks build or runtime startup.",
      risks: [],
      confidence: "confirmed",
      repositoryId: repository.id,
      evidence,
    });
  }

  // Service-to-service edges: literal HTTP service URLs found in source turn
  // into external "service" nodes with an inbound call edge from the module.
  const serviceFindings = hasServiceMesh
    ? []
    : artifacts.findings.filter(
        (finding) => finding.kind === "http" && finding.detector === "service-url-reference",
      );
  for (const finding of serviceFindings) {
    const host = finding.label;
    const sourceModule = moduleNodeId(repository.id, moduleNameForFile(finding.filePath));
    if (!nodes.has(sourceModule)) continue;
    const serviceNodeId = stableId(repository.id, "service", host);
    const evidence = [evidenceFromFinding(finding)];
    if (!nodes.has(serviceNodeId)) {
      addNode(nodes, {
        id: serviceNodeId,
        label: host,
        kind: "external",
        domain: "Service",
        whatItIs: `HTTP service referenced at ${finding.value}.`,
        whyItExists: "Called as a network service endpoint from repository source.",
        owns: [],
        confidence: "inferred",
        risks: [],
        repositoryId: repository.id,
        evidence,
      });
    }
    addLink(links, {
      id: stableId(repository.id, "calls-service", sourceModule, host),
      source: sourceModule,
      target: serviceNodeId,
      kind: "sync",
      criticality: 3,
      summary: `${moduleNameForFile(finding.filePath)} calls the ${host} service over HTTP.`,
      code: finding.snippet,
      codePath: `${finding.filePath}:L${finding.lineStart}`,
      contract: `HTTP endpoint: ${finding.value}`,
      failure: "Network failure or service downtime breaks this call path; verify timeouts, retries, and fallbacks.",
      risks: [],
      confidence: "inferred",
      repositoryId: repository.id,
      evidence,
    });
  }

  const envFindings = artifacts.findings.filter((finding) => finding.kind === "env");
  if (envFindings.length > 0) {
    const nodeId = stableId(repository.id, "env-config");
    const envNames = unique(envFindings.map((finding) => finding.label)).slice(0, 30);
    addNode(nodes, {
      id: nodeId,
      label: "env-config",
      kind: "config",
      domain: "Configuration",
      whatItIs: "Environment variables referenced by source code.",
      whyItExists: "Separates deploy-time secrets and configuration from source.",
      owns: envNames,
      confidence: "confirmed",
      risks: envNames.some((name) => /key|token|secret|password/i.test(name))
        ? ["Sensitive env names are referenced; values were not read or uploaded."]
        : [],
      repositoryId: repository.id,
      evidence: envFindings.slice(0, 10).map(evidenceFromFinding),
    });

    for (const finding of envFindings) {
      const sourceModule = moduleNodeId(repository.id, moduleNameForFile(finding.filePath));
      addLink(links, {
        id: stableId(repository.id, "env", sourceModule, finding.label),
        source: sourceModule,
        target: nodeId,
        kind: "config",
        criticality: /database|url|key|token|secret|password/i.test(finding.label) ? 3 : 1,
        summary: `${moduleNameForFile(finding.filePath)} reads process.env.${finding.label}.`,
        code: finding.snippet,
        codePath: `${finding.filePath}:L${finding.lineStart}`,
        contract: `Environment variable: ${finding.label}`,
        failure: "Missing env value may fail startup or runtime path depending on code guards.",
        risks: /key|token|secret|password/i.test(finding.label)
          ? ["Likely secret-bearing environment variable; snippet has been redacted."]
          : [],
        confidence: "confirmed",
        repositoryId: repository.id,
        evidence: [evidenceFromFinding(finding)],
      });
    }
  }

  for (const detector of ["database-code-clue", "database-package", "prisma-schema", "sql-file"]) {
    const evidence = detectorEvidence(artifacts.findings, detector);
    if (evidence.length === 0) continue;
    const nodeId = stableId(repository.id, "database");
    addNode(nodes, {
      id: nodeId,
      label: detector === "database-package" ? "database-client" : "database",
      kind: "database",
      domain: "Data",
      whatItIs: "Database usage inferred from deterministic code and package clues.",
      whyItExists: "Repository appears to read/write durable state.",
      owns: [],
      confidence: confidenceForEvidence(evidence),
      risks: [],
      repositoryId: repository.id,
      evidence,
    });
  }

  for (const detector of ["queue-event-code-clue", "queue-package"]) {
    const evidence = detectorEvidence(artifacts.findings, detector);
    if (evidence.length === 0) continue;
    const nodeId = stableId(repository.id, "queue-eventing");
    addNode(nodes, {
      id: nodeId,
      label: "queue-eventing",
      kind: "queue",
      domain: "Messaging",
      whatItIs: "Queue or event-stream usage inferred from deterministic code and package clues.",
      whyItExists: "Repository appears to publish, consume, or enqueue asynchronous work.",
      owns: [],
      confidence: confidenceForEvidence(evidence),
      risks: [],
      repositoryId: repository.id,
      evidence,
    });
  }

  return {
    nodes: Array.from(nodes.values()),
    links: Array.from(links.values()).filter((link) => nodes.has(link.source) && nodes.has(link.target)),
  };
}
