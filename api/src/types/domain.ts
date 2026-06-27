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
  memoryStatus?: BackboardMemoryStatus;
  durableFacts?: DurableMemoryFact[];
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

export interface DurableMemoryFact {
  id: string;
  scope: "repository" | "dependency" | "finding";
  repositoryId: string;
  repo: string;
  commitSha: string;
  fact: string;
  confidence: Confidence;
  evidenceIds: string[];
  evidenceRefs: Array<{
    evidenceId: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    detector: string;
    snippet: string;
  }>;
}

export interface BackboardMemoryStatus {
  attempted: boolean;
  succeeded: boolean;
  operationId?: string | null;
  error?: string | null;
  factCount: number;
}

export interface ScanContext {
  systemBrief: string;
  nodeContext: Array<{ nodeId: string; path: string; markdown: string }>;
  edgeContext: Array<{ edgeId: string; path: string; markdown: string }>;
  handoff: HandoffContextMap;
  backboard?: {
    assistantId?: string | null;
    threadId?: string | null;
    runId?: string | null;
    memoryMode?: string | null;
    memoryOperationId?: string | null;
    memoryStatus?: BackboardMemoryStatus | null;
    durableFacts?: DurableMemoryFact[];
    advisorySynthesis?: BackboardSynthesis["synthesized"];
  };
}

export interface HandoffContextMap {
  purpose: string;
  repositoryId: string;
  commitSha: string;
  files: Array<{
    filePath: string;
    nodes: Array<{
      nodeId: string;
      label: string;
      kind: NodeKind;
      confidence: Confidence;
      evidenceId?: string;
      lineStart: number;
      lineEnd: number;
      snippet: string;
      detector: string;
      confidenceReason: string;
    }>;
    edges: Array<{
      edgeId: string;
      source: string;
      target: string;
      kind: EdgeKind;
      confidence: Confidence;
      evidenceId?: string;
      lineStart: number;
      lineEnd: number;
      snippet: string;
      detector: string;
      confidenceReason: string;
    }>;
  }>;
}

export type PullRequestHandoffStatus = "completed" | "failed";

export interface PullRequestRef {
  owner: string;
  repo: string;
  ref: string;
  sha: string;
}

export interface PullRequestChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  patchStatus?: "available" | "missing";
  patchUnavailableReason?: string;
}

export interface PullRequestCommit {
  sha: string;
  message: string;
  author?: string | null;
  date?: string | null;
}

export interface PullRequestHunk {
  id: string;
  filePath: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  patch: string;
  addedLines: Array<{ line: number; content: string }>;
  removedLines: Array<{ line: number; content: string }>;
}

export interface PullRequestHandoffMapping {
  hunkId: string;
  filePath: string;
  nodes: Array<{
    nodeId: string;
    label: string;
    kind: NodeKind;
    confidence: Confidence;
    reason: string;
    evidenceId?: string;
    lineStart: number;
    lineEnd: number;
    snippet: string;
    detector: string;
    basis: "exact-line" | "same-file";
    provenance: PullRequestHandoffProvenance;
  }>;
  edges: Array<{
    edgeId: string;
    source: string;
    target: string;
    kind: EdgeKind;
    confidence: Confidence;
    reason: string;
    evidenceId?: string;
    lineStart: number;
    lineEnd: number;
    snippet: string;
    detector: string;
    basis: "exact-line" | "same-file";
    provenance: PullRequestHandoffProvenance;
  }>;
  uncertainty: string[];
}

export interface PullRequestHandoffProvenance {
  evidenceSource: "atlas-scan";
  scanId?: string | null;
  scanCommitSha?: string | null;
  evidenceId?: string;
  evidenceFilePath: string;
  evidenceLineStart: number;
  evidenceLineEnd: number;
  prBaseSha: string;
  prHeadSha: string;
  mappingBasis: "exact-line" | "same-file";
}

export interface PullRequestHandoffBrief {
  summary: string;
  taskState: string[];
  impactedArchitecture: string[];
  risks: string[];
  missingTests: string[];
  nextSteps: string[];
  uncertainty: string[];
  evidence: string[];
}

export interface PullRequestAgentPacket {
  objective: string;
  owner: string;
  repo: string;
  number: number;
  prUrl: string;
  base: PullRequestRef;
  head: PullRequestRef;
  commits: PullRequestCommit[];
  changedFiles: PullRequestChangedFile[];
  taskState: string[];
  risks: string[];
  missingTests: string[];
  mappings: PullRequestHandoffMapping[];
  constraints: string[];
  exactFilesAndHunks: PullRequestHunk[];
  suggestedNextActions: string[];
  knownUnknowns: string[];
  evidenceRefs: string[];
  backboardMemoryRefs: string[];
}

export interface PullRequestHandoffRecord {
  id: string;
  workspaceId: string;
  repositoryId?: string | null;
  scanId?: string | null;
  prUrl: string;
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
  mappings: PullRequestHandoffMapping[];
  humanBrief: PullRequestHandoffBrief;
  agentPacket: PullRequestAgentPacket;
  memoryFacts: DurableMemoryFact[];
  memoryStatus?: BackboardMemoryStatus | null;
  backboardAssistantId?: string | null;
  backboardThreadId?: string | null;
  backboardMemoryOperationId?: string | null;
  createdAt: string;
  updatedAt: string;
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
    sourceEvidence: Evidence[];
    targetEvidence: Evidence[];
    evidence: Evidence[];
    summary: string;
  }>;
}

export type ChatRole = "user" | "assistant";

export type ChatContextSubject =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "scan"; id: string }
  | { type: "handoff"; id: string }
  | { type: "workspace"; id: string };

export interface ChatCitation {
  id: string;
  stableId?: string;
  label: string;
  subjectType: "node" | "edge" | "repo" | "workspace" | "handoff";
  subjectId?: string;
  repositoryId?: string;
  scanId?: string;
  commitSha?: string | null;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  snippet?: string;
  detector?: string;
  confidenceReason?: string;
  confidence?: Confidence;
}

export interface ChatSessionRecord {
  id: string;
  workspaceId: string;
  title: string;
  assistantId: string;
  threadId?: string | null;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  context?: ChatContextBundle | null;
  citations: ChatCitation[];
  backboardRunId?: string | null;
  backboardMessageId?: string | null;
  memoryOperationId?: string | null;
  memoryError?: string | null;
  createdAt: string;
}

export interface ChatContextBundle {
  workspaceId: string;
  question: string;
  graphSummary: {
    repositories: number;
    scans: number;
    nodes: number;
    edges: number;
    crossRepoConnections: number;
  };
  repositories: Array<{
    id: string;
    owner: string;
    name: string;
    packageName?: string | null;
    lastCommitSha?: string | null;
  }>;
  selected?: ChatContextSubject;
  nodes: GraphNode[];
  edges: GraphLink[];
  evidence: ChatCitation[];
  generatedMarkdown: string;
  previousMessages: Array<{
    role: ChatRole;
    content: string;
    createdAt: string;
  }>;
  memoryFacts: string[];
  weakEvidence: boolean;
}

export interface BackboardChatResponse {
  assistantId: string;
  threadId: string;
  runId?: string | null;
  messageId?: string | null;
  content: string;
  memoryMode: string;
  memoryOperationId?: string | null;
  memoryStatus?: BackboardMemoryStatus | null;
  memoryError?: string | null;
  durableFacts?: DurableMemoryFact[];
  responseJson: unknown;
}
