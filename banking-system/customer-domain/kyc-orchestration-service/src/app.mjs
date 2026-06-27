import http from "node:http";

export const serviceName = "kyc-orchestration-service";
export const domain = "Customer And CRM";
export const endpoint = "/v1/kyc/checks";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  DOCUMENT_VERIFICATION_SERVICE_URL: process.env.DOCUMENT_VERIFICATION_SERVICE_URL || "http://document-verification-service:8122",
  AML_SCREENING_SERVICE_URL: process.env.AML_SCREENING_SERVICE_URL || "http://aml-screening-service:8150",
  SANCTIONS_SCREENING_SERVICE_URL: process.env.SANCTIONS_SCREENING_SERVICE_URL || "http://sanctions-screening-service:8151",
};

export const topics = {
  produces: ["kyc.customer.started", "kyc.customer.verified"],
  consumes: ["customer.profile.updated"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.DOCUMENT_VERIFICATION_SERVICE_URL}/health`).catch((error) => ({ service: "document-verification-service", error: error.message })),
    fetchImpl(`${environment.AML_SCREENING_SERVICE_URL}/health`).catch((error) => ({ service: "aml-screening-service", error: error.message })),
    fetchImpl(`${environment.SANCTIONS_SCREENING_SERVICE_URL}/health`).catch((error) => ({ service: "sanctions-screening-service", error: error.message })),
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
    downstreamServices: ["document-verification-service", "aml-screening-service", "sanctions-screening-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
