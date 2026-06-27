// Dummy data model for the Codebase Visualizer demo.
// Everything here is hand-authored sample data simulating the output of a
// repo scan of a fictional bank "payments" system.

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
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  /** 1 (peripheral) → 5 (critical path) */
  criticality: number;
  summary: string;
  code: string;
  codePath: string;
  contract: string;
  failure: string;
  risks: string[];
  confidence: Confidence;
  beforeYouChange?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ---------------------------------------------------------------------------
// Visual tokens (kept here so the graph + panels + legend stay in sync)
// ---------------------------------------------------------------------------

// ── 3 node color groups + neutral ───────────────────────────────────────────
// Group A  Services / Auth  → near-white  (internal code)
// Group B  Data layer       → blue        (databases, queues)
// Group C  External         → orange      (APIs, config outside codebase)
// Neutral  Config           → gray        (low-salience env config)

export const NODE_KIND_META: Record<
  NodeKind,
  { label: string; color: string; group: string }
> = {
  service:  { label: "Service / Module",     color: "#e8e9ed", group: "Internal"       },
  auth:     { label: "Auth / Identity",      color: "#e8e9ed", group: "Internal"       },
  database: { label: "Data Store",           color: "#60a5fa", group: "Infrastructure" },
  queue:    { label: "Queue / Stream",       color: "#60a5fa", group: "Infrastructure" },
  external: { label: "External Dependency",  color: "#fb923c", group: "External"       },
  config:   { label: "Config / Env",         color: "#5c5e6a", group: "Config"         },
};

export const EDGE_KIND_META: Record<
  EdgeKind,
  { label: string; color: string; dashed: boolean }
> = {
  sync:    { label: "Sync API call",       color: "#8b8d98", dashed: false },
  async:   { label: "Async / queue",       color: "#60a5fa", dashed: true  },
  db:      { label: "DB read/write",       color: "#60a5fa", dashed: false },
  config:  { label: "Shared config",       color: "#5c5e6a", dashed: true  },
  auth:    { label: "Auth delegation",     color: "#8b8d98", dashed: false },
  webhook: { label: "Webhook / callback",  color: "#fb923c", dashed: true  },
};

export const CONFIDENCE_META: Record<
  Confidence,
  { label: string; color: string }
> = {
  confirmed: { label: "Confirmed", color: "#34d399" },
  inferred:  { label: "Inferred",  color: "#fbbf24" },
  uncertain: { label: "Uncertain", color: "#f87171" },
};

// The 3 meaningful node groups shown in the legend
export const NODE_GROUPS = [
  { key: "Internal",       color: "#e8e9ed", desc: "Services and auth running inside your codebase" },
  { key: "Infrastructure", color: "#60a5fa", desc: "Databases, queues, and message streams" },
  { key: "External",       color: "#fb923c", desc: "Third-party APIs and bank rails outside your control" },
] as const;

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export const NODES: GraphNode[] = [
  {
    id: "api-gateway",
    label: "api-gateway",
    kind: "service",
    domain: "Edge",
    whatItIs:
      "Public ingress for all client traffic. Terminates TLS, validates tokens, and routes requests to internal services.",
    whyItExists:
      "Single front door so internal services never face the public internet directly.",
    owns: ["Rate limiting", "Request routing", "TLS termination"],
    confidence: "confirmed",
    risks: ["High coupling — every request flows through here"],
    path: "services/gateway/",
  },
  {
    id: "payments-service",
    label: "payments-service",
    kind: "service",
    domain: "Payments",
    whatItIs:
      "Core orchestrator for money movement. Initiates transfers, talks to bank rails, and writes to the ledger.",
    whyItExists:
      "Owns the critical path for all user-initiated transfers and settlement.",
    owns: ["Transfer state machine", "Idempotency keys", "Rail selection"],
    confidence: "confirmed",
    risks: [
      "On the critical path for every transfer",
      "Synchronous call to external rail with no circuit breaker",
    ],
    path: "services/payments/",
  },
  {
    id: "orders-module",
    label: "orders-module",
    kind: "service",
    domain: "Payments",
    whatItIs:
      "Accepts transfer intents from the client, validates them, and publishes them to the job queue.",
    whyItExists:
      "Decouples user-facing request latency from the slower settlement pipeline.",
    owns: ["Intent validation", "Queue publishing"],
    confidence: "confirmed",
    risks: ["Recent churn — 14 commits in the last week"],
    path: "services/orders/",
  },
  {
    id: "ledger-service",
    label: "ledger-service",
    kind: "service",
    domain: "Payments",
    whatItIs:
      "Double-entry accounting ledger. Source of truth for balances.",
    whyItExists:
      "Regulatory requirement for an immutable, auditable record of every movement.",
    owns: ["Account balances", "Journal entries", "Reconciliation"],
    confidence: "confirmed",
    risks: ["Low test coverage on reconciliation paths (~38%)"],
    path: "services/ledger/",
  },
  {
    id: "auth-layer",
    label: "auth-layer",
    kind: "auth",
    domain: "Identity",
    whatItIs:
      "Issues and validates JWTs, manages sessions, and brokers OAuth with the identity provider.",
    whyItExists: "Centralized identity so each service doesn't reimplement auth.",
    owns: ["Token issuance", "Session store", "Scope checks"],
    confidence: "confirmed",
    risks: ["Unclear ownership — last maintainer left the team"],
    path: "services/auth/",
  },
  {
    id: "notification-service",
    label: "notification-service",
    kind: "service",
    domain: "Messaging",
    whatItIs:
      "Listens for domain events and sends transactional emails and push notifications.",
    whyItExists: "Keeps user-facing comms out of the transfer hot path.",
    owns: ["Email templates", "Delivery retries"],
    confidence: "inferred",
    risks: [],
    path: "services/notifications/",
  },
  {
    id: "postgres",
    label: "postgres-primary",
    kind: "database",
    domain: "Data",
    whatItIs: "Primary relational store for payments and ledger data.",
    whyItExists: "Durable, transactional storage with strong consistency.",
    owns: ["Transfers table", "Ledger journal", "Accounts"],
    confidence: "confirmed",
    risks: ["Single primary — no read replica configured in code"],
  },
  {
    id: "redis",
    label: "redis-cache",
    kind: "database",
    domain: "Data",
    whatItIs: "In-memory cache for sessions and idempotency keys.",
    whyItExists: "Low-latency lookups and short-lived dedupe state.",
    owns: ["Session cache", "Idempotency cache"],
    confidence: "confirmed",
    risks: [],
  },
  {
    id: "rabbitmq",
    label: "rabbitmq",
    kind: "queue",
    domain: "Messaging",
    whatItIs: "Message broker carrying transfer jobs from orders to payments.",
    whyItExists: "Buffers load and enables retries on the settlement pipeline.",
    owns: ["transfer.requested queue", "Dead-letter queue"],
    confidence: "confirmed",
    risks: ["No alerting on dead-letter depth (inferred)"],
  },
  {
    id: "kafka",
    label: "kafka-events",
    kind: "queue",
    domain: "Messaging",
    whatItIs: "Event stream for domain events consumed by downstream systems.",
    whyItExists: "Fan-out of state changes to notifications and analytics.",
    owns: ["payments.events topic"],
    confidence: "inferred",
    risks: [],
  },
  {
    id: "rbc-rail-adapter",
    label: "rbc-rail-adapter",
    kind: "external",
    domain: "Bank Rails",
    whatItIs:
      "Adapter for the RBC ACH rail. Initiates outbound bank transfers.",
    whyItExists: "Required integration to actually move money via ACH.",
    owns: [],
    confidence: "confirmed",
    risks: [
      "External, owned by RBC infra team",
      "No circuit breaker on the calling side",
    ],
  },
  {
    id: "stripe",
    label: "stripe-api",
    kind: "external",
    domain: "Third-party",
    whatItIs: "Card processing and payout API.",
    whyItExists: "Card rails for instant payouts.",
    owns: [],
    confidence: "confirmed",
    risks: ["Webhook signature verification is inferred, not confirmed"],
  },
  {
    id: "plaid",
    label: "plaid-api",
    kind: "external",
    domain: "Third-party",
    whatItIs: "Bank account verification and balance checks.",
    whyItExists: "Verifies source accounts before initiating a transfer.",
    owns: [],
    confidence: "inferred",
    risks: ["Usage looks deprecated — only one call site found"],
  },
  {
    id: "sendgrid",
    label: "sendgrid",
    kind: "external",
    domain: "Third-party",
    whatItIs: "Transactional email delivery provider.",
    whyItExists: "Sends receipts and alerts to users.",
    owns: [],
    confidence: "confirmed",
    risks: [],
  },
  {
    id: "idp",
    label: "identity-provider",
    kind: "external",
    domain: "Identity",
    whatItIs: "External OAuth/OIDC identity provider.",
    whyItExists: "Source of truth for user authentication.",
    owns: [],
    confidence: "confirmed",
    risks: [],
  },
  {
    id: "env-config",
    label: "env-config",
    kind: "config",
    domain: "Platform",
    whatItIs:
      "Environment boundary — secrets and connection strings injected per environment.",
    whyItExists: "Separates prod / staging / dev configuration.",
    owns: ["DATABASE_URL", "RABBIT_URL", "RBC_API_KEY"],
    confidence: "inferred",
    risks: ["Some secrets referenced but not found in any vault (uncertain)"],
  },
];

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export const LINKS: GraphLink[] = [
  {
    id: "gateway-orders",
    source: "api-gateway",
    target: "orders-module",
    kind: "sync",
    criticality: 4,
    summary:
      "The gateway forwards validated transfer intents to the orders module over HTTP.",
    code: `// services/gateway/routes/transfers.ts
router.post("/transfers", requireAuth, async (req, res) => {
  const intent = parseIntent(req.body);
  const result = await ordersClient.submit(intent); // sync HTTP
  res.status(202).json(result);
});`,
    codePath: "services/gateway/routes/transfers.ts:L42",
    contract: `POST /internal/orders/submit
Request:  { userId, amount, currency, destination }
Response: { intentId, status: "queued" }`,
    failure:
      "Fails hard. A 5xx from orders bubbles up to the client as a 502. No retry at the gateway.",
    risks: ["No timeout configured — slow orders calls hold the connection open"],
    confidence: "confirmed",
  },
  {
    id: "orders-rabbit",
    source: "orders-module",
    target: "rabbitmq",
    kind: "async",
    criticality: 5,
    summary:
      "Orders publishes each validated intent to the transfer.requested queue.",
    code: `// services/orders/publish.ts
await channel.assertQueue("transfer.requested", { durable: true });
channel.sendToQueue(
  "transfer.requested",
  Buffer.from(JSON.stringify(intent)),
  { persistent: true, messageId: intent.idempotencyKey }
);`,
    codePath: "services/orders/publish.ts:L88",
    contract: `Queue: transfer.requested (durable)
Message: { intentId, idempotencyKey, amount, currency, destination }`,
    failure:
      "If RabbitMQ is unreachable the publish throws and the intent is rejected upstream. Messages are persistent, so a broker restart does not lose in-flight jobs.",
    risks: ["No dead-letter alerting", "Publish is not wrapped in a transaction with the DB write"],
    confidence: "confirmed",
    beforeYouChange:
      "The messageId is the idempotency key. Downstream dedupe relies on it — don't drop it.",
  },
  {
    id: "rabbit-payments",
    source: "rabbitmq",
    target: "payments-service",
    kind: "async",
    criticality: 5,
    summary:
      "Payments consumes transfer jobs from the queue and drives the transfer state machine.",
    code: `// services/payments/consumer.ts
channel.consume("transfer.requested", async (msg) => {
  const job = JSON.parse(msg.content.toString());
  try {
    await runTransfer(job);
    channel.ack(msg);
  } catch (e) {
    channel.nack(msg, false, false); // → dead-letter
  }
});`,
    codePath: "services/payments/consumer.ts:L31",
    contract: `Consumes: transfer.requested
Acks on success, nacks to dead-letter on failure`,
    failure:
      "Failed jobs are nacked to the dead-letter queue. There is retry logic here, but it caps at 3 attempts before parking the job.",
    risks: ["Dead-letter queue is not monitored"],
    confidence: "confirmed",
  },
  {
    id: "payments-rbc",
    source: "payments-service",
    target: "rbc-rail-adapter",
    kind: "sync",
    criticality: 5,
    summary:
      "The payments service initiates outbound ACH transfers by calling the RBC rail adapter over a synchronous HTTP connection. This link is on the critical path for all user-initiated transfers.",
    code: `// services/payments/rails/rbc.ts
const res = await httpClient.post("/v2/transfers", {
  amount, currency, source_account, destination_account,
  idempotency_key: job.idempotencyKey,
});
if (res.status >= 500) throw new RailError(res); // no circuit breaker`,
    codePath: "services/payments/rails/rbc.ts:L120",
    contract: `POST /v2/transfers
Request:  { amount, currency, source_account, destination_account, idempotency_key }
Response: { transfer_id, status, estimated_settlement }`,
    failure:
      "No circuit breaker. Failures throw a 500 upstream. No retry logic at this layer — retry is handled by the job queue one level up.",
    risks: [
      "High: synchronous, external, no fallback",
      "Latency spikes propagate directly to the user-facing transfer flow",
    ],
    confidence: "confirmed",
    beforeYouChange:
      "Understand the idempotency_key contract. RBC will double-process if the same key is reused across retries. This has caused incidents before (inferred from error handling comments in payments_service.go:L847).",
  },
  {
    id: "payments-stripe",
    source: "payments-service",
    target: "stripe",
    kind: "sync",
    criticality: 3,
    summary: "Instant card payouts are initiated through Stripe.",
    code: `// services/payments/rails/stripe.ts
const payout = await stripe.payouts.create({
  amount, currency, method: "instant",
}, { idempotencyKey: job.idempotencyKey });`,
    codePath: "services/payments/rails/stripe.ts:L64",
    contract: `stripe.payouts.create({ amount, currency, method })
Returns: Payout object`,
    failure:
      "Stripe SDK retries idempotently on network errors. Hard failures mark the transfer as failed.",
    risks: ["Falls back to no rail if Stripe is down — transfer stalls"],
    confidence: "inferred",
  },
  {
    id: "stripe-webhook",
    source: "stripe",
    target: "payments-service",
    kind: "webhook",
    criticality: 3,
    summary:
      "Stripe calls back with payout status updates via a signed webhook.",
    code: `// services/payments/webhooks/stripe.ts
const event = stripe.webhooks.constructEvent(rawBody, sig, secret);
if (event.type === "payout.paid") markSettled(event.data.object.id);`,
    codePath: "services/payments/webhooks/stripe.ts:L19",
    contract: `POST /webhooks/stripe
Header: Stripe-Signature
Body: Stripe Event object`,
    failure:
      "If signature verification fails the request is rejected with 400. Stripe retries with backoff for up to 3 days.",
    risks: ["Signature secret source is inferred, not confirmed"],
    confidence: "uncertain",
  },
  {
    id: "payments-plaid",
    source: "payments-service",
    target: "plaid",
    kind: "sync",
    criticality: 1,
    summary: "Source account verification before a transfer (legacy path).",
    code: `// services/payments/verify.ts (legacy)
const balance = await plaid.accountsBalanceGet({ access_token });`,
    codePath: "services/payments/verify.ts:L201",
    contract: `accountsBalanceGet({ access_token }) → balances`,
    failure: "Errors are swallowed and verification is skipped.",
    risks: ["Looks deprecated — single call site, behind a disabled flag"],
    confidence: "uncertain",
  },
  {
    id: "payments-postgres",
    source: "payments-service",
    target: "postgres",
    kind: "db",
    criticality: 5,
    summary: "Reads and writes transfer state to the primary database.",
    code: `// services/payments/repo.ts
await db.query(
  "INSERT INTO transfers (id, status, idempotency_key) VALUES ($1,$2,$3)",
  [id, "pending", key]
);`,
    codePath: "services/payments/repo.ts:L57",
    contract: `Table: transfers (id, status, idempotency_key, amount, ...)`,
    failure:
      "Connection failures throw and the job is nacked for retry. No degraded read mode.",
    risks: ["Single primary, no replica in config"],
    confidence: "confirmed",
  },
  {
    id: "ledger-postgres",
    source: "ledger-service",
    target: "postgres",
    kind: "db",
    criticality: 5,
    summary: "Writes immutable journal entries for every settled transfer.",
    code: `// services/ledger/journal.ts
await tx.query("INSERT INTO journal (debit, credit, amount) ...");`,
    codePath: "services/ledger/journal.ts:L44",
    contract: `Table: journal (id, debit_account, credit_account, amount, ts)`,
    failure: "Wrapped in a DB transaction. Rolls back atomically on error.",
    risks: ["Low test coverage on reconciliation"],
    confidence: "confirmed",
  },
  {
    id: "payments-ledger",
    source: "payments-service",
    target: "ledger-service",
    kind: "sync",
    criticality: 4,
    summary: "On settlement, payments posts the movement to the ledger.",
    code: `// services/payments/settle.ts
await ledgerClient.post("/entries", { debit, credit, amount });`,
    codePath: "services/payments/settle.ts:L92",
    contract: `POST /entries { debit, credit, amount, transferId }`,
    failure:
      "If the ledger is unavailable the transfer is marked settled but the entry is queued for replay — risk of drift.",
    risks: ["Eventual consistency gap between transfer status and ledger"],
    confidence: "inferred",
  },
  {
    id: "payments-kafka",
    source: "payments-service",
    target: "kafka",
    kind: "async",
    criticality: 2,
    summary: "Emits payments.events for downstream consumers.",
    code: `// services/payments/events.ts
producer.send({ topic: "payments.events", messages: [{ value }] });`,
    codePath: "services/payments/events.ts:L23",
    contract: `Topic: payments.events { type, transferId, status }`,
    failure: "Fire-and-forget. Failures are logged, not retried.",
    risks: [],
    confidence: "inferred",
  },
  {
    id: "kafka-notifications",
    source: "kafka",
    target: "notification-service",
    kind: "async",
    criticality: 2,
    summary: "Notifications consume payment events to trigger emails.",
    code: `// services/notifications/consumer.ts
consumer.run({ eachMessage: async ({ message }) => sendReceipt(message) });`,
    codePath: "services/notifications/consumer.ts:L15",
    contract: `Consumes payments.events`,
    failure: "Retries 3x, then drops. No dead-letter.",
    risks: ["Silent drop after retries"],
    confidence: "inferred",
  },
  {
    id: "notifications-sendgrid",
    source: "notification-service",
    target: "sendgrid",
    kind: "sync",
    criticality: 2,
    summary: "Sends the actual transactional email.",
    code: `// services/notifications/send.ts
await sgMail.send({ to, from, templateId, dynamicTemplateData });`,
    codePath: "services/notifications/send.ts:L40",
    contract: `sgMail.send({ to, templateId, ... })`,
    failure: "Throws on 4xx; retried by the consumer.",
    risks: [],
    confidence: "confirmed",
  },
  {
    id: "gateway-auth",
    source: "api-gateway",
    target: "auth-layer",
    kind: "auth",
    criticality: 4,
    summary: "The gateway delegates token validation to the auth layer.",
    code: `// services/gateway/middleware/auth.ts
const claims = await authClient.verify(req.headers.authorization);
req.user = claims;`,
    codePath: "services/gateway/middleware/auth.ts:L12",
    contract: `verify(bearerToken) → { sub, scopes, exp }`,
    failure: "Invalid/expired tokens → 401. Auth outage → all requests 401.",
    risks: ["Auth is a hard dependency for every request"],
    confidence: "confirmed",
  },
  {
    id: "auth-idp",
    source: "auth-layer",
    target: "idp",
    kind: "auth",
    criticality: 3,
    summary: "OAuth/OIDC handshake with the external identity provider.",
    code: `// services/auth/oauth.ts
const tokens = await oidc.callback(redirectUri, params);`,
    codePath: "services/auth/oauth.ts:L77",
    contract: `OIDC authorization code flow`,
    failure: "IdP downtime blocks new logins; existing sessions survive.",
    risks: [],
    confidence: "confirmed",
  },
  {
    id: "auth-redis",
    source: "auth-layer",
    target: "redis",
    kind: "db",
    criticality: 3,
    summary: "Sessions and refresh tokens are cached in Redis.",
    code: `// services/auth/session.ts
await redis.set(\`sess:\${id}\`, JSON.stringify(session), "EX", 3600);`,
    codePath: "services/auth/session.ts:L33",
    contract: `Key: sess:<id>  TTL 3600s`,
    failure: "Redis outage forces re-auth; not fatal.",
    risks: [],
    confidence: "confirmed",
  },
  {
    id: "payments-redis",
    source: "payments-service",
    target: "redis",
    kind: "db",
    criticality: 3,
    summary: "Idempotency keys are cached to dedupe retried jobs.",
    code: `// services/payments/idempotency.ts
const seen = await redis.set(\`idem:\${key}\`, "1", "NX", "EX", 86400);
if (!seen) return skipDuplicate();`,
    codePath: "services/payments/idempotency.ts:L18",
    contract: `Key: idem:<key>  NX EX 86400`,
    failure: "Cache miss falls back to a DB unique constraint.",
    risks: ["TTL of 24h may be shorter than RBC settlement window"],
    confidence: "inferred",
  },
  {
    id: "env-payments",
    source: "env-config",
    target: "payments-service",
    kind: "config",
    criticality: 2,
    summary: "Injects connection strings and the RBC API key at boot.",
    code: `// services/payments/config.ts
export const cfg = {
  dbUrl: process.env.DATABASE_URL!,
  rbcKey: process.env.RBC_API_KEY!, // not found in vault
};`,
    codePath: "services/payments/config.ts:L4",
    contract: `Env: DATABASE_URL, RABBIT_URL, RBC_API_KEY`,
    failure: "Missing env var crashes the service at boot (fail-fast).",
    risks: ["RBC_API_KEY referenced but not present in any scanned vault"],
    confidence: "uncertain",
  },
];

export const GRAPH: GraphData = { nodes: NODES, links: LINKS };

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export function nodeById(id: string): GraphNode | undefined {
  return NODES.find((n) => n.id === id);
}

export function linkEndpoints(link: GraphLink): {
  source: GraphNode | undefined;
  target: GraphNode | undefined;
} {
  return { source: nodeById(link.source), target: nodeById(link.target) };
}

export function dependenciesOf(nodeId: string): GraphLink[] {
  return LINKS.filter((l) => l.source === nodeId);
}

export function dependentsOf(nodeId: string): GraphLink[] {
  return LINKS.filter((l) => l.target === nodeId);
}

// ---------------------------------------------------------------------------
// Agent context markdown generation (mirrors the PRD example)
// ---------------------------------------------------------------------------

export function linkContextMarkdown(link: GraphLink): string {
  const { source, target } = linkEndpoints(link);
  return `# ${source?.label} → ${target?.label}

## What This Is
${link.summary}

## What Connects Here
- Upstream: ${source?.label} (${source?.kind === "external" ? "external" : "internal"})
- Downstream: ${target?.label} (${target?.kind === "external" ? "external" : "internal"})

## Contract
${link.contract}

## Failure Behavior
${link.failure}

## Risk
${link.risks.length ? link.risks.map((r) => `- ${r}`).join("\n") : "- None flagged"}

## Confidence
${CONFIDENCE_META[link.confidence].label}${
    link.confidence === "confirmed"
      ? " — explicit in code and confirmed by tests."
      : link.confidence === "inferred"
        ? " — inferred from code patterns."
        : " — partially inferred, verify before relying on it."
  }
${
  link.beforeYouChange
    ? `\n## Before You Change This\n${link.beforeYouChange}\n`
    : ""
}`;
}

export function nodeContextMarkdown(node: GraphNode): string {
  const deps = dependenciesOf(node.id);
  const dependents = dependentsOf(node.id);

  function depBlock(link: GraphLink, direction: "out" | "in"): string {
    const peer =
      direction === "out"
        ? nodeById(link.target)
        : nodeById(link.source);
    const arrow = direction === "out" ? "→" : "←";
    const lines = [
      `### ${arrow} ${peer?.label ?? (direction === "out" ? link.target : link.source)} · ${EDGE_KIND_META[link.kind].label} · criticality ${link.criticality}/5`,
      ``,
      `**Summary:** ${link.summary}`,
      ``,
      `**Contract:**`,
      `\`\`\``,
      link.contract,
      `\`\`\``,
      ``,
      `**Failure behavior:** ${link.failure}`,
    ];
    if (link.code) {
      lines.push(``, `**Code** (\`${link.codePath}\`):`);
      lines.push(`\`\`\``, link.code, `\`\`\``);
    }
    if (link.beforeYouChange) {
      lines.push(``, `> ⚠️ **Before you change this:** ${link.beforeYouChange}`);
    }
    if (link.risks.length) {
      lines.push(``, `**Risks:**`);
      link.risks.forEach((r) => lines.push(`- ${r}`));
    }
    lines.push(``, `**Confidence:** ${CONFIDENCE_META[link.confidence].label}`);
    return lines.join("\n");
  }

  return `# ${node.label}

**Kind:** ${NODE_KIND_META[node.kind].label} · **Domain:** ${node.domain} · **Confidence:** ${CONFIDENCE_META[node.confidence].label}
${node.path ? `**Path:** \`${node.path}\`` : ""}

## What This Is
${node.whatItIs}

## Why It Exists
${node.whyItExists}

## What It Owns
${node.owns.length ? node.owns.map((o) => `- \`${o}\``).join("\n") : "- Nothing tracked"}

## Depends On (${deps.length} outbound)

${deps.length ? deps.map((l) => depBlock(l, "out")).join("\n\n---\n\n") : "_No outbound dependencies._"}

## Depended On By (${dependents.length} inbound · blast radius)

${dependents.length ? dependents.map((l) => depBlock(l, "in")).join("\n\n---\n\n") : "_Nothing depends on this node._"}

## Risk Flags
${node.risks.length ? node.risks.map((r) => `- ${r}`).join("\n") : "- None flagged"}
`;
}

// ---------------------------------------------------------------------------
// Risk surface summary — single-page danger map for the whole system
// ---------------------------------------------------------------------------

export function riskSurfaceMarkdown(): string {
  const criticalLinks = LINKS.filter((l) => l.criticality >= 5);
  const riskyNodes = NODES.filter((n) => n.risks.length > 0);
  const uncertainLinks = LINKS.filter((l) => l.confidence === "uncertain");
  const beforeYouChangeLinks = LINKS.filter((l) => l.beforeYouChange);

  function criticalityBar(c: number): string {
    return "█".repeat(c) + "░".repeat(5 - c);
  }

  const critSection =
    criticalLinks.length === 0
      ? "_No criticality-5 links found._"
      : criticalLinks
          .map((l) => {
            const src = nodeById(l.source);
            const tgt = nodeById(l.target);
            return [
              `### ${src?.label ?? l.source} → ${tgt?.label ?? l.target}`,
              `**Criticality:** ${criticalityBar(l.criticality)} ${l.criticality}/5 · **Kind:** ${EDGE_KIND_META[l.kind].label}`,
              `**Failure:** ${l.failure}`,
              l.beforeYouChange ? `> ⚠️ ${l.beforeYouChange}` : "",
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n---\n\n");

  const riskNodeSection =
    riskyNodes.length === 0
      ? "_No risk-flagged nodes._"
      : riskyNodes
          .map((n) => {
            return [
              `### ${n.label} (${NODE_KIND_META[n.kind].label})`,
              n.risks.map((r) => `- ${r}`).join("\n"),
            ].join("\n");
          })
          .join("\n\n");

  const uncertainSection =
    uncertainLinks.length === 0
      ? "_All dependencies have confirmed or inferred confidence._"
      : uncertainLinks
          .map((l) => {
            const src = nodeById(l.source);
            const tgt = nodeById(l.target);
            return `- **${src?.label} → ${tgt?.label}** — ${l.summary.split(".")[0]}.`;
          })
          .join("\n");

  const beforeSection =
    beforeYouChangeLinks.length === 0
      ? "_No gotchas recorded._"
      : beforeYouChangeLinks
          .map((l) => {
            const src = nodeById(l.source);
            const tgt = nodeById(l.target);
            return [
              `### ${src?.label} → ${tgt?.label}`,
              l.beforeYouChange,
            ].join("\n");
          })
          .join("\n\n");

  return `# Risk Surface — payments-platform

A single-page danger map. Read this before touching anything.

## Critical Path Links (criticality 5/5)

${critSection}

## Risk-Flagged Nodes

${riskNodeSection}

## Uncertain Dependencies (verify before relying on)

${uncertainSection}

## Before You Change Anything

Known gotchas and institutional knowledge across all links:

${beforeSection}
`;
}

export const SYSTEM_BRIEF = `# System Brief — payments-platform

A bank payments platform that moves money via ACH (RBC rail) and card (Stripe).
Requests enter through the **api-gateway**, are validated by **orders-module**,
and queued through **RabbitMQ** to **payments-service**, which drives the
transfer state machine, calls external rails, and posts to the **ledger-service**.

## Shape
- 1 edge gateway, 4 internal services, 2 queues, 2 data stores
- 5 external dependencies (RBC, Stripe, Plaid, SendGrid, Identity Provider)

## Top 3 Risk Areas
1. **payments-service → rbc-rail-adapter** — synchronous, external, no circuit
   breaker. Latency here hits users directly.
2. **auth-layer** — hard dependency for every request, unclear ownership.
3. **env-config → payments-service** — RBC_API_KEY referenced but not found in
   any scanned vault.

## Scan Confidence
Most of the core path is confirmed. The Stripe webhook, Plaid path, and the
secret injection boundary are inferred or uncertain — verify before relying.
`;

// Scan feed lines for the landing animation
export const SCAN_FEED: { text: string; tone: "info" | "find" | "warn" }[] = [
  { text: "Cloning repository github.com/acme/payments-platform…", tone: "info" },
  { text: "Indexing 1,284 files across 6 services", tone: "info" },
  { text: "Parsing import graph and module boundaries", tone: "info" },
  { text: "Found 5 external service connections", tone: "find" },
  { text: "Detected RabbitMQ producer in orders module", tone: "find" },
  { text: "Detected RabbitMQ consumer in payments service", tone: "find" },
  { text: "Mapped Kafka topic payments.events → notification-service", tone: "find" },
  { text: "Resolved 2 data stores (postgres-primary, redis-cache)", tone: "find" },
  { text: "Tracing transfer state machine across 4 files", tone: "info" },
  { text: "Flagging high-coupling zone in auth layer", tone: "warn" },
  { text: "No circuit breaker on payments → rbc-rail-adapter", tone: "warn" },
  { text: "RBC_API_KEY referenced but not found in any vault", tone: "warn" },
  { text: "Generating context files for 19 links and 16 nodes", tone: "info" },
  { text: "Scan complete — system model ready", tone: "find" },
];
