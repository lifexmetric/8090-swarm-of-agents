# Config Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Platform Services
- Port: 8172
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/config/policies`

## Dependencies

- secrets-broker-service
- audit-log-service

## Events Produced

- `config.policy.updated`

## Events Consumed

- `employee.access.granted`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build config-service
```
