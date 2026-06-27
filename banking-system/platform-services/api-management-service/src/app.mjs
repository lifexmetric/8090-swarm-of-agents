import http from "node:http";

export const serviceName = "api-management-service";
export const domain = "Platform Services";
export const endpoint = "/v1/apis/routes";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  CONFIG_SERVICE_URL: process.env.CONFIG_SERVICE_URL || "http://config-service:8172",
  AUDIT_LOG_SERVICE_URL: process.env.AUDIT_LOG_SERVICE_URL || "http://audit-log-service:8174",
};

export const topics = {
  produces: ["api.route.changed"],
  consumes: ["config.policy.updated"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.CONFIG_SERVICE_URL}/health`).catch((error) => ({ service: "config-service", error: error.message })),
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
    downstreamServices: ["config-service", "audit-log-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
