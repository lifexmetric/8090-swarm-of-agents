# Web Banking Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Channels
- Port: 8102
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/web/sessions`

## Dependencies

- api-management-service
- iam-service
- customer-profile-service
- payments-service

## Events Produced

- `channel.web.login`

## Events Consumed

- `customer.preference.updated`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build web-banking-service
```
