# Apac Routing Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Regionalization
- Port: 8182
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/regions/apac/routes`

## Dependencies

- swift-rail-service
- sanctions-screening-service
- rtp-rail-service

## Events Produced

- `region.apac.routed`

## Events Consumed

- `partner.request.received`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build apac-routing-service
```
