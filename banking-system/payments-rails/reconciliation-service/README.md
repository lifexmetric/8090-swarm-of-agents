# Reconciliation Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Payments And Rails
- Port: 8145
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/reconciliation/runs`

## Dependencies

- event-warehouse-service
- audit-log-service

## Events Produced

- `reconciliation.completed`

## Events Consumed

- `settlement.batch.created`
- `ledger.entry.posted`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build reconciliation-service
```
