# Session Risk Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Identity And Access
- Port: 8113
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/sessions/risk`

## Dependencies

- device-trust-service
- fraud-rules-service

## Events Produced

- `session.risk.scored`

## Events Consumed

- `identity.login.succeeded`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build session-risk-service
```
