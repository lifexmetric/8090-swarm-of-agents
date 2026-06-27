# ADR 001 — Synchronous SWIFT Integration

**Status:** Accepted  
**Date:** 2025-01-01

## Context

The payments-service must submit outbound transfers to an external SWIFT gateway. Two approaches were considered: (a) synchronous HTTP call within the payment request, or (b) an async queue with a separate SWIFT dispatcher worker.

## Decision

Call the SWIFT gateway synchronously from the payments-service HTTP handler before returning a response to the caller.

## Rationale

- **Simplicity:** A synchronous call allows the API to return a definitive `completed` or `failed` status in a single round trip, avoiding a polling or webhook mechanism.
- **Idempotency guarantee:** The `idempotency_key` on `payment_orders` prevents duplicate submissions if the client retries. With an async dispatcher, achieving the same guarantee requires distributed locking across queue consumers.

## Consequences

- **Latency propagation:** SWIFT gateway latency (potentially 1–5 s) is directly visible to the API caller.
- **No circuit breaker:** A SWIFT outage will cause payment requests to hang or time out rather than fail fast. The current implementation uses a hard timeout but does not have a circuit breaker or bulkhead.

## Future Recommendation

Add a circuit breaker (Resilience4j, Sentinel, or similar) around the SWIFT call to fail fast during outages and prevent thread pool exhaustion. Consider moving to an async model with a SWIFT dispatcher and webhook callback if SLA requirements tighten.
