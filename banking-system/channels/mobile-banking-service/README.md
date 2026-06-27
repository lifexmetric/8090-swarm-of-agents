# Mobile Banking Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Channels
- Port: 8101
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/mobile/sessions`

## Dependencies

- api-management-service
- iam-service
- customer-profile-service
- accounts-service

## Events Produced

- `channel.mobile.login`

## Events Consumed

- `fraud.alert`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build mobile-banking-service
```
