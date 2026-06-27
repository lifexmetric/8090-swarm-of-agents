# Employee Access Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Identity And Access
- Port: 8114
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/employees/access`

## Dependencies

- iam-service
- audit-log-service

## Events Produced

- `employee.access.granted`
- `employee.access.revoked`

## Events Consumed

- `config.policy.updated`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build employee-access-service
```
