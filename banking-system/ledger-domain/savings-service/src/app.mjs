import http from "node:http";

export const serviceName = "savings-service";
export const domain = "Accounts And Ledger";
export const endpoint = "/v1/savings/accounts";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  CORE_LEDGER_SERVICE_URL: process.env.CORE_LEDGER_SERVICE_URL || "http://core-ledger-service:8130",
  CUSTOMER_PROFILE_SERVICE_URL: process.env.CUSTOMER_PROFILE_SERVICE_URL || "http://customer-profile-service:8120",
};

export const topics = {
  produces: ["savings.account.opened"],
  consumes: ["deposit.account.opened"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.CORE_LEDGER_SERVICE_URL}/health`).catch((error) => ({ service: "core-ledger-service", error: error.message })),
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
    downstreamServices: ["core-ledger-service", "customer-profile-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
