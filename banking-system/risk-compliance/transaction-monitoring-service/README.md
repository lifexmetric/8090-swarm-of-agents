# Transaction Monitoring Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Risk And Compliance
- Port: 8152
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/monitoring/transactions`

## Dependencies

- risk-feature-store-service
- case-management-service

## Events Produced

- `transaction.monitoring.alert`

## Events Consumed

- `ledger.entry.posted`
- `payment.authorized`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build transaction-monitoring-service
```
