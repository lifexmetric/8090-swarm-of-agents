import http from "node:http";

export const serviceName = "iam-service";
export const domain = "Identity And Access";
export const endpoint = "/v1/identity/tokens";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  MFA_SERVICE_URL: process.env.MFA_SERVICE_URL || "http://mfa-service:8111",
  DEVICE_TRUST_SERVICE_URL: process.env.DEVICE_TRUST_SERVICE_URL || "http://device-trust-service:8112",
  AUDIT_LOG_SERVICE_URL: process.env.AUDIT_LOG_SERVICE_URL || "http://audit-log-service:8174",
};

export const topics = {
  produces: ["identity.login.succeeded", "identity.login.failed"],
  consumes: ["employee.access.revoked"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.MFA_SERVICE_URL}/health`).catch((error) => ({ service: "mfa-service", error: error.message })),
    fetchImpl(`${environment.DEVICE_TRUST_SERVICE_URL}/health`).catch((error) => ({ service: "device-trust-service", error: error.message })),
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
    downstreamServices: ["mfa-service", "device-trust-service", "audit-log-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
