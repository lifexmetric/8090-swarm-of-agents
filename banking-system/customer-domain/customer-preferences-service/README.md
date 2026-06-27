# Customer Preferences Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Customer And CRM
- Port: 8124
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/customers/preferences`

## Dependencies

- notification-service
- audit-log-service

## Events Produced

- `customer.preference.updated`

## Events Consumed

- `consent.revoked`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build customer-preferences-service
```
