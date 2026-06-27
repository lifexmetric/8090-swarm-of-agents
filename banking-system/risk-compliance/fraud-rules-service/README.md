# Fraud Rules Service

Runnable fake service for the global banking monorepo demo. It exposes synthetic APIs and metadata so the system can be explored by Atlas and started with Docker Compose.

- Domain: Risk And Compliance
- Port: 8153
- Health: `/health`
- Metadata: `/metadata`
- Demo API: `/v1/fraud/rules/evaluate`

## Dependencies

- risk-feature-store-service
- case-management-service

## Events Produced

- `fraud.alert`

## Events Consumed

- `session.risk.scored`
- `card.authorization.approved`

Run with the global profile from `banking-system/`:

```bash
docker compose --profile global up --build fraud-rules-service
```
