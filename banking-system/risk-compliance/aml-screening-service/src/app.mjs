import http from "node:http";

export const serviceName = "aml-screening-service";
export const domain = "Risk And Compliance";
export const endpoint = "/v1/screening/aml";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  TRANSACTION_MONITORING_SERVICE_URL: process.env.TRANSACTION_MONITORING_SERVICE_URL || "http://transaction-monitoring-service:8152",
  CASE_MANAGEMENT_SERVICE_URL: process.env.CASE_MANAGEMENT_SERVICE_URL || "http://case-management-service:8154",
};

export const topics = {
  produces: ["aml.screening.completed", "aml.case.opened"],
  consumes: ["payment.authorized", "kyc.customer.started"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.TRANSACTION_MONITORING_SERVICE_URL}/health`).catch((error) => ({ service: "transaction-monitoring-service", error: error.message })),
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
    downstreamServices: ["transaction-monitoring-service", "case-management-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
