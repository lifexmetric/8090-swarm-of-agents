# Ach Rail Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Payments And Rails
- Port: 8140
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/rails/ach/transfers`

## Dependencies

- core-ledger-service
- aml-screening-service
- settlement-service

## Events Produced

- `ach.transfer.submitted`

## Events Consumed

- `payment.authorized`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build ach-rail-service
```
