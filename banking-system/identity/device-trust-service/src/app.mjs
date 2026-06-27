import http from "node:http";

export const serviceName = "device-trust-service";
export const domain = "Identity And Access";
export const endpoint = "/v1/devices/trust-score";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  RISK_FEATURE_STORE_SERVICE_URL: process.env.RISK_FEATURE_STORE_SERVICE_URL || "http://risk-feature-store-service:8162",
  AUDIT_LOG_SERVICE_URL: process.env.AUDIT_LOG_SERVICE_URL || "http://audit-log-service:8174",
};

export const topics = {
  produces: ["device.trust.scored"],
  consumes: ["channel.mobile.login", "channel.web.login"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.RISK_FEATURE_STORE_SERVICE_URL}/health`).catch((error) => ({ service: "risk-feature-store-service", error: error.message })),
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
    downstreamServices: ["risk-feature-store-service", "audit-log-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
