"""
seed_graph.py — Populates Neo4j with Account nodes and SENT_TO relationships
for local development and testing of the fraud-detection-service.

Usage:
    python seeds/seed_graph.py

Environment variables (all optional, with sensible defaults):
    NEO4J_URI       bolt://localhost:7687
    NEO4J_USER      neo4j
    NEO4J_PASSWORD  neo4j_password
"""

import os
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from neo4j import GraphDatabase

# ── Allow running from repo root without installing the package ────────────────
load_dotenv()

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "neo4j_password")

# ── Account IDs ────────────────────────────────────────────────────────────────
# Three "known" accounts matching the seeded PostgreSQL data
KNOWN_ACCOUNTS = [
    "acc-alice-001",
    "acc-bob-001",
    "acc-charlie-001",
]
# Seven generated seed accounts
SEED_ACCOUNTS = [f"acc-seed-{i:03d}" for i in range(1, 8)]
ALL_ACCOUNTS = KNOWN_ACCOUNTS + SEED_ACCOUNTS  # 10 total


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def dt_to_neo4j(dt: datetime) -> str:
    """Format a datetime as a Neo4j-compatible ISO-8601 string."""
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


# ── Individual Cypher helpers ──────────────────────────────────────────────────

def create_accounts(tx, account_ids: list[str]) -> None:
    for acc_id in account_ids:
        tx.run(
            "MERGE (a:Account {id: $id})",
            id=acc_id,
        )


def create_sent_to(
    tx,
    src: str,
    dst: str,
    payment_id: str,
    amount: float,
    timestamp: datetime,
) -> None:
    tx.run(
        """
        MATCH (a:Account {id: $src})
        MATCH (b:Account {id: $dst})
        CREATE (a)-[:SENT_TO {
            payment_id: $payment_id,
            amount:     $amount,
            timestamp:  datetime($ts)
        }]->(b)
        """,
        src=src,
        dst=dst,
        payment_id=payment_id,
        amount=amount,
        ts=dt_to_neo4j(timestamp),
    )


# ── Seed scenarios ─────────────────────────────────────────────────────────────

def seed_normal_transactions(session, base_time: datetime) -> None:
    """
    20 normal-looking transactions scattered across ALL_ACCOUNTS over the past 7 days.
    """
    normal_txs = [
        # (src,             dst,              payment_id,          amount,  hours_ago)
        ("acc-alice-001",   "acc-bob-001",    "pay-norm-001",      250.0,   168),
        ("acc-bob-001",     "acc-charlie-001","pay-norm-002",      90.0,    144),
        ("acc-charlie-001", "acc-seed-001",   "pay-norm-003",      1200.0,  120),
        ("acc-seed-001",    "acc-seed-002",   "pay-norm-004",      450.0,   96),
        ("acc-seed-002",    "acc-alice-001",  "pay-norm-005",      780.0,   72),
        ("acc-seed-003",    "acc-bob-001",    "pay-norm-006",      330.0,   60),
        ("acc-seed-004",    "acc-charlie-001","pay-norm-007",      620.0,   48),
        ("acc-seed-005",    "acc-seed-006",   "pay-norm-008",      200.0,   36),
        ("acc-seed-006",    "acc-seed-007",   "pay-norm-009",      950.0,   24),
        ("acc-seed-007",    "acc-alice-001",  "pay-norm-010",      110.0,   20),
        ("acc-alice-001",   "acc-seed-003",   "pay-norm-011",      3400.0,  18),
        ("acc-bob-001",     "acc-seed-004",   "pay-norm-012",      570.0,   16),
        ("acc-charlie-001", "acc-seed-005",   "pay-norm-013",      88.0,    14),
        ("acc-seed-001",    "acc-alice-001",  "pay-norm-014",      1500.0,  12),
        ("acc-seed-002",    "acc-bob-001",    "pay-norm-015",      240.0,   10),
        ("acc-seed-003",    "acc-seed-007",   "pay-norm-016",      410.0,   8),
        ("acc-seed-004",    "acc-seed-001",   "pay-norm-017",      760.0,   6),
        ("acc-seed-005",    "acc-charlie-001","pay-norm-018",      330.0,   4),
        ("acc-seed-006",    "acc-alice-001",  "pay-norm-019",      4800.0,  2),
        ("acc-seed-007",    "acc-bob-001",    "pay-norm-020",      175.0,   1),
    ]
    for src, dst, pid, amount, hours_ago in normal_txs:
        ts = base_time - timedelta(hours=hours_ago)
        session.execute_write(create_sent_to, src, dst, pid, amount, ts)
    print(f"  Seeded {len(normal_txs)} normal transactions.")


def seed_circular_ring(session, base_time: datetime) -> None:
    """
    Fraud pattern 1 — Circular transaction chain: A → B → C → A
    Uses acc-alice-001, acc-bob-001, acc-charlie-001.
    All within the past 20 hours so the circular-detection query fires.
    """
    ring_txs = [
        ("acc-alice-001",   "acc-bob-001",    "pay-ring-001", 5000.0, 18),
        ("acc-bob-001",     "acc-charlie-001","pay-ring-002", 4800.0, 12),
        ("acc-charlie-001", "acc-alice-001",  "pay-ring-003", 4600.0,  6),
    ]
    for src, dst, pid, amount, hours_ago in ring_txs:
        ts = base_time - timedelta(hours=hours_ago)
        session.execute_write(create_sent_to, src, dst, pid, amount, ts)
    print(f"  Seeded {len(ring_txs)} circular-ring transactions (A→B→C→A).")


def seed_velocity_burst(session, base_time: datetime) -> None:
    """
    Fraud pattern 2 — Velocity burst: acc-seed-001 sends 8 payments within 1 hour.
    """
    burst_targets = [
        "acc-seed-002",
        "acc-seed-003",
        "acc-seed-004",
        "acc-seed-005",
        "acc-seed-006",
        "acc-seed-007",
        "acc-alice-001",
        "acc-bob-001",
    ]
    for i, dst in enumerate(burst_targets):
        # Spread evenly across 50 minutes so all fall within the last hour
        minutes_ago = 5 + i * 5          # 5, 10, 15, … 40 minutes ago
        ts = base_time - timedelta(minutes=minutes_ago)
        pid = f"pay-burst-{i + 1:03d}"
        amount = 500.0 + i * 100
        session.execute_write(create_sent_to, "acc-seed-001", dst, pid, amount, ts)
    print(f"  Seeded {len(burst_targets)} velocity-burst transactions from acc-seed-001.")


def seed_new_high_value_payee(session, base_time: datetime) -> None:
    """
    Fraud pattern 3 — New high-value payee: acc-seed-007 sends a large amount
    to acc-charlie-001 for the very first time.
    (acc-seed-007 has only sent to acc-alice-001 and acc-bob-001 previously.)
    """
    ts = base_time - timedelta(minutes=2)
    session.execute_write(
        create_sent_to,
        "acc-seed-007",
        "acc-charlie-001",
        "pay-hvp-001",
        12_500.0,
        ts,
    )
    print("  Seeded 1 new high-value payee transaction (acc-seed-007 → acc-charlie-001, $12,500).")


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    print(f"Connecting to Neo4j at {NEO4J_URI} as '{NEO4J_USER}' …")
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

    try:
        driver.verify_connectivity()
        print("Connection successful.\n")
    except Exception as exc:
        print(f"ERROR: Cannot connect to Neo4j — {exc}", file=sys.stderr)
        sys.exit(1)

    base_time = now_utc()

    with driver.session() as session:
        # 1. Create Account nodes
        print(f"Creating {len(ALL_ACCOUNTS)} Account nodes …")
        session.execute_write(create_accounts, ALL_ACCOUNTS)
        print(f"  Done: {ALL_ACCOUNTS}\n")

        # 2. Normal transactions (20+)
        print("Seeding normal transactions …")
        seed_normal_transactions(session, base_time)
        print()

        # 3. Fraud pattern — circular ring
        print("Seeding fraud pattern: circular ring (A→B→C→A) …")
        seed_circular_ring(session, base_time)
        print()

        # 4. Fraud pattern — velocity burst
        print("Seeding fraud pattern: velocity burst …")
        seed_velocity_burst(session, base_time)
        print()

        # 5. Fraud pattern — new high-value payee
        print("Seeding fraud pattern: new high-value payee …")
        seed_new_high_value_payee(session, base_time)
        print()

    driver.close()
    print("Seeding complete.")
    print()
    print("Summary of fraud patterns seeded:")
    print("  1. Circular ring    : acc-alice-001 → acc-bob-001 → acc-charlie-001 → acc-alice-001")
    print("  2. Velocity burst   : acc-seed-001 sent 8 payments within the last hour")
    print("  3. New high-value   : acc-seed-007 → acc-charlie-001 for $12,500 (first-time payee)")


if __name__ == "__main__":
    main()
