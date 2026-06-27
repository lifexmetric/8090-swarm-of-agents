import http from "node:http";

export const serviceName = "session-risk-service";
export const domain = "Identity And Access";
export const endpoint = "/v1/sessions/risk";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  DEVICE_TRUST_SERVICE_URL: process.env.DEVICE_TRUST_SERVICE_URL || "http://device-trust-service:8112",
  FRAUD_RULES_SERVICE_URL: process.env.FRAUD_RULES_SERVICE_URL || "http://fraud-rules-service:8153",
};

export const topics = {
  produces: ["session.risk.scored"],
  consumes: ["identity.login.succeeded"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.DEVICE_TRUST_SERVICE_URL}/health`).catch((error) => ({ service: "device-trust-service", error: error.message })),
    fetchImpl(`${environment.FRAUD_RULES_SERVICE_URL}/health`).catch((error) => ({ service: "fraud-rules-service", error: error.message })),
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
    downstreamServices: ["device-trust-service", "fraud-rules-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
