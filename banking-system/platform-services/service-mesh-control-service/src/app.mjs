import http from "node:http";

export const serviceName = "service-mesh-control-service";
export const domain = "Platform Services";
export const endpoint = "/v1/mesh/routes";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  CONFIG_SERVICE_URL: process.env.CONFIG_SERVICE_URL || "http://config-service:8172",
  OBSERVABILITY_COLLECTOR_SERVICE_URL: process.env.OBSERVABILITY_COLLECTOR_SERVICE_URL || "http://observability-collector-service:8175",
};

export const topics = {
  produces: ["mesh.route.changed"],
  consumes: ["api.route.changed"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.CONFIG_SERVICE_URL}/health`).catch((error) => ({ service: "config-service", error: error.message })),
    fetchImpl(`${environment.OBSERVABILITY_COLLECTOR_SERVICE_URL}/health`).catch((error) => ({ service: "observability-collector-service", error: error.message })),
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
    downstreamServices: ["config-service", "observability-collector-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
