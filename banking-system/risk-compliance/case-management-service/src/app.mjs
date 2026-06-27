import http from "node:http";

export const serviceName = "case-management-service";
export const domain = "Risk And Compliance";
export const endpoint = "/v1/cases";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  EMPLOYEE_ACCESS_SERVICE_URL: process.env.EMPLOYEE_ACCESS_SERVICE_URL || "http://employee-access-service:8114",
  NOTIFICATION_SERVICE_URL: process.env.NOTIFICATION_SERVICE_URL || "http://notification-service:8006",
  AUDIT_LOG_SERVICE_URL: process.env.AUDIT_LOG_SERVICE_URL || "http://audit-log-service:8174",
};

export const topics = {
  produces: ["case.created", "case.resolved"],
  consumes: ["aml.case.opened", "sanctions.hit.detected", "fraud.alert"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.EMPLOYEE_ACCESS_SERVICE_URL}/health`).catch((error) => ({ service: "employee-access-service", error: error.message })),
    fetchImpl(`${environment.NOTIFICATION_SERVICE_URL}/health`).catch((error) => ({ service: "notification-service", error: error.message })),
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
    downstreamServices: ["employee-access-service", "notification-service", "audit-log-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
