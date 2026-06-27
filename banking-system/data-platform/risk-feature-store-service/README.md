# Risk Feature Store Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Data And Analytics
- Port: 8162
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/features/risk`

## Dependencies

- event-warehouse-service

## Events Produced

- `risk.features.updated`

## Events Consumed

- `warehouse.fact.loaded`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build risk-feature-store-service
```
