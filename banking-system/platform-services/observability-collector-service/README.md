# Observability Collector Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Platform Services
- Port: 8175
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/observability/signals`

## Dependencies

- event-warehouse-service

## Events Produced

- `observability.signal.received`

## Events Consumed

- `mesh.route.changed`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build observability-collector-service
```
