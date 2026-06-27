import asyncpg
import os

_pool = None


async def init_pool():
    global _pool
    _pool = await asyncpg.create_pool(
        host=os.getenv("POSTGRES_BANK_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_BANK_PORT", "5433")),
        database=os.getenv("POSTGRES_BANK_DB", "bank_db"),
        user=os.getenv("POSTGRES_BANK_USER", "bank_user"),
        password=os.getenv("POSTGRES_BANK_PASSWORD", "bank_password"),
        min_size=2,
        max_size=10,
    )


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()


def get_pool():
    if _pool is None:
        raise RuntimeError("PostgreSQL pool not initialized")
    return _pool


async def fetch_account(account_id: str) -> dict | None:
    """SELECT account from accounts table"""
    row = await get_pool().fetchrow(
        "SELECT id, customer_id, account_type, currency, balance::float, status, created_at, updated_at "
        "FROM accounts WHERE id=$1",
        account_id,
    )
    return dict(row) if row else None


async def fetch_transactions(account_id: str, limit: int = 20) -> list[dict]:
    """SELECT recent transactions for an account"""
    rows = await get_pool().fetch(
        "SELECT id::text, account_id, type, amount::float, currency, description, "
        "COALESCE(reference_id,'') as reference_id, created_at "
        "FROM transactions WHERE account_id=$1 ORDER BY created_at DESC LIMIT $2",
        account_id,
        limit,
    )
    return [dict(r) for r in rows]


async def fetch_account_summary_for_customer(customer_id: str) -> list[dict]:
    """Fetch all accounts for a customer"""
    rows = await get_pool().fetch(
        "SELECT id, customer_id, account_type, currency, balance::float, status, created_at, updated_at "
        "FROM accounts WHERE customer_id=$1",
        customer_id,
    )
    return [dict(r) for r in rows]
