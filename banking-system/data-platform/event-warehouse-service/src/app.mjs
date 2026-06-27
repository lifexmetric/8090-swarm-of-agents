import http from "node:http";

export const serviceName = "event-warehouse-service";
export const domain = "Data And Analytics";
export const endpoint = "/v1/warehouse/events";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  DATA_LAKE_INGESTION_SERVICE_URL: process.env.DATA_LAKE_INGESTION_SERVICE_URL || "http://data-lake-ingestion-service:8160",
};

export const topics = {
  produces: ["warehouse.fact.loaded"],
  consumes: ["data.lake.object.created"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.DATA_LAKE_INGESTION_SERVICE_URL}/health`).catch((error) => ({ service: "data-lake-ingestion-service", error: error.message })),
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
    downstreamServices: ["data-lake-ingestion-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
