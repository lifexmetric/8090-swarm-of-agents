# Sanctions Screening Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Risk And Compliance
- Port: 8151
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/screening/sanctions`

## Dependencies

- case-management-service
- audit-log-service

## Events Produced

- `sanctions.screening.completed`
- `sanctions.hit.detected`

## Events Consumed

- `payment.authorized`
- `kyc.customer.started`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build sanctions-screening-service
```
