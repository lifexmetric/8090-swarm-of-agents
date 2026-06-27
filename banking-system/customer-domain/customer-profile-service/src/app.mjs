import http from "node:http";

export const serviceName = "customer-profile-service";
export const domain = "Customer And CRM";
export const endpoint = "/v1/customers/profile";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  CONSENT_SERVICE_URL: process.env.CONSENT_SERVICE_URL || "http://consent-service:8123",
  CUSTOMER_PREFERENCES_SERVICE_URL: process.env.CUSTOMER_PREFERENCES_SERVICE_URL || "http://customer-preferences-service:8124",
};

export const topics = {
  produces: ["customer.profile.updated"],
  consumes: ["kyc.customer.verified"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.CONSENT_SERVICE_URL}/health`).catch((error) => ({ service: "consent-service", error: error.message })),
    fetchImpl(`${environment.CUSTOMER_PREFERENCES_SERVICE_URL}/health`).catch((error) => ({ service: "customer-preferences-service", error: error.message })),
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
    downstreamServices: ["consent-service", "customer-preferences-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
