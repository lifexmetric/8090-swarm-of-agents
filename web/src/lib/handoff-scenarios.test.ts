import { describe, expect, it } from "vitest";
import type { GraphLink, GraphNode } from "./data";
import { getHandoffScenarios, HANDOFF_SCENARIOS } from "./handoff-scenarios";

function node(overrides: Partial<GraphNode>): GraphNode {
  return {
    id: "node-1",
    label: "test-node",
    kind: "service",
    domain: "Test",
    whatItIs: "test node",
    whyItExists: "test",
    owns: [],
    confidence: "confirmed",
    risks: [],
    ...overrides,
  };
}

function link(overrides: Partial<GraphLink>): GraphLink {
  return {
    id: "edge-1",
    source: "source",
    target: "target",
    kind: "sync",
    criticality: 3,
    summary: "test link",
    code: "",
    codePath: "",
    contract: "",
    failure: "",
    risks: [],
    confidence: "confirmed",
    ...overrides,
  };
}

describe("handoff scenarios", () => {
  it("provides concrete repo-grounded demo cases", () => {
    expect(HANDOFF_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      "consent-revocation",
      "atm-withdrawal-failure",
      "employee-access-audit",
      "kyc-screening-fanout",
      "reporting-mart-refresh",
    ]);
    expect(HANDOFF_SCENARIOS[0].prompt).toContain("banking-system/customer-domain/consent-service");
    expect(HANDOFF_SCENARIOS[0].prompt).toContain("consent.revoked");
  });

  it("keeps default ordering without selected graph context", () => {
    expect(getHandoffScenarios(null, null).map((scenario) => scenario.id)).toEqual(
      HANDOFF_SCENARIOS.map((scenario) => scenario.id),
    );
  });

  it("prioritizes a scenario that matches the selected node", () => {
    const selected = node({
      id: "svc-atm-gateway-service",
      label: "atm-gateway-service",
      path: "banking-system/channels/atm-gateway-service/src/app.mjs",
      owns: ["atm.withdrawal.requested", "ledger.entry.posted"],
    });

    expect(getHandoffScenarios(selected, null)[0].id).toBe("atm-withdrawal-failure");
  });

  it("prioritizes a scenario that matches the selected edge evidence", () => {
    const selected = link({
      id: "employee-access-service-audit-log-service",
      source: "employee-access-service",
      target: "audit-log-service",
      summary: "employee access writes audit events",
      codePath: "banking-system/identity/employee-access-service/src/app.mjs:L14",
      evidence: [
        {
          filePath: "banking-system/identity/employee-access-service/service.config.json",
          lineStart: 1,
          lineEnd: 20,
          snippet: "AUDIT_LOG_SERVICE_URL employee.access.revoked",
          detector: "service-config",
          confidenceReason: "test evidence",
        },
      ],
    });

    expect(getHandoffScenarios(null, selected)[0].id).toBe("employee-access-audit");
  });
});
