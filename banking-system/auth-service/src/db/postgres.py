import os
import asyncpg

_pool: asyncpg.Pool | None = None


async def init_pool() -> None:
    global _pool
    host = os.getenv("POSTGRES_AUTH_HOST", "localhost")
    port = int(os.getenv("POSTGRES_AUTH_PORT", "5432"))
    database = os.getenv("POSTGRES_AUTH_DB", "auth_db")
    user = os.getenv("POSTGRES_AUTH_USER", "auth_user")
    password = os.getenv("POSTGRES_AUTH_PASSWORD", "auth_password")

    _pool = await asyncpg.create_pool(
        host=host,
        port=port,
        database=database,
        user=user,
        password=password,
        min_size=2,
        max_size=10,
    )


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool is not initialized. Call init_pool() first.")
    return _pool


async def get_user_by_username(username: str) -> dict | None:
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id::text, username, password_hash, email, is_active "
        "FROM users WHERE username = $1",
        username,
    )
    if row is None:
        return None
    return dict(row)


async def record_login_audit(user_id: str, ip: str, success: bool) -> None:
    pool = get_pool()
    await pool.execute(
        "INSERT INTO login_audit (user_id, ip_address, success) VALUES ($1::uuid, $2, $3)",
        user_id,
        ip,
        success,
    )
