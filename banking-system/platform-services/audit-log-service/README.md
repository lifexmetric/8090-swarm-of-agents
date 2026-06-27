# Audit Log Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Platform Services
- Port: 8174
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/audit/events`

## Dependencies

- event-warehouse-service

## Events Produced

- `audit.event.recorded`

## Events Consumed

- `identity.login.succeeded`
- `ledger.entry.posted`
- `case.created`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build audit-log-service
```
