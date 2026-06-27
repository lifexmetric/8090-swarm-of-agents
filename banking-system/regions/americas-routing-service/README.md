# Americas Routing Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Regionalization
- Port: 8180
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/regions/americas/routes`

## Dependencies

- ach-rail-service
- rtp-rail-service
- card-authorization-service

## Events Produced

- `region.americas.routed`

## Events Consumed

- `partner.request.received`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build americas-routing-service
```
