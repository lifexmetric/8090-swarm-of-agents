# Kyc Orchestration Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Customer And CRM
- Port: 8121
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/kyc/checks`

## Dependencies

- document-verification-service
- aml-screening-service
- sanctions-screening-service

## Events Produced

- `kyc.customer.started`
- `kyc.customer.verified`

## Events Consumed

- `customer.profile.updated`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build kyc-orchestration-service
```
