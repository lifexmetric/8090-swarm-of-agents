'use strict';

const express = require('express');

const app = express();
const PORT = process.env.PORT || 9999;

app.use(express.json());

// Log every request
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/**
 * POST /v2/transfers
 * Simulate initiating a payment transfer.
 */
app.post('/v2/transfers', (req, res) => {
  const { amount, currency, source_account, destination_account, idempotency_key } = req.body;

  // Basic validation
  if (!amount || !currency || !source_account || !destination_account) {
    return res.status(400).json({
      error: 'Missing required fields: amount, currency, source_account, destination_account',
    });
  }

  // Simulate 100ms processing delay
  setTimeout(() => {
    const transferId = 'TXN-' + require('crypto').randomBytes(8).toString('hex').toUpperCase();

    const estimatedSettlement = new Date();
    estimatedSettlement.setDate(estimatedSettlement.getDate() + 2);

    const response = {
      transfer_id: transferId,
      status: 'processing',
      estimated_settlement: estimatedSettlement.toISOString(),
      rail: 'ACH',
    };

    console.log(
      `[${new Date().toISOString()}] Transfer initiated:`,
      JSON.stringify({
        transfer_id: transferId,
        amount,
        currency,
        source_account,
        destination_account,
        idempotency_key: idempotency_key || null,
      })
    );

    res.status(202).json(response);
  }, 100);
});

/**
 * GET /v2/transfers/:transfer_id
 * Return the status of a transfer (always "completed" in mock).
 */
app.get('/v2/transfers/:transfer_id', (req, res) => {
  const { transfer_id } = req.params;

  res.status(200).json({
    transfer_id,
    status: 'completed',
  });
});

/**
 * GET /health
 */
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'mock-swift-rail' });
});

// 404 for unknown routes
app.use((_req, res) => {
  res.status(404).json({ error: 'endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`mock-swift-rail listening on port ${PORT}`);
});
