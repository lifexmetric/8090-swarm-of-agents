# Data Lake Ingestion Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Data And Analytics
- Port: 8160
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/data-lake/ingest`

## Dependencies

- audit-log-service
- secrets-broker-service

## Events Produced

- `data.lake.object.created`

## Events Consumed

- `ledger.entry.posted`
- `customer.profile.updated`
- `payment.authorized`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build data-lake-ingestion-service
```
