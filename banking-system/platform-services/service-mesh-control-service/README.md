# Service Mesh Control Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Platform Services
- Port: 8171
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/mesh/routes`

## Dependencies

- config-service
- observability-collector-service

## Events Produced

- `mesh.route.changed`

## Events Consumed

- `api.route.changed`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build service-mesh-control-service
```
