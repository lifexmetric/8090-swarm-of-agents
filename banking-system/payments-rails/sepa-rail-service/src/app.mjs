import http from "node:http";

export const serviceName = "sepa-rail-service";
export const domain = "Payments And Rails";
export const endpoint = "/v1/rails/sepa/transfers";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  CORE_LEDGER_SERVICE_URL: process.env.CORE_LEDGER_SERVICE_URL || "http://core-ledger-service:8130",
  SANCTIONS_SCREENING_SERVICE_URL: process.env.SANCTIONS_SCREENING_SERVICE_URL || "http://sanctions-screening-service:8151",
  SETTLEMENT_SERVICE_URL: process.env.SETTLEMENT_SERVICE_URL || "http://settlement-service:8144",
};

export const topics = {
  produces: ["sepa.transfer.submitted"],
  consumes: ["payment.authorized"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.CORE_LEDGER_SERVICE_URL}/health`).catch((error) => ({ service: "core-ledger-service", error: error.message })),
    fetchImpl(`${environment.SANCTIONS_SCREENING_SERVICE_URL}/health`).catch((error) => ({ service: "sanctions-screening-service", error: error.message })),
    fetchImpl(`${environment.SETTLEMENT_SERVICE_URL}/health`).catch((error) => ({ service: "settlement-service", error: error.message })),
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
    downstreamServices: ["core-ledger-service", "sanctions-screening-service", "settlement-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
