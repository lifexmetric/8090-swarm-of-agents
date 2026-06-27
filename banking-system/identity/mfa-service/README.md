# Mfa Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Identity And Access
- Port: 8111
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/mfa/challenges`

## Dependencies

- notification-service
- audit-log-service

## Events Produced

- `mfa.challenge.sent`
- `mfa.challenge.verified`

## Events Consumed

- `identity.login.failed`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build mfa-service
```
