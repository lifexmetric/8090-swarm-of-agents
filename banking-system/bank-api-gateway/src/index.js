'use strict';

require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const http = require('http');

const authMiddleware = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Dashboard helpers ────────────────────────────────────────────────────────
const SERVICES = [
  { name: 'API Gateway',         url: `http://localhost:${PORT}`,                        health: `http://localhost:${PORT}/health`,           links: [{ label: 'Health', path: '/health' }] },
  { name: 'Auth Service',        url: process.env.AUTH_SERVICE_URL     || 'http://auth-service:8001',      health: `${process.env.AUTH_SERVICE_URL     || 'http://auth-service:8001'}/health`,      links: [{ label: 'Docs', path: '/docs' }] },
  { name: 'Accounts Service',    url: process.env.ACCOUNTS_SERVICE_URL || 'http://accounts-service:8002',  health: `${process.env.ACCOUNTS_SERVICE_URL || 'http://accounts-service:8002'}/actuator/health`, links: [{ label: 'Health', path: '/actuator/health' }] },
  { name: 'Payments Service',    url: process.env.PAYMENTS_SERVICE_URL || 'http://payments-service:8003',  health: `${process.env.PAYMENTS_SERVICE_URL || 'http://payments-service:8003'}/readiness`, links: [{ label: 'Readiness', path: '/readiness' }] },
  { name: 'Fraud Service',       url: process.env.FRAUD_SERVICE_URL    || 'http://fraud-detection-service:8004', health: `${process.env.FRAUD_SERVICE_URL || 'http://fraud-detection-service:8004'}/health`, links: [{ label: 'Docs', path: '/docs' }] },
  { name: 'Customer Service',    url: process.env.CUSTOMER_SERVICE_URL || 'http://customer-service:8005',  health: `${process.env.CUSTOMER_SERVICE_URL || 'http://customer-service:8005'}/health`,   links: [{ label: 'Health', path: '/health' }] },
  { name: 'Reporting Service',   url: process.env.REPORTING_SERVICE_URL|| 'http://reporting-service:8007', health: `${process.env.REPORTING_SERVICE_URL|| 'http://reporting-service:8007'}/health`,  links: [{ label: 'GraphQL', path: '/graphql' }] },
  { name: 'Mock SWIFT Rail',     url: 'http://mock-swift-rail:9999',                     health: 'http://mock-swift-rail:9999/health',        links: [{ label: 'Health', path: '/health' }] },
];

const INFRA = [
  { name: 'Neo4j Browser',  url: 'http://localhost:7474' },
  { name: 'Kafka (broker)', url: null, note: 'localhost:9092' },
  { name: 'PostgreSQL (auth)', url: null, note: 'localhost:5432' },
  { name: 'PostgreSQL (bank)', url: null, note: 'localhost:5433' },
  { name: 'MongoDB',        url: null, note: 'localhost:27017' },
  { name: 'Redis',          url: null, note: 'localhost:6379' },
];

function checkHealth(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? require('https') : http;
    const req = mod.get(url, { timeout: 2000 }, (res) => {
      resolve({ ok: res.statusCode < 400, status: res.statusCode });
    });
    req.on('error', () => resolve({ ok: false, status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0 }); });
  });
}

function renderDashboard(statuses) {
  const dot = (ok) => ok
    ? '<span class="dot ok"></span>'
    : '<span class="dot err"></span>';

  const serviceRows = SERVICES.map((s, i) => {
    const { ok, status } = statuses[i];
    const badge = ok ? `<span class="badge up">UP</span>` : `<span class="badge down">DOWN</span>`;
    const localUrl = s.url
      .replace('http://auth-service', 'http://localhost')
      .replace('http://accounts-service', 'http://localhost')
      .replace('http://payments-service', 'http://localhost')
      .replace('http://fraud-detection-service', 'http://localhost')
      .replace('http://customer-service', 'http://localhost')
      .replace('http://reporting-service', 'http://localhost')
      .replace('http://mock-swift-rail', 'http://localhost');
    const linkHtml = s.links.map(l =>
      `<a href="${localUrl}${l.path}" target="_blank" class="ext-link">${l.label} ↗</a>`
    ).join(' ');
    return `
      <tr>
        <td>${dot(ok)} ${s.name}</td>
        <td>${badge}</td>
        <td class="mono">${status || '—'}</td>
        <td>${linkHtml}</td>
      </tr>`;
  }).join('');

  const infraRows = INFRA.map(i => `
    <tr>
      <td>${i.name}</td>
      <td>${i.url ? `<a href="${i.url}" target="_blank" class="ext-link">${i.url} ↗</a>` : `<span class="mono">${i.note}</span>`}</td>
    </tr>`).join('');

  const upCount = statuses.filter(s => s.ok).length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="10">
  <title>Banking System — Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
    h1 { font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: .25rem; }
    .subtitle { color: #64748b; font-size: .875rem; margin-bottom: 2rem; }
    .summary { display: flex; gap: 1rem; margin-bottom: 2rem; }
    .card { background: #1e2530; border: 1px solid #2d3748; border-radius: .75rem; padding: 1rem 1.5rem; }
    .card .num { font-size: 2rem; font-weight: 700; color: #38bdf8; }
    .card .lbl { font-size: .75rem; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
    .section { margin-bottom: 2rem; }
    .section h2 { font-size: .875rem; text-transform: uppercase; letter-spacing: .08em; color: #64748b; margin-bottom: .75rem; }
    table { width: 100%; border-collapse: collapse; background: #1e2530; border: 1px solid #2d3748; border-radius: .75rem; overflow: hidden; }
    th { text-align: left; padding: .625rem 1rem; font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; color: #64748b; border-bottom: 1px solid #2d3748; background: #161b24; }
    td { padding: .75rem 1rem; font-size: .875rem; border-bottom: 1px solid #1a2035; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: .5rem; vertical-align: middle; }
    .dot.ok  { background: #22c55e; box-shadow: 0 0 6px #22c55e88; }
    .dot.err { background: #ef4444; box-shadow: 0 0 6px #ef444488; }
    .badge { display: inline-block; padding: .125rem .5rem; border-radius: 9999px; font-size: .7rem; font-weight: 600; }
    .badge.up   { background: #14532d; color: #4ade80; }
    .badge.down { background: #450a0a; color: #f87171; }
    .mono { font-family: monospace; color: #94a3b8; }
    .ext-link { color: #38bdf8; text-decoration: none; font-size: .8rem; }
    .ext-link:hover { text-decoration: underline; }
    .refresh { color: #475569; font-size: .75rem; margin-top: 1.5rem; }
    .arch-link { color: #a78bfa; }
  </style>
</head>
<body>
  <h1>🏦 Banking System Dashboard</h1>
  <p class="subtitle">Auto-refreshes every 10 seconds &nbsp;·&nbsp; CALM architecture: <a class="arch-link" href="#">calm/architecture.json</a></p>

  <div class="summary">
    <div class="card"><div class="num">${upCount}/${SERVICES.length}</div><div class="lbl">Services Up</div></div>
    <div class="card"><div class="num">${INFRA.length}</div><div class="lbl">Infra Components</div></div>
    <div class="card"><div class="num">5</div><div class="lbl">CALM Flows</div></div>
  </div>

  <div class="section">
    <h2>Application Services</h2>
    <table>
      <thead><tr><th>Service</th><th>Status</th><th>HTTP</th><th>Links</th></tr></thead>
      <tbody>${serviceRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Infrastructure</h2>
    <table>
      <thead><tr><th>Component</th><th>Endpoint</th></tr></thead>
      <tbody>${infraRows}</tbody>
    </table>
  </div>

  <p class="refresh">Page auto-refreshes every 10s. Gateway uptime: ${Math.floor(process.uptime())}s</p>
</body>
</html>`;
}

// CALM node-id → health URL (Docker-internal hostnames)
const HEALTH_SERVICES = [
  { nodeId: 'api-gateway',             health: `http://localhost:${PORT}/health` },
  { nodeId: 'auth-service',            health: `${process.env.AUTH_SERVICE_URL     || 'http://auth-service:8001'}/health` },
  { nodeId: 'accounts-service',        health: `${process.env.ACCOUNTS_SERVICE_URL || 'http://accounts-service:8002'}/actuator/health` },
  { nodeId: 'payments-service',        health: `${process.env.PAYMENTS_SERVICE_URL || 'http://payments-service:8003'}/readiness` },
  { nodeId: 'fraud-detection-service', health: `${process.env.FRAUD_SERVICE_URL    || 'http://fraud-detection-service:8004'}/health` },
  { nodeId: 'customer-service',        health: `${process.env.CUSTOMER_SERVICE_URL || 'http://customer-service:8005'}/health` },
  { nodeId: 'reporting-service',       health: `${process.env.REPORTING_SERVICE_URL|| 'http://reporting-service:8007'}/health` },
  { nodeId: 'swift-ach-rail',          health: 'http://mock-swift-rail:9999/health' },
];

function makeProxy(target, options = {}) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    on: {
      error(err, req, res) {
        console.error(`[proxy] ${req.method} ${req.path} → ${target}: ${err.message}`);
        if (!res.headersSent) res.status(502).json({ error: 'Service unavailable' });
      },
    },
    ...options,
  });
}

app.use(morgan('combined'));

// Rate limit only the authenticated API proxy routes — not health/monitoring endpoints.
// Health poller fires every 5s; dashboard auto-refreshes every 10s. Limiting those
// would starve real API requests.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute window
  max: 120,              // 120 req/min per IP on protected routes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// ── Health (unauthenticated) ─────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'api-gateway', uptime: process.uptime() })
);

// ── Dashboard (unauthenticated) ──────────────────────────────────────────────
app.get('/dashboard', async (_req, res) => {
  const statuses = await Promise.all(SERVICES.map(s => checkHealth(s.health)));
  res.setHeader('Content-Type', 'text/html');
  res.send(renderDashboard(statuses));
});

// ── Auth routes (no JWT required) ────────────────────────────────────────────
app.use('/api/auth',
  makeProxy(process.env.AUTH_SERVICE_URL || 'http://localhost:8001', {
    pathRewrite: { '^/api': '' },
  })
);

// ── Health summary (unauthenticated, CORS-open for visualizer) ───────────────
app.get('/api/health-summary', async (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = await Promise.all(
    HEALTH_SERVICES.map(async s => {
      const t0 = Date.now();
      const { ok, status } = await checkHealth(s.health);
      return { nodeId: s.nodeId, status: ok ? 'up' : 'down', latencyMs: Date.now() - t0, httpStatus: status };
    })
  );
  const services = {};
  for (const r of results) {
    services[r.nodeId] = { status: r.status, latencyMs: r.latencyMs, httpStatus: r.httpStatus };
  }
  res.json({ services, timestamp: new Date().toISOString() });
});

// ── Rate limit + JWT validation for all remaining /api/* routes ──────────────
app.use('/api', apiLimiter, authMiddleware);

// ── Protected proxies ─────────────────────────────────────────────────────────
app.use('/api/accounts',
  makeProxy(process.env.ACCOUNTS_SERVICE_URL || 'http://localhost:8002', {
    pathRewrite: { '^/api': '' },
  })
);

app.use('/api/payments',
  makeProxy(process.env.PAYMENTS_SERVICE_URL || 'http://localhost:8003', {
    pathRewrite: { '^/api': '' },
  })
);

app.use('/api/customers',
  makeProxy(process.env.CUSTOMER_SERVICE_URL || 'http://localhost:8005', {
    pathRewrite: { '^/api': '' },
  })
);

app.use('/api/reports',
  makeProxy(process.env.REPORTING_SERVICE_URL || 'http://localhost:8007', {
    pathRewrite: { '^/api/reports': '' },
  })
);

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

app.listen(PORT, () => console.log(`bank-api-gateway listening on port ${PORT}`));

module.exports = app;
