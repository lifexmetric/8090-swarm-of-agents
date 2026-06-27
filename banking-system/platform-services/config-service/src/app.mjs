import http from "node:http";

export const serviceName = "config-service";
export const domain = "Platform Services";
export const endpoint = "/v1/config/policies";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  SECRETS_BROKER_SERVICE_URL: process.env.SECRETS_BROKER_SERVICE_URL || "http://secrets-broker-service:8173",
  AUDIT_LOG_SERVICE_URL: process.env.AUDIT_LOG_SERVICE_URL || "http://audit-log-service:8174",
};

export const topics = {
  produces: ["config.policy.updated"],
  consumes: ["employee.access.granted"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.SECRETS_BROKER_SERVICE_URL}/health`).catch((error) => ({ service: "secrets-broker-service", error: error.message })),
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
    downstreamServices: ["secrets-broker-service", "audit-log-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
