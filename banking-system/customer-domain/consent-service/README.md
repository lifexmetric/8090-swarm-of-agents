# Consent Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Customer And CRM
- Port: 8123
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/consents`

## Dependencies

- audit-log-service

## Events Produced

- `consent.granted`
- `consent.revoked`

## Events Consumed

- `customer.profile.updated`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build consent-service
```
