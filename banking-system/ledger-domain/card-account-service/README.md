# Card Account Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Accounts And Ledger
- Port: 8133
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/cards/accounts`

## Dependencies

- core-ledger-service
- customer-profile-service
- card-authorization-service

## Events Produced

- `card.account.created`

## Events Consumed

- `kyc.customer.verified`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build card-account-service
```
