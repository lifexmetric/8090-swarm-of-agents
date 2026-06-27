# Mortgage Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Accounts And Ledger
- Port: 8135
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/mortgages/applications`

## Dependencies

- customer-profile-service
- risk-feature-store-service
- document-verification-service

## Events Produced

- `mortgage.application.created`

## Events Consumed

- `document.verification.completed`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build mortgage-service
```
