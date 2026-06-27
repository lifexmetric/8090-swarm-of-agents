import http from "node:http";

export const serviceName = "mobile-banking-service";
export const domain = "Channels";
export const endpoint = "/v1/mobile/sessions";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  API_MANAGEMENT_SERVICE_URL: process.env.API_MANAGEMENT_SERVICE_URL || "http://api-management-service:8170",
  IAM_SERVICE_URL: process.env.IAM_SERVICE_URL || "http://iam-service:8110",
  CUSTOMER_PROFILE_SERVICE_URL: process.env.CUSTOMER_PROFILE_SERVICE_URL || "http://customer-profile-service:8120",
  ACCOUNTS_SERVICE_URL: process.env.ACCOUNTS_SERVICE_URL || "http://accounts-service:8002",
};

export const topics = {
  produces: ["channel.mobile.login"],
  consumes: ["fraud.alert"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.API_MANAGEMENT_SERVICE_URL}/health`).catch((error) => ({ service: "api-management-service", error: error.message })),
    fetchImpl(`${environment.IAM_SERVICE_URL}/health`).catch((error) => ({ service: "iam-service", error: error.message })),
    fetchImpl(`${environment.CUSTOMER_PROFILE_SERVICE_URL}/health`).catch((error) => ({ service: "customer-profile-service", error: error.message })),
    fetchImpl(`${environment.ACCOUNTS_SERVICE_URL}/health`).catch((error) => ({ service: "accounts-service", error: error.message })),
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
    downstreamServices: ["api-management-service", "iam-service", "customer-profile-service", "accounts-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
