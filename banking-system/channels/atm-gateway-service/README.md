# Atm Gateway Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Channels
- Port: 8103
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/atm/withdrawals`

## Dependencies

- core-ledger-service
- card-authorization-service
- session-risk-service

## Events Produced

- `atm.withdrawal.requested`

## Events Consumed

- `ledger.entry.posted`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build atm-gateway-service
```
