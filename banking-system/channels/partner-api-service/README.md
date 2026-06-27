# Partner Api Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Channels
- Port: 8105
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/partners/requests`

## Dependencies

- api-management-service
- consent-service
- customer-profile-service

## Events Produced

- `partner.request.received`

## Events Consumed

- `consent.revoked`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build partner-api-service
```
