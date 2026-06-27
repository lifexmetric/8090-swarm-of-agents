import http from "node:http";

export const serviceName = "settlement-service";
export const domain = "Payments And Rails";
export const endpoint = "/v1/settlement/batches";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  CORE_LEDGER_SERVICE_URL: process.env.CORE_LEDGER_SERVICE_URL || "http://core-ledger-service:8130",
  RECONCILIATION_SERVICE_URL: process.env.RECONCILIATION_SERVICE_URL || "http://reconciliation-service:8145",
};

export const topics = {
  produces: ["settlement.batch.created"],
  consumes: ["ach.transfer.submitted", "sepa.transfer.submitted", "rtp.transfer.submitted"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.CORE_LEDGER_SERVICE_URL}/health`).catch((error) => ({ service: "core-ledger-service", error: error.message })),
    fetchImpl(`${environment.RECONCILIATION_SERVICE_URL}/health`).catch((error) => ({ service: "reconciliation-service", error: error.message })),
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
    downstreamServices: ["core-ledger-service", "reconciliation-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
