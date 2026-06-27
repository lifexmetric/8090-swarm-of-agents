# Card Authorization Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Payments And Rails
- Port: 8143
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/cards/authorizations`

## Dependencies

- core-ledger-service
- fraud-rules-service
- session-risk-service

## Events Produced

- `card.authorization.approved`
- `payment.authorized`

## Events Consumed

- `atm.withdrawal.requested`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build card-authorization-service
```
