# Global Bank Architecture Demo

This folder models a global retail and commercial bank as a runnable monorepo demo. The services are intentionally fake: they expose health checks, metadata, synthetic APIs, and dependency references, but they do not implement real banking behavior.

The goal is to give Atlas a large, realistic codebase shape to scan while still allowing Docker Compose to boot the expanded system.

## Runtime Modes

- Core demo: `docker compose up --build`
- Global bank demo: `docker compose --profile global up --build`

The global profile starts the existing core infrastructure and adds 46 lightweight services. Each new service exposes `/health`, `/metadata`, `/v1/events`, `/v1/downstream-checks`, and one domain-specific fake endpoint.

## Domains

### Channels

- `mobile-banking-service` on port `8101` exposes `/v1/mobile/sessions`.
- `web-banking-service` on port `8102` exposes `/v1/web/sessions`.
- `atm-gateway-service` on port `8103` exposes `/v1/atm/withdrawals`.
- `branch-teller-service` on port `8104` exposes `/v1/branch/transactions`.
- `partner-api-service` on port `8105` exposes `/v1/partners/requests`.

### Identity And Access

- `iam-service` on port `8110` exposes `/v1/identity/tokens`.
- `mfa-service` on port `8111` exposes `/v1/mfa/challenges`.
- `device-trust-service` on port `8112` exposes `/v1/devices/trust-score`.
- `session-risk-service` on port `8113` exposes `/v1/sessions/risk`.
- `employee-access-service` on port `8114` exposes `/v1/employees/access`.

### Customer And CRM

- `customer-profile-service` on port `8120` exposes `/v1/customers/profile`.
- `kyc-orchestration-service` on port `8121` exposes `/v1/kyc/checks`.
- `document-verification-service` on port `8122` exposes `/v1/documents/verification`.
- `consent-service` on port `8123` exposes `/v1/consents`.
- `customer-preferences-service` on port `8124` exposes `/v1/customers/preferences`.

### Accounts And Ledger

- `core-ledger-service` on port `8130` exposes `/v1/ledger/entries`.
- `deposits-service` on port `8131` exposes `/v1/deposits/accounts`.
- `savings-service` on port `8132` exposes `/v1/savings/accounts`.
- `card-account-service` on port `8133` exposes `/v1/cards/accounts`.
- `loan-servicing-service` on port `8134` exposes `/v1/loans/accounts`.
- `mortgage-service` on port `8135` exposes `/v1/mortgages/applications`.

### Payments And Rails

- `ach-rail-service` on port `8140` exposes `/v1/rails/ach/transfers`.
- `sepa-rail-service` on port `8141` exposes `/v1/rails/sepa/transfers`.
- `rtp-rail-service` on port `8142` exposes `/v1/rails/rtp/transfers`.
- `card-authorization-service` on port `8143` exposes `/v1/cards/authorizations`.
- `settlement-service` on port `8144` exposes `/v1/settlement/batches`.
- `reconciliation-service` on port `8145` exposes `/v1/reconciliation/runs`.

### Risk And Compliance

- `aml-screening-service` on port `8150` exposes `/v1/screening/aml`.
- `sanctions-screening-service` on port `8151` exposes `/v1/screening/sanctions`.
- `transaction-monitoring-service` on port `8152` exposes `/v1/monitoring/transactions`.
- `fraud-rules-service` on port `8153` exposes `/v1/fraud/rules/evaluate`.
- `case-management-service` on port `8154` exposes `/v1/cases`.
- `regulatory-reporting-service` on port `8155` exposes `/v1/regulatory/reports`.

### Data And Analytics

- `data-lake-ingestion-service` on port `8160` exposes `/v1/data-lake/ingest`.
- `event-warehouse-service` on port `8161` exposes `/v1/warehouse/events`.
- `risk-feature-store-service` on port `8162` exposes `/v1/features/risk`.
- `reporting-marts-service` on port `8163` exposes `/v1/reporting/marts`.

### Platform Services

- `api-management-service` on port `8170` exposes `/v1/apis/routes`.
- `service-mesh-control-service` on port `8171` exposes `/v1/mesh/routes`.
- `config-service` on port `8172` exposes `/v1/config/policies`.
- `secrets-broker-service` on port `8173` exposes `/v1/secrets/leases`.
- `audit-log-service` on port `8174` exposes `/v1/audit/events`.
- `observability-collector-service` on port `8175` exposes `/v1/observability/signals`.

### Regionalization

- `americas-routing-service` on port `8180` exposes `/v1/regions/americas/routes`.
- `emea-routing-service` on port `8181` exposes `/v1/regions/emea/routes`.
- `apac-routing-service` on port `8182` exposes `/v1/regions/apac/routes`.

## Integration Model

The existing Kafka, Redis, Postgres, MongoDB, and Neo4j services remain the shared infrastructure. New services use environment variables and catalog files to describe fake HTTP dependencies, event producers, event consumers, and data stores.

The service catalog is in `catalog/services.yaml`. Event topology is in `catalog/event-topology.yaml`. API topology is in `catalog/api-topology.yaml`.
