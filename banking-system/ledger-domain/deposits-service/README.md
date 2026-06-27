# Deposits Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Accounts And Ledger
- Port: 8131
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/deposits/accounts`

## Dependencies

- core-ledger-service
- customer-profile-service

## Events Produced

- `deposit.account.opened`

## Events Consumed

- `kyc.customer.verified`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build deposits-service
```
