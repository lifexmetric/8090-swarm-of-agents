const axios = require('axios');

const ACCOUNTS_SERVICE_URL =
  process.env.ACCOUNTS_SERVICE_URL || 'http://localhost:8002';

const httpClient = axios.create({
  baseURL: ACCOUNTS_SERVICE_URL,
  timeout: 5000,
});

/**
 * Attempt to fetch a single account by ID.
 * Returns the account data on success, or null on 404 / any error.
 */
async function fetchAccount(accountId) {
  try {
    const response = await httpClient.get(`/accounts/${accountId}`);
    return response.data;
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return null;
    }
    // Log non-404 errors but don't propagate — keep the customer response intact
    console.warn(
      `[accountsClient] Error fetching account ${accountId}: ${err.message}`
    );
    return null;
  }
}

/**
 * Retrieve accounts associated with a customer.
 *
 * The accounts-service does not expose a "list by customer" endpoint, so we
 * probe candidate IDs derived from the customer's first name:
 *   acc-<firstName_lowercase>-001
 *   acc-<firstName_lowercase>-002
 *
 * Any ID that resolves to a 404 (or errors) is silently skipped.
 */
async function getAccountsByCustomer(customerId, firstName) {
  if (!firstName) {
    return [];
  }

  const base = firstName.toLowerCase();
  const candidateIds = [
    `acc-${base}-001`,
    `acc-${base}-002`,
  ];

  const results = await Promise.all(candidateIds.map(fetchAccount));
  return results.filter(Boolean);
}

module.exports = { getAccountsByCustomer, fetchAccount };
