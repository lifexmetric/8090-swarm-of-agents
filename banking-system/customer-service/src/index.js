require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const { connect } = require('./db/mongodb');
const customersRouter = require('./routes/customers');

const PORT = process.env.PORT || 8005;

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(morgan('combined'));
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'customer-service' });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/customers', customersRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Error]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
  });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function start() {
  try {
    await connect();
    app.listen(PORT, () => {
      console.log(`[customer-service] Listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('[customer-service] Startup failed:', err.message);
    process.exit(1);
  }
}

start();
