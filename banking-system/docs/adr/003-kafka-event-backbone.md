# ADR 003 — Kafka as Async Event Backbone

**Status:** Accepted  
**Date:** 2025-01-01

## Context

Several cross-service workflows (payment completion → fraud check, payment completion → notification, account update → reporting) need to propagate events without tight coupling between producers and consumers. Direct HTTP calls and a shared database trigger were evaluated alongside a message broker.

## Decision

Use Apache Kafka (Confluent Platform 7.6) as the asynchronous event backbone for all inter-service event propagation.

## Rationale

- **Decoupling:** Producers (payments-service, accounts-service) publish events without knowledge of consumers. New consumers (e.g., an audit-log service) can be added without modifying producers.
- **Replay and audit trail:** Kafka's durable log allows consumers to replay events from any offset, which is valuable for reconstructing state after an outage and for regulatory audit requirements in banking.
- **Fan-out:** A single `payment.completed` event is consumed independently by fraud-detection-service and notification-service without any additional routing logic.

## Consequences

- **Operational complexity:** Kafka (and its Zookeeper dependency) adds infrastructure that must be sized, monitored, and backed up. The current single-broker setup is appropriate for development but not production; a 3-broker cluster with replication factor 3 is recommended for production.
- **Eventual consistency:** Consumers process events asynchronously, so the fraud check and notification are not atomic with the payment commit. Compensating logic (e.g., retroactive fraud flags) may be needed.
- **At-least-once delivery:** Consumers must be idempotent. Each service is responsible for deduplicating events using the event ID included in the payload.
