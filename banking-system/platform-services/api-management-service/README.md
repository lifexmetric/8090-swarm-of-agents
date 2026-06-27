# Api Management Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Platform Services
- Port: 8170
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/apis/routes`

## Dependencies

- config-service
- audit-log-service

## Events Produced

- `api.route.changed`

## Events Consumed

- `config.policy.updated`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build api-management-service
```
