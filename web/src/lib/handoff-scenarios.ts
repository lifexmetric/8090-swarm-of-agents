import type { GraphLink, GraphNode } from "./data";

export interface HandoffScenario {
  id: string;
  title: string;
  summary: string;
  anchor: string;
  keywords: string[];
  prompt: string;
}

function prompt(parts: string[]): string {
  return parts.join("\n\n");
}

export const HANDOFF_SCENARIOS: HandoffScenario[] = [
  {
    id: "consent-revocation",
    title: "Finish consent revocation",
    summary: "Verify revoke behavior across audit logging, partner API, and preference consumers.",
    anchor: "customer-domain/consent-service",
    keywords: [
      "consent-service",
      "consent.revoked",
      "consent.granted",
      "partner-api-service",
      "customer-preferences-service",
      "audit-log-service",
      "customers_db",
      "/v1/consents",
      "customer-domain/consent-service",
    ],
    prompt: prompt([
      "Demo handoff case: I am handing off an unfinished consent revocation change in `banking-system/customer-domain/consent-service`.",
      "Known repo anchors to verify and cite: `consent-service` exposes `/v1/consents` on port `8123`, depends on `audit-log-service` through `AUDIT_LOG_SERVICE_URL`, produces `consent.granted` and `consent.revoked`, consumes `customer.profile.updated`, and uses MongoDB plus Redis. The event catalog shows `consent.revoked` is consumed by `partner-api-service` and `customer-preferences-service`.",
      "Task state: the revoke API behavior is partly designed, but event publication, audit logging, and downstream consumer impact have not been verified.",
      "Produce a takeover handoff for the next engineer: current task state, first nodes/files/edges to inspect, dependency and event risks, a step-by-step finish plan, and acceptance checks. Cite Atlas evidence for every repo claim, and call out any fact you cannot confirm from the loaded scan.",
    ]),
  },
  {
    id: "atm-withdrawal-failure",
    title: "Triage ATM withdrawal failure",
    summary: "Trace a production withdrawal issue through ledger, card authorization, risk, Redis, and Kafka.",
    anchor: "channels/atm-gateway-service",
    keywords: [
      "atm-gateway-service",
      "atm.withdrawal.requested",
      "ledger.entry.posted",
      "core-ledger-service",
      "card-authorization-service",
      "session-risk-service",
      "channels/atm-gateway-service",
      "/v1/atm/withdrawals",
    ],
    prompt: prompt([
      "Demo handoff case: I am handing off a production triage task for failed ATM withdrawals in `banking-system/channels/atm-gateway-service`.",
      "Known repo anchors to verify and cite: `atm-gateway-service` exposes `/v1/atm/withdrawals` on port `8103`, depends on `core-ledger-service`, `card-authorization-service`, and `session-risk-service`, produces `atm.withdrawal.requested`, consumes `ledger.entry.posted`, and uses Redis plus Kafka.",
      "Task state: the customer-visible failure is intermittent. I checked the gateway entry point but have not traced whether failures come from ledger posting, card authorization, session risk, Redis state, or Kafka event flow.",
      "Produce a takeover handoff: likely paths to inspect first, dependency/event/data-store risks, what evidence would separate gateway defects from downstream defects, a finish plan, and concrete acceptance checks. Cite Atlas evidence for every repo claim.",
    ]),
  },
  {
    id: "employee-access-audit",
    title: "Complete employee access audit",
    summary: "Finish access grant/revoke work without breaking IAM, config policy, or audit records.",
    anchor: "identity/employee-access-service",
    keywords: [
      "employee-access-service",
      "employee.access.granted",
      "employee.access.revoked",
      "config.policy.updated",
      "iam-service",
      "audit-log-service",
      "identity/employee-access-service",
      "/v1/employees/access",
    ],
    prompt: prompt([
      "Demo handoff case: I am handing off an employee access audit task in `banking-system/identity/employee-access-service`.",
      "Known repo anchors to verify and cite: `employee-access-service` exposes `/v1/employees/access` on port `8114`, depends on `iam-service` through `IAM_SERVICE_URL`, depends on `audit-log-service` through `AUDIT_LOG_SERVICE_URL`, produces `employee.access.granted` and `employee.access.revoked`, consumes `config.policy.updated`, and uses Redis plus Kafka.",
      "Task state: access grant/revoke behavior is being tightened for policy compliance, but I have not confirmed IAM delegation, audit log emission, or config-policy update handling.",
      "Produce a takeover handoff: what to inspect first, how IAM and audit dependencies affect the change, event risks, missing verification, step-by-step finish plan, and acceptance checks. Cite Atlas evidence and flag any unsupported assumptions.",
    ]),
  },
  {
    id: "kyc-screening-fanout",
    title: "Finish KYC screening fan-out",
    summary: "Coordinate document verification, AML, sanctions, customer profile, deposits, and card account flows.",
    anchor: "customer-domain/kyc-orchestration-service",
    keywords: [
      "kyc-orchestration-service",
      "document-verification-service",
      "aml-screening-service",
      "sanctions-screening-service",
      "kyc.customer.started",
      "kyc.customer.verified",
      "customer.profile.updated",
      "customer-domain/kyc-orchestration-service",
      "/v1/kyc/checks",
    ],
    prompt: prompt([
      "Demo handoff case: I am handing off a KYC orchestration change in `banking-system/customer-domain/kyc-orchestration-service`.",
      "Known repo anchors to verify and cite: `kyc-orchestration-service` exposes `/v1/kyc/checks` on port `8121`, depends on `document-verification-service`, `aml-screening-service`, and `sanctions-screening-service`, produces `kyc.customer.started` and `kyc.customer.verified`, consumes `customer.profile.updated`, and uses MongoDB plus Redis. The event catalog shows `kyc.customer.started` fans out to document verification, AML, and sanctions screening; `kyc.customer.verified` is consumed by customer profile, deposits, and card account services.",
      "Task state: orchestration sequencing is under review, but I have not confirmed fan-out order, retry behavior, or the impact of delayed screening results.",
      "Produce a takeover handoff: key graph paths, downstream risk areas, evidence to inspect, likely failure modes, finish plan, and acceptance checks. Cite Atlas evidence for every repo claim.",
    ]),
  },
  {
    id: "reporting-mart-refresh",
    title: "Repair reporting mart refresh",
    summary: "Trace stale reporting data through warehouse facts, regulatory reports, S3, and Postgres.",
    anchor: "data-platform/reporting-marts-service",
    keywords: [
      "reporting-marts-service",
      "event-warehouse-service",
      "regulatory-reporting-service",
      "warehouse.fact.loaded",
      "regulatory.report.filed",
      "reporting.mart.refreshed",
      "global-bank-data-lake-demo",
      "postgres-bank",
      "data-platform/reporting-marts-service",
      "/v1/reporting/marts",
    ],
    prompt: prompt([
      "Demo handoff case: I am handing off a stale reporting mart investigation in `banking-system/data-platform/reporting-marts-service`.",
      "Known repo anchors to verify and cite: `reporting-marts-service` exposes `/v1/reporting/marts` on port `8163`, depends on `event-warehouse-service` and `regulatory-reporting-service`, consumes `warehouse.fact.loaded` and `regulatory.report.filed`, produces `reporting.mart.refreshed`, and stores data in `s3://global-bank-data-lake-demo` plus `postgres://bank_user@postgres-bank:5432/bank_db`.",
      "Task state: reports are stale after upstream loads. I have not determined whether the fault is event ingestion, warehouse freshness, regulatory report timing, S3 object availability, or Postgres mart writes.",
      "Produce a takeover handoff: graph paths to inspect, freshness and data consistency risks, evidence needed to isolate the source, finish plan, and acceptance checks. Cite Atlas evidence and separate confirmed facts from hypotheses.",
    ]),
  },
];

function haystackForContext(selectedNode: GraphNode | null, selectedLink: GraphLink | null): string {
  const values: string[] = [];
  if (selectedNode) {
    values.push(
      selectedNode.id,
      selectedNode.label,
      selectedNode.kind,
      selectedNode.domain,
      selectedNode.path ?? "",
      selectedNode.whatItIs,
      selectedNode.whyItExists,
      ...selectedNode.owns,
      ...selectedNode.risks,
      ...(selectedNode.evidence ?? []).flatMap((item) => [item.filePath, item.snippet, item.detector]),
    );
  }
  if (selectedLink) {
    values.push(
      selectedLink.id,
      selectedLink.source,
      selectedLink.target,
      selectedLink.kind,
      selectedLink.summary,
      selectedLink.code,
      selectedLink.codePath,
      selectedLink.contract,
      selectedLink.failure,
      ...selectedLink.risks,
      ...(selectedLink.evidence ?? []).flatMap((item) => [item.filePath, item.snippet, item.detector]),
    );
  }
  return values.join(" ").toLowerCase();
}

function scenarioScore(scenario: HandoffScenario, haystack: string): number {
  if (!haystack) return 0;
  return scenario.keywords.reduce((score, keyword) => {
    return haystack.includes(keyword.toLowerCase()) ? score + 1 : score;
  }, 0);
}

export function getHandoffScenarios(
  selectedNode: GraphNode | null,
  selectedLink: GraphLink | null,
): HandoffScenario[] {
  const haystack = haystackForContext(selectedNode, selectedLink);
  return HANDOFF_SCENARIOS.map((scenario, index) => ({
    scenario,
    index,
    score: scenarioScore(scenario, haystack),
  }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.scenario);
}
