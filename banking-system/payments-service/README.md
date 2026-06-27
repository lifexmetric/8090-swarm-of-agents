# payments-service

Go 1.23 microservice for initiating payment transactions in the banking system. Runs on port **8003**.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| POST | /payments | Initiate a new payment |
| GET | /payments/:id | Retrieve a payment by ID |

## POST /payments — request body

```json
{
  "source_account": "ACC-001",
  "destination_account": "ACC-002",
  "amount": 1500.00,
  "currency": "USD",
  "idempotency_key": "unique-client-key-123"
}
```

Responses:
- `201 Created` — payment completed successfully (SWIFT rail accepted).
- `500 Internal Server Error` — SWIFT rail rejected or is unreachable; body contains the payment record with `status: "failed"` and `error_message`.

## Flow

1. Check idempotency key — return existing payment if already processed.
2. Write `payment_orders` row to PostgreSQL with `status=pending`.
3. Publish `payment.initiated` to Kafka.
4. Call SWIFT/ACH rail at `POST /v2/transfers` (synchronous).
5. On success: update status to `completed`, publish `payment.completed`, return 201.
6. On failure: update status to `failed`, publish `payment.failed`, return 500.

## CRITICAL: SWIFT rail path

The SWIFT rail is called at **`/v2/transfers`** (see `internal/swift/client.go`).

> **Breaking change warning:** Changing this path to `/v3/transfers` or any other value will cause all payments to fail with a 404 from the rail service. Do not modify this path without a coordinated rail-side migration.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 8003 | HTTP listen port |
| POSTGRES_BANK_HOST | localhost | PostgreSQL host |
| POSTGRES_BANK_PORT | 5433 | PostgreSQL port |
| POSTGRES_BANK_DB | bank_db | Database name |
| POSTGRES_BANK_USER | bank_user | Database user |
| POSTGRES_BANK_PASSWORD | bank_password | Database password |
| KAFKA_BOOTSTRAP_SERVERS | localhost:9092 | Kafka broker addresses (comma-separated) |
| KAFKA_TOPIC_PAYMENT_INITIATED | payment.initiated | Topic for initiated events |
| KAFKA_TOPIC_PAYMENT_COMPLETED | payment.completed | Topic for completed events |
| KAFKA_TOPIC_PAYMENT_FAILED | payment.failed | Topic for failed events |
| SWIFT_RAIL_URL | http://localhost:9999 | Base URL for SWIFT/ACH rail |
| SWIFT_RAIL_API_KEY | (empty) | API key sent as X-API-Key header |

## Running locally

```bash
go mod tidy
go run ./cmd/server
```

## Docker

```bash
docker build -t payments-service .
docker run -p 8003:8003 --env-file .env payments-service
```

## Database migration

```bash
psql "$DATABASE_URL" -f migrations/001_create_payments.sql
```
