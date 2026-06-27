# Case Management Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Risk And Compliance
- Port: 8154
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/cases`

## Dependencies

- employee-access-service
- notification-service
- audit-log-service

## Events Produced

- `case.created`
- `case.resolved`

## Events Consumed

- `aml.case.opened`
- `sanctions.hit.detected`
- `fraud.alert`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build case-management-service
```
