import http from "node:http";

export const serviceName = "reporting-marts-service";
export const domain = "Data And Analytics";
export const endpoint = "/v1/reporting/marts";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  EVENT_WAREHOUSE_SERVICE_URL: process.env.EVENT_WAREHOUSE_SERVICE_URL || "http://event-warehouse-service:8161",
  REGULATORY_REPORTING_SERVICE_URL: process.env.REGULATORY_REPORTING_SERVICE_URL || "http://regulatory-reporting-service:8155",
};

export const topics = {
  produces: ["reporting.mart.refreshed"],
  consumes: ["warehouse.fact.loaded", "regulatory.report.filed"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.EVENT_WAREHOUSE_SERVICE_URL}/health`).catch((error) => ({ service: "event-warehouse-service", error: error.message })),
    fetchImpl(`${environment.REGULATORY_REPORTING_SERVICE_URL}/health`).catch((error) => ({ service: "regulatory-reporting-service", error: error.message })),
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
    downstreamServices: ["event-warehouse-service", "regulatory-reporting-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
