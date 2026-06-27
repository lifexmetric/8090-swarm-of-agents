export type Confidence = "confirmed" | "inferred" | "uncertain";

export type NodeKind =
  | "service"
  | "external"
  | "database"
  | "queue"
  | "auth"
  | "config";

export type EdgeKind =
  | "sync"
  | "async"
  | "db"
  | "config"
  | "auth"
  | "webhook";

export interface Evidence {
  id?: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  detector: string;
  confidenceReason: string;
}

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  domain: string;
  whatItIs: string;
  whyItExists: string;
  owns: string[];
  confidence: Confidence;
  risks: string[];
  path?: string;
  repositoryId?: string;
  scanId?: string;
  evidence?: Evidence[];
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  criticality: number;
  summary: string;
  code: string;
  codePath: string;
  contract: string;
  failure: string;
  risks: string[];
  confidence: Confidence;
  beforeYouChange?: string;
  repositoryId?: string;
  scanId?: string;
  evidence?: Evidence[];
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export type ScanStatus = "queued" | "running" | "completed" | "failed";

export interface ScanEvent {
  id?: number;
  scanId: string;
  type: "queued" | "clone" | "scan" | "backboard" | "persist" | "complete" | "error";
  message: string;
  createdAt: string;
}

export interface RepoRef {
  owner: string;
  name: string;
  normalizedUrl: string;
  cloneUrl: string;
}

export interface RepositoryRecord {
  id: string;
  workspaceId: string;
  owner: string;
  name: string;
  url: string;
  cloneUrl: string;
  packageName?: string | null;
  lastCommitSha?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScanRecord {
  id: string;
  workspaceId: string;
  repositoryId: string;
  repoUrl: string;
  commitSha?: string | null;
  status: ScanStatus;
  error?: string | null;
  graph?: GraphData | null;
  context?: ScanContext | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  backboardAssistantId?: string | null;
  backboardThreadId?: string | null;
  backboardRunId?: string | null;
}

export interface PackageInventory {
  name?: string;
  version?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface FileInventory {
  path: string;
  bytes: number;
  language: string;
}

export interface Finding {
  id: string;
  kind:
    | "package"
    | "import"
    | "http"
    | "env"
    | "config"
    | "api-route"
    | "database"
    | "queue"
    | "doc";
  label: string;
  value: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  detector: string;
  confidenceReason: string;
}

export interface ScanArtifacts {
  repoRoot: string;
  package: PackageInventory;
  files: FileInventory[];
  findings: Finding[];
  selectedSnippets: Evidence[];
  languageCounts: Record<string, number>;
  skipped: {
    oversizedFiles: number;
    ignoredFiles: number;
    totalFilesSeen: number;
  };
}

export interface BackboardSynthesis {
  assistantId: string;
  threadId: string;
  runId?: string | null;
  messageId?: string | null;
  content: string;
  memoryMode: string;
  memoryOperationId?: string | null;
  responseJson: unknown;
  synthesized?: {
    repoPurpose?: string;
    keyModules?: string[];
    detectedDependencies?: string[];
    riskAreas?: string[];
    nodeSummaries?: Record<string, string>;
    edgeSummaries?: Record<string, string>;
    crossRepoConnectionClues?: string[];
  };
}

export interface ScanContext {
  systemBrief: string;
  nodeContext: Array<{ nodeId: string; path: string; markdown: string }>;
  edgeContext: Array<{ edgeId: string; path: string; markdown: string }>;
  backboard?: {
    assistantId?: string | null;
    threadId?: string | null;
    runId?: string | null;
    memoryMode?: string | null;
  };
}

export interface WorkspaceGraph extends GraphData {
  workspaceId: string;
  repositories: RepositoryRecord[];
  crossRepoConnections: Array<{
    id: string;
    sourceRepositoryId: string;
    targetRepositoryId: string;
    sourcePackage: string;
    targetPackage: string;
    evidence: Evidence[];
    summary: string;
  }>;
}
