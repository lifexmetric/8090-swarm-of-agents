# Secrets Broker Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Platform Services
- Port: 8173
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/secrets/leases`

## Dependencies

- audit-log-service

## Events Produced

- `secret.lease.issued`

## Events Consumed

- `config.policy.updated`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build secrets-broker-service
```
