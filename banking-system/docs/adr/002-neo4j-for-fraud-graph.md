# ADR 002 — Neo4j for Fraud Graph Analysis

**Status:** Accepted  
**Date:** 2025-01-01

## Context

The fraud-detection-service needs to identify suspicious patterns such as circular transaction chains (A → B → C → A) and hub accounts that funnel money through many intermediaries. Both a relational (PostgreSQL) and a graph (Neo4j) database were evaluated.

## Decision

Use Neo4j 5 as the dedicated store for the transaction relationship graph consumed by fraud-detection-service.

## Rationale

- **Traversal complexity:** Detecting a circular chain of depth k in a relational model requires k self-joins, making the query O(n^k) in the worst case. Neo4j's native graph traversal (BFS/DFS with Cypher or APOC path-finding) runs in O(n) for most fraud patterns regardless of chain depth.
- **Expressiveness:** Cypher queries for "find all accounts reachable from X within 3 hops" are far more readable and maintainable than equivalent recursive CTEs.

## Consequences

- **Operational overhead:** Neo4j is a fifth data store in the system, requiring its own backup strategy, upgrade cycle, and on-call runbook.
- **Dual-write complexity:** Payment events written to PostgreSQL must also be reflected in Neo4j. The current design uses the Kafka `payment.completed` topic as the synchronisation mechanism (fraud-detection-service consumes and writes to Neo4j), avoiding synchronous dual-write from payments-service.
- **Eventual consistency:** The fraud graph lags the payment record by the Kafka consumer latency (typically < 1 s), meaning real-time fraud checks on in-flight payments are not supported.
