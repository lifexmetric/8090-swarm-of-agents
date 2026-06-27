import http from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const config = JSON.parse(await readFile(new URL("./service.config.json", import.meta.url), "utf8"));
const port = Number(process.env.PORT || config.port || 8080);

function send(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return { raw: Buffer.concat(chunks).toString("utf8") };
  }
}

function fakeRecord(kind, extra = {}) {
  return {
    id: randomUUID(),
    service: config.name,
    domain: config.domain,
    kind,
    status: "synthetic",
    currency: "USD",
    amount: Number((Math.random() * 2500 + 25).toFixed(2)),
    region: config.region || "global",
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

async function downstreamChecks() {
  const results = [];
  for (const dep of config.dependencies || []) {
    const url = process.env[dep.env] || dep.url;
    const healthUrl = url.replace(/\/$/, "") + "/health";
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(600) });
      results.push({ service: dep.name, env: dep.env, url, ok: response.ok, status: response.status });
    } catch (error) {
      results.push({ service: dep.name, env: dep.env, url, ok: false, error: error.message });
    }
  }
  return results;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, { status: "ok", service: config.name, domain: config.domain, uptime: process.uptime() });
  }

  if (req.method === "GET" && url.pathname === "/metadata") {
    return send(res, 200, { ...config, env: config.dependencies?.map((dep) => ({ name: dep.name, env: dep.env, value: process.env[dep.env] || dep.url })) });
  }

  if (req.method === "GET" && url.pathname === "/v1/events") {
    return send(res, 200, { service: config.name, produces: config.topicsProduced, consumes: config.topicsConsumed, broker: process.env.KAFKA_BOOTSTRAP_SERVERS || "kafka:29092" });
  }

  if (req.method === "GET" && url.pathname === "/v1/downstream-checks") {
    return send(res, 200, { service: config.name, checks: await downstreamChecks() });
  }

  if (url.pathname === config.endpoint && req.method === "GET") {
    return send(res, 200, { data: [fakeRecord("summary"), fakeRecord("detail")], dependencies: config.dependencies?.map((dep) => dep.name) || [] });
  }

  if (url.pathname === config.endpoint && req.method === "POST") {
    return send(res, 202, fakeRecord("accepted-request", { request: await readBody(req), emittedTopics: config.topicsProduced }));
  }

  return send(res, 404, { error: "not_found", service: config.name, available: ["/health", "/metadata", "/v1/events", "/v1/downstream-checks", config.endpoint] });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`${config.name} listening on ${port}`);
});
