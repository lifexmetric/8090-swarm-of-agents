import os
import redis.asyncio as aioredis

_redis: aioredis.Redis | None = None

REFRESH_TOKEN_KEY_PREFIX = "refresh_token:"
BLACKLIST_KEY_PREFIX = "blacklist:"


async def init_redis() -> None:
    global _redis
    host = os.getenv("REDIS_HOST", "localhost")
    port = int(os.getenv("REDIS_PORT", "6379"))
    _redis = aioredis.Redis(host=host, port=port, decode_responses=True)


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None


def get_redis() -> aioredis.Redis:
    if _redis is None:
        raise RuntimeError("Redis client is not initialized. Call init_redis() first.")
    return _redis


async def store_refresh_token(user_id: str, token: str, expire_days: int) -> None:
    r = get_redis()
    key = f"{REFRESH_TOKEN_KEY_PREFIX}{user_id}"
    expire_seconds = expire_days * 24 * 60 * 60
    await r.set(key, token, ex=expire_seconds)


async def get_refresh_token(user_id: str) -> str | None:
    r = get_redis()
    key = f"{REFRESH_TOKEN_KEY_PREFIX}{user_id}"
    value = await r.get(key)
    return value


async def delete_refresh_token(user_id: str) -> None:
    r = get_redis()
    key = f"{REFRESH_TOKEN_KEY_PREFIX}{user_id}"
    await r.delete(key)


async def is_token_blacklisted(token: str) -> bool:
    r = get_redis()
    key = f"{BLACKLIST_KEY_PREFIX}{token}"
    result = await r.exists(key)
    return bool(result)


async def blacklist_token(token: str, expire_minutes: int) -> None:
    r = get_redis()
    key = f"{BLACKLIST_KEY_PREFIX}{token}"
    expire_seconds = expire_minutes * 60
    await r.set(key, "1", ex=expire_seconds)
