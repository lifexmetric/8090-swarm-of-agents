import http from "node:http";

export const serviceName = "mortgage-service";
export const domain = "Accounts And Ledger";
export const endpoint = "/v1/mortgages/applications";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  CUSTOMER_PROFILE_SERVICE_URL: process.env.CUSTOMER_PROFILE_SERVICE_URL || "http://customer-profile-service:8120",
  RISK_FEATURE_STORE_SERVICE_URL: process.env.RISK_FEATURE_STORE_SERVICE_URL || "http://risk-feature-store-service:8162",
  DOCUMENT_VERIFICATION_SERVICE_URL: process.env.DOCUMENT_VERIFICATION_SERVICE_URL || "http://document-verification-service:8122",
};

export const topics = {
  produces: ["mortgage.application.created"],
  consumes: ["document.verification.completed"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.CUSTOMER_PROFILE_SERVICE_URL}/health`).catch((error) => ({ service: "customer-profile-service", error: error.message })),
    fetchImpl(`${environment.RISK_FEATURE_STORE_SERVICE_URL}/health`).catch((error) => ({ service: "risk-feature-store-service", error: error.message })),
    fetchImpl(`${environment.DOCUMENT_VERIFICATION_SERVICE_URL}/health`).catch((error) => ({ service: "document-verification-service", error: error.message })),
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
    downstreamServices: ["customer-profile-service", "risk-feature-store-service", "document-verification-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
