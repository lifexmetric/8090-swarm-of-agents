# Customer Profile Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Customer And CRM
- Port: 8120
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/customers/profile`

## Dependencies

- consent-service
- customer-preferences-service

## Events Produced

- `customer.profile.updated`

## Events Consumed

- `kyc.customer.verified`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build customer-profile-service
```
