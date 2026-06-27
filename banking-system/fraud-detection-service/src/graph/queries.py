import logging
from .neo4j_client import get_driver

logger = logging.getLogger(__name__)


def get_transaction_count_last_hour(account_id: str) -> int:
    """Count transactions from this account in the last hour."""
    query = """
    MATCH (a:Account {id: $account_id})-[t:SENT_TO]->()
    WHERE t.timestamp > datetime() - duration('PT1H')
    RETURN count(t) AS cnt
    """
    with get_driver().session() as session:
        result = session.run(query, account_id=account_id)
        record = result.single()
        if record is None:
            return 0
        return record["cnt"]


def detect_circular_transactions(source: str, destination: str) -> bool:
    """Check if destination has sent money back to source recently (within 1 day)."""
    query = """
    MATCH (a:Account {id: $destination})-[t:SENT_TO]->(b:Account {id: $source})
    WHERE t.timestamp > datetime() - duration('P1D')
    RETURN count(t) > 0 AS circular
    """
    with get_driver().session() as session:
        result = session.run(query, destination=destination, source=source)
        record = result.single()
        if record is None:
            return False
        return bool(record["circular"])


def check_new_payee(source: str, destination: str) -> bool:
    """Returns True if this source-destination pair has never transacted before."""
    query = """
    MATCH (a:Account {id: $source})-[t:SENT_TO]->(b:Account {id: $destination})
    RETURN count(t) = 0 AS new_payee
    """
    with get_driver().session() as session:
        result = session.run(query, source=source, destination=destination)
        record = result.single()
        if record is None:
            # No match means no relationship exists — it's a new payee
            return True
        return bool(record["new_payee"])


def record_transaction_in_graph(
    payment_id: str, source: str, destination: str, amount: float
) -> None:
    """Create or merge Account nodes and add a SENT_TO relationship."""
    query = """
    MERGE (a:Account {id: $source})
    MERGE (b:Account {id: $destination})
    CREATE (a)-[:SENT_TO {payment_id: $payment_id, amount: $amount, timestamp: datetime()}]->(b)
    """
    with get_driver().session() as session:
        session.run(
            query,
            source=source,
            destination=destination,
            payment_id=payment_id,
            amount=amount,
        )
    logger.debug(
        f"Recorded transaction {payment_id} in graph: {source} -> {destination} (${amount})"
    )


def get_account_risk_profile(account_id: str) -> dict:
    """
    Return a dict with:
      - transaction_count_24h: number of outgoing transactions in the last 24 hours
      - unique_recipients_7d: number of distinct recipients in the last 7 days
      - flagged_count: number of transactions that were part of a circular pattern
    """
    query_24h = """
    MATCH (a:Account {id: $account_id})-[t:SENT_TO]->()
    WHERE t.timestamp > datetime() - duration('P1D')
    RETURN count(t) AS cnt
    """
    query_7d_recipients = """
    MATCH (a:Account {id: $account_id})-[t:SENT_TO]->(b:Account)
    WHERE t.timestamp > datetime() - duration('P7D')
    RETURN count(DISTINCT b.id) AS unique_recipients
    """
    # Circular/flagged: destination sent money back to source within the 24h window
    query_flagged = """
    MATCH (a:Account {id: $account_id})-[t1:SENT_TO]->(b:Account)-[t2:SENT_TO]->(a)
    WHERE t1.timestamp > datetime() - duration('P1D')
      AND t2.timestamp > datetime() - duration('P1D')
    RETURN count(DISTINCT t1) AS flagged
    """

    with get_driver().session() as session:
        result_24h = session.run(query_24h, account_id=account_id)
        record_24h = result_24h.single()
        transaction_count_24h = record_24h["cnt"] if record_24h else 0

        result_7d = session.run(query_7d_recipients, account_id=account_id)
        record_7d = result_7d.single()
        unique_recipients_7d = record_7d["unique_recipients"] if record_7d else 0

        result_flagged = session.run(query_flagged, account_id=account_id)
        record_flagged = result_flagged.single()
        flagged_count = record_flagged["flagged"] if record_flagged else 0

    return {
        "transaction_count_24h": transaction_count_24h,
        "unique_recipients_7d": unique_recipients_7d,
        "flagged_count": flagged_count,
    }
