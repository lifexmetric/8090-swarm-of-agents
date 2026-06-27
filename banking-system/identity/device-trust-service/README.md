# Device Trust Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Identity And Access
- Port: 8112
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/devices/trust-score`

## Dependencies

- risk-feature-store-service
- audit-log-service

## Events Produced

- `device.trust.scored`

## Events Consumed

- `channel.mobile.login`
- `channel.web.login`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build device-trust-service
```
