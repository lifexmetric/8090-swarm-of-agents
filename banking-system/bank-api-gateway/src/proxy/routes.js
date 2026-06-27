'use strict';

const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * setupRoutes(app)
 *
 * Registers all downstream service proxies on the Express app.
 * Each proxy strips the /api prefix before forwarding.
 */
function setupRoutes(app) {
  // ── Helper: build a proxy with a consistent error handler ──────────────────
  function makeProxy(target, options = {}) {
    return createProxyMiddleware({
      target,
      changeOrigin: true,
      on: {
        error(err, req, res) {
          console.error(
            `[proxy] Error forwarding ${req.method} ${req.path} to ${target}: ${err.message}`
          );
          if (!res.headersSent) {
            res.status(502).json({ error: 'Service unavailable' });
          }
        },
      },
      ...options,
    });
  }

  // ── Auth service (no JWT check — mounted before authMiddleware) ────────────
  app.use(
    '/api/auth',
    makeProxy(process.env.AUTH_SERVICE_URL || 'http://localhost:4000', {
      pathRewrite: { '^/api': '' },
    })
  );

  // ── Accounts service ───────────────────────────────────────────────────────
  app.use(
    '/api/accounts',
    makeProxy(process.env.ACCOUNTS_SERVICE_URL || 'http://localhost:4001', {
      pathRewrite: { '^/api': '' },
    })
  );

  // ── Payments service ───────────────────────────────────────────────────────
  app.use(
    '/api/payments',
    makeProxy(process.env.PAYMENTS_SERVICE_URL || 'http://localhost:4002', {
      pathRewrite: { '^/api': '' },
    })
  );

  // ── Customer service ───────────────────────────────────────────────────────
  app.use(
    '/api/customers',
    makeProxy(process.env.CUSTOMER_SERVICE_URL || 'http://localhost:4003', {
      pathRewrite: { '^/api': '' },
    })
  );

  // ── Reporting service (GraphQL — preserve /graphql path) ──────────────────
  app.use(
    '/api/reports',
    makeProxy(process.env.REPORTING_SERVICE_URL || 'http://localhost:4004', {
      // Do NOT rewrite — the downstream service exposes /graphql directly
      // and /api/reports/graphql should reach /graphql on the target
      pathRewrite: { '^/api/reports': '' },
    })
  );
}

module.exports = { setupRoutes };
