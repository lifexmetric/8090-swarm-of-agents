# Reporting Marts Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Data And Analytics
- Port: 8163
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/reporting/marts`

## Dependencies

- event-warehouse-service
- regulatory-reporting-service

## Events Produced

- `reporting.mart.refreshed`

## Events Consumed

- `warehouse.fact.loaded`
- `regulatory.report.filed`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build reporting-marts-service
```
