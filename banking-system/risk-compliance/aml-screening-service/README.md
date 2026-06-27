# Aml Screening Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Risk And Compliance
- Port: 8150
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/screening/aml`

## Dependencies

- transaction-monitoring-service
- case-management-service

## Events Produced

- `aml.screening.completed`
- `aml.case.opened`

## Events Consumed

- `payment.authorized`
- `kyc.customer.started`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build aml-screening-service
```
