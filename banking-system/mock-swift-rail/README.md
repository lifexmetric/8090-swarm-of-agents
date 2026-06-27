# mock-swift-rail

A lightweight Express server (port **9999**) that simulates an external SWIFT/ACH payment rail for local development and integration testing. It does **not** move real money; all responses are mocked.

---

## Breaking-Change Scenario

The `payments-service` currently calls `POST /v2/transfers` on this rail.

**If the path is changed to `/v3/transfers`** (e.g. to simulate a rail version upgrade), every payment initiated by `payments-service` will receive a `404 endpoint not found` response. This causes all payment creation requests to fail, surfacing as 5xx errors on the API gateway and failed transactions in the database — with no obvious error unless you trace the outbound HTTP call.

Use this scenario to test how the system handles downstream rail failures and whether circuit-breaker / retry logic behaves correctly.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v2/transfers` | Initiate a new transfer (102 ms simulated delay) |
| `GET` | `/v2/transfers/:transfer_id` | Poll transfer status (always returns `completed`) |
| `GET` | `/health` | Health check |

### POST /v2/transfers

**Request body**

```json
{
  "amount": 500.00,
  "currency": "USD",
  "source_account": "ACC-001",
  "destination_account": "ACC-002",
  "idempotency_key": "unique-client-key-123"
}
```

**Response 202**

```json
{
  "transfer_id": "TXN-A1B2C3D4E5F6G7H8",
  "status": "processing",
  "estimated_settlement": "2026-06-28T12:00:00.000Z",
  "rail": "ACH"
}
```

### GET /v2/transfers/:transfer_id

**Response 200**

```json
{
  "transfer_id": "TXN-A1B2C3D4E5F6G7H8",
  "status": "completed"
}
```

### GET /health

**Response 200**

```json
{ "status": "ok", "service": "mock-swift-rail" }
```

---

## Running locally

```bash
npm install
npm start
# Server starts on http://localhost:9999
```

## Docker

```bash
docker build -t mock-swift-rail .
docker run -p 9999:9999 mock-swift-rail
```
