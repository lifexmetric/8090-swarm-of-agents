import http from "node:http";

export const serviceName = "apac-routing-service";
export const domain = "Regionalization";
export const endpoint = "/v1/regions/apac/routes";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  SWIFT_RAIL_URL: process.env.SWIFT_RAIL_URL || "http://mock-swift-rail:9999",
  SANCTIONS_SCREENING_SERVICE_URL: process.env.SANCTIONS_SCREENING_SERVICE_URL || "http://sanctions-screening-service:8151",
  RTP_RAIL_SERVICE_URL: process.env.RTP_RAIL_SERVICE_URL || "http://rtp-rail-service:8142",
};

export const topics = {
  produces: ["region.apac.routed"],
  consumes: ["partner.request.received"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.SWIFT_RAIL_URL}/health`).catch((error) => ({ service: "swift-rail-service", error: error.message })),
    fetchImpl(`${environment.SANCTIONS_SCREENING_SERVICE_URL}/health`).catch((error) => ({ service: "sanctions-screening-service", error: error.message })),
    fetchImpl(`${environment.RTP_RAIL_SERVICE_URL}/health`).catch((error) => ({ service: "rtp-rail-service", error: error.message })),
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
    downstreamServices: ["swift-rail-service", "sanctions-screening-service", "rtp-rail-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
