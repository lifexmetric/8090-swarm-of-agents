import http from "node:http";

export const serviceName = "partner-api-service";
export const domain = "Channels";
export const endpoint = "/v1/partners/requests";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  API_MANAGEMENT_SERVICE_URL: process.env.API_MANAGEMENT_SERVICE_URL || "http://api-management-service:8170",
  CONSENT_SERVICE_URL: process.env.CONSENT_SERVICE_URL || "http://consent-service:8123",
  CUSTOMER_PROFILE_SERVICE_URL: process.env.CUSTOMER_PROFILE_SERVICE_URL || "http://customer-profile-service:8120",
};

export const topics = {
  produces: ["partner.request.received"],
  consumes: ["consent.revoked"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.API_MANAGEMENT_SERVICE_URL}/health`).catch((error) => ({ service: "api-management-service", error: error.message })),
    fetchImpl(`${environment.CONSENT_SERVICE_URL}/health`).catch((error) => ({ service: "consent-service", error: error.message })),
    fetchImpl(`${environment.CUSTOMER_PROFILE_SERVICE_URL}/health`).catch((error) => ({ service: "customer-profile-service", error: error.message })),
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
    downstreamServices: ["api-management-service", "consent-service", "customer-profile-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
