import http from "node:http";

export const serviceName = "core-ledger-service";
export const domain = "Accounts And Ledger";
export const endpoint = "/v1/ledger/entries";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  AUDIT_LOG_SERVICE_URL: process.env.AUDIT_LOG_SERVICE_URL || "http://audit-log-service:8174",
  CONFIG_SERVICE_URL: process.env.CONFIG_SERVICE_URL || "http://config-service:8172",
};

export const topics = {
  produces: ["ledger.entry.posted"],
  consumes: ["payment.authorized", "branch.transaction.created"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.AUDIT_LOG_SERVICE_URL}/health`).catch((error) => ({ service: "audit-log-service", error: error.message })),
    fetchImpl(`${environment.CONFIG_SERVICE_URL}/health`).catch((error) => ({ service: "config-service", error: error.message })),
  ]);
}

export function buildSyntheticTransaction(input = {}) {
  return {
    service: serviceName,
    domain,
    transactionId: input.transactionId || "txn-demo-" + Date.now(),
    amount: input.amount || 125.50,
    currency: input.currency || "USD",
    topicsProduced: topics.produces,
    downstreamServices: ["audit-log-service", "config-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
