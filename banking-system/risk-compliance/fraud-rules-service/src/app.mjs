import http from "node:http";

export const serviceName = "fraud-rules-service";
export const domain = "Risk And Compliance";
export const endpoint = "/v1/fraud/rules/evaluate";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  RISK_FEATURE_STORE_SERVICE_URL: process.env.RISK_FEATURE_STORE_SERVICE_URL || "http://risk-feature-store-service:8162",
  CASE_MANAGEMENT_SERVICE_URL: process.env.CASE_MANAGEMENT_SERVICE_URL || "http://case-management-service:8154",
};

export const topics = {
  produces: ["fraud.alert"],
  consumes: ["session.risk.scored", "card.authorization.approved"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.RISK_FEATURE_STORE_SERVICE_URL}/health`).catch((error) => ({ service: "risk-feature-store-service", error: error.message })),
    fetchImpl(`${environment.CASE_MANAGEMENT_SERVICE_URL}/health`).catch((error) => ({ service: "case-management-service", error: error.message })),
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
    downstreamServices: ["risk-feature-store-service", "case-management-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
