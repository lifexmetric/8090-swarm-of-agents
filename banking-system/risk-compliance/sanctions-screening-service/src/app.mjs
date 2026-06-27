import http from "node:http";

export const serviceName = "sanctions-screening-service";
export const domain = "Risk And Compliance";
export const endpoint = "/v1/screening/sanctions";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  CASE_MANAGEMENT_SERVICE_URL: process.env.CASE_MANAGEMENT_SERVICE_URL || "http://case-management-service:8154",
  AUDIT_LOG_SERVICE_URL: process.env.AUDIT_LOG_SERVICE_URL || "http://audit-log-service:8174",
};

export const topics = {
  produces: ["sanctions.screening.completed", "sanctions.hit.detected"],
  consumes: ["payment.authorized", "kyc.customer.started"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.CASE_MANAGEMENT_SERVICE_URL}/health`).catch((error) => ({ service: "case-management-service", error: error.message })),
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
    downstreamServices: ["case-management-service", "audit-log-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
