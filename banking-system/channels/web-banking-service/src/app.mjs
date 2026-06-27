import http from "node:http";

export const serviceName = "web-banking-service";
export const domain = "Channels";
export const endpoint = "/v1/web/sessions";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  API_MANAGEMENT_SERVICE_URL: process.env.API_MANAGEMENT_SERVICE_URL || "http://api-management-service:8170",
  IAM_SERVICE_URL: process.env.IAM_SERVICE_URL || "http://iam-service:8110",
  CUSTOMER_PROFILE_SERVICE_URL: process.env.CUSTOMER_PROFILE_SERVICE_URL || "http://customer-profile-service:8120",
  PAYMENTS_SERVICE_URL: process.env.PAYMENTS_SERVICE_URL || "http://payments-service:8003",
};

export const topics = {
  produces: ["channel.web.login"],
  consumes: ["customer.preference.updated"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.API_MANAGEMENT_SERVICE_URL}/health`).catch((error) => ({ service: "api-management-service", error: error.message })),
    fetchImpl(`${environment.IAM_SERVICE_URL}/health`).catch((error) => ({ service: "iam-service", error: error.message })),
    fetchImpl(`${environment.CUSTOMER_PROFILE_SERVICE_URL}/health`).catch((error) => ({ service: "customer-profile-service", error: error.message })),
    fetchImpl(`${environment.PAYMENTS_SERVICE_URL}/health`).catch((error) => ({ service: "payments-service", error: error.message })),
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
    downstreamServices: ["api-management-service", "iam-service", "customer-profile-service", "payments-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
