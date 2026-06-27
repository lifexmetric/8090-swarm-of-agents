# Emea Routing Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Regionalization
- Port: 8181
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/regions/emea/routes`

## Dependencies

- sepa-rail-service
- sanctions-screening-service
- swift-rail-service

## Events Produced

- `region.emea.routed`

## Events Consumed

- `partner.request.received`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build emea-routing-service
```
