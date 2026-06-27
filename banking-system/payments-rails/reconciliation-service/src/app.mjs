import http from "node:http";

export const serviceName = "reconciliation-service";
export const domain = "Payments And Rails";
export const endpoint = "/v1/reconciliation/runs";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  EVENT_WAREHOUSE_SERVICE_URL: process.env.EVENT_WAREHOUSE_SERVICE_URL || "http://event-warehouse-service:8161",
  AUDIT_LOG_SERVICE_URL: process.env.AUDIT_LOG_SERVICE_URL || "http://audit-log-service:8174",
};

export const topics = {
  produces: ["reconciliation.completed"],
  consumes: ["settlement.batch.created", "ledger.entry.posted"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.EVENT_WAREHOUSE_SERVICE_URL}/health`).catch((error) => ({ service: "event-warehouse-service", error: error.message })),
    fetchImpl(`${environment.AUDIT_LOG_SERVICE_URL}/health`).catch((error) => ({ service: "audit-log-service", error: error.message })),
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
    downstreamServices: ["event-warehouse-service", "audit-log-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
