# Loan Servicing Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Accounts And Ledger
- Port: 8134
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/loans/accounts`

## Dependencies

- core-ledger-service
- risk-feature-store-service

## Events Produced

- `loan.payment.due`

## Events Consumed

- `ledger.entry.posted`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build loan-servicing-service
```
