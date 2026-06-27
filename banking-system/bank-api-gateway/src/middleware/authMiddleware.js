'use strict';

const axios = require('axios');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:4000';

/**
 * authMiddleware
 *
 * Validates a Bearer JWT by delegating to the auth-service.
 * - Missing header  → 401
 * - Auth service rejects token → 401
 * - Auth service unreachable  → 503
 * - Valid token → sets req.user and calls next()
 */
async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const response = await axios.get(`${AUTH_SERVICE_URL}/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
      // Treat any non-2xx as an error but catch it ourselves below
      validateStatus: (status) => status < 500,
    });

    if (response.status !== 200) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = response.data.user;
    next();
  } catch (err) {
    // Network-level error (ECONNREFUSED, ETIMEDOUT, etc.)
    console.error(`[authMiddleware] Auth service error: ${err.message}`);
    return res.status(503).json({ error: 'Auth service unavailable' });
  }
}

module.exports = authMiddleware;
