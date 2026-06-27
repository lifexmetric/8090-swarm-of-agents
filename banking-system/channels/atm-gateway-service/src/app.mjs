import http from "node:http";

export const serviceName = "atm-gateway-service";
export const domain = "Channels";
export const endpoint = "/v1/atm/withdrawals";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  CORE_LEDGER_SERVICE_URL: process.env.CORE_LEDGER_SERVICE_URL || "http://core-ledger-service:8130",
  CARD_AUTHORIZATION_SERVICE_URL: process.env.CARD_AUTHORIZATION_SERVICE_URL || "http://card-authorization-service:8143",
  SESSION_RISK_SERVICE_URL: process.env.SESSION_RISK_SERVICE_URL || "http://session-risk-service:8113",
};

export const topics = {
  produces: ["atm.withdrawal.requested"],
  consumes: ["ledger.entry.posted"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.CORE_LEDGER_SERVICE_URL}/health`).catch((error) => ({ service: "core-ledger-service", error: error.message })),
    fetchImpl(`${environment.CARD_AUTHORIZATION_SERVICE_URL}/health`).catch((error) => ({ service: "card-authorization-service", error: error.message })),
    fetchImpl(`${environment.SESSION_RISK_SERVICE_URL}/health`).catch((error) => ({ service: "session-risk-service", error: error.message })),
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
    downstreamServices: ["core-ledger-service", "card-authorization-service", "session-risk-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
