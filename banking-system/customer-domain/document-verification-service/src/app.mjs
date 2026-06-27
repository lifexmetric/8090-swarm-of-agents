import http from "node:http";

export const serviceName = "document-verification-service";
export const domain = "Customer And CRM";
export const endpoint = "/v1/documents/verification";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  AUDIT_LOG_SERVICE_URL: process.env.AUDIT_LOG_SERVICE_URL || "http://audit-log-service:8174",
  SECRETS_BROKER_SERVICE_URL: process.env.SECRETS_BROKER_SERVICE_URL || "http://secrets-broker-service:8173",
};

export const topics = {
  produces: ["document.verification.completed"],
  consumes: ["kyc.customer.started"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.AUDIT_LOG_SERVICE_URL}/health`).catch((error) => ({ service: "audit-log-service", error: error.message })),
    fetchImpl(`${environment.SECRETS_BROKER_SERVICE_URL}/health`).catch((error) => ({ service: "secrets-broker-service", error: error.message })),
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
    downstreamServices: ["audit-log-service", "secrets-broker-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
