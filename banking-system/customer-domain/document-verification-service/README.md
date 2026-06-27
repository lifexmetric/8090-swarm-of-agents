# Document Verification Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Customer And CRM
- Port: 8122
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/documents/verification`

## Dependencies

- audit-log-service
- secrets-broker-service

## Events Produced

- `document.verification.completed`

## Events Consumed

- `kyc.customer.started`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build document-verification-service
```
