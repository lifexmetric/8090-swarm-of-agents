import http from "node:http";

export const serviceName = "americas-routing-service";
export const domain = "Regionalization";
export const endpoint = "/v1/regions/americas/routes";

export const environment = {
  KAFKA_BOOTSTRAP_SERVERS: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092",
  REDIS_URL: process.env.REDIS_URL || "redis://redis:6379",
  ACH_RAIL_SERVICE_URL: process.env.ACH_RAIL_SERVICE_URL || "http://ach-rail-service:8140",
  RTP_RAIL_SERVICE_URL: process.env.RTP_RAIL_SERVICE_URL || "http://rtp-rail-service:8142",
  CARD_AUTHORIZATION_SERVICE_URL: process.env.CARD_AUTHORIZATION_SERVICE_URL || "http://card-authorization-service:8143",
};

export const topics = {
  produces: ["region.americas.routed"],
  consumes: ["partner.request.received"],
};

export async function callCriticalDependencies(fetchImpl = fetch) {
  return Promise.all([
    fetchImpl(`${environment.ACH_RAIL_SERVICE_URL}/health`).catch((error) => ({ service: "ach-rail-service", error: error.message })),
    fetchImpl(`${environment.RTP_RAIL_SERVICE_URL}/health`).catch((error) => ({ service: "rtp-rail-service", error: error.message })),
    fetchImpl(`${environment.CARD_AUTHORIZATION_SERVICE_URL}/health`).catch((error) => ({ service: "card-authorization-service", error: error.message })),
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
    downstreamServices: ["ach-rail-service", "rtp-rail-service", "card-authorization-service"],
  };
}

export function createRouteHint() {
  return http.METHODS.includes("POST") ? endpoint : "/health";
}
