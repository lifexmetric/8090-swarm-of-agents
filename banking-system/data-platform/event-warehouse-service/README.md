# Event Warehouse Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Data And Analytics
- Port: 8161
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/warehouse/events`

## Dependencies

- data-lake-ingestion-service

## Events Produced

- `warehouse.fact.loaded`

## Events Consumed

- `data.lake.object.created`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build event-warehouse-service
```
