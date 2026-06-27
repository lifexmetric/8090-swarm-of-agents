import http from "node:http";

export const serviceName = "loan-servicing-service";
export const domain = "Accounts And Ledger";
export const endpoint = "/v1/loans/accounts";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  CORE_LEDGER_SERVICE_URL: process.env.CORE_LEDGER_SERVICE_URL || "http://core-ledger-service:8130",
  RISK_FEATURE_STORE_SERVICE_URL: process.env.RISK_FEATURE_STORE_SERVICE_URL || "http://risk-feature-store-service:8162",
};

export const topics = {
  produces: ["loan.payment.due"],
  consumes: ["ledger.entry.posted"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.CORE_LEDGER_SERVICE_URL}/health`).catch((error) => ({ service: "core-ledger-service", error: error.message })),
    fetchImpl(`${environment.RISK_FEATURE_STORE_SERVICE_URL}/health`).catch((error) => ({ service: "risk-feature-store-service", error: error.message })),
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
    downstreamServices: ["core-ledger-service", "risk-feature-store-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
