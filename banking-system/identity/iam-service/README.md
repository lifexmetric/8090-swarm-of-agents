# Iam Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Identity And Access
- Port: 8110
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/identity/tokens`

## Dependencies

- mfa-service
- device-trust-service
- audit-log-service

## Events Produced

- `identity.login.succeeded`
- `identity.login.failed`

## Events Consumed

- `employee.access.revoked`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build iam-service
```
