# Settlement Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Payments And Rails
- Port: 8144
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/settlement/batches`

## Dependencies

- core-ledger-service
- reconciliation-service

## Events Produced

- `settlement.batch.created`

## Events Consumed

- `ach.transfer.submitted`
- `sepa.transfer.submitted`
- `rtp.transfer.submitted`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build settlement-service
```
