# Regulatory Reporting Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Risk And Compliance
- Port: 8155
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/regulatory/reports`

## Dependencies

- reporting-marts-service
- audit-log-service

## Events Produced

- `regulatory.report.filed`

## Events Consumed

- `case.resolved`
- `reconciliation.completed`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build regulatory-reporting-service
```
