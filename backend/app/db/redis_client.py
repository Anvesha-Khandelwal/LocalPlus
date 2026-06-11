"""
backend/app/db/redis_client.py
Redis helpers for caching AI results, dashboard aggregates, and sessions.
All helpers handle connection failures gracefully (returns None on miss/error)
so the app degrades to DB-only mode if Redis is unavailable.
"""
import json
import logging
from typing import Any
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger(__name__)

# Module-level client — initialised lazily on first use.
# In production this is set once in main.py lifespan and shared via app.state.redis.
_client: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    """Returns the module-level Redis client, creating it if needed."""
    global _client
    if _client is None:
        _client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
    return _client


async def cache_get(key: str) -> Any | None:
    """
    Fetch a JSON-encoded value from Redis.
    Returns the deserialized Python object, or None on miss/error.
    """
    try:
        raw = await get_redis().get(key)
        return json.loads(raw) if raw is not None else None
    except Exception as exc:
        logger.warning("Redis GET failed for key=%s: %s", key, exc)
        return None


async def cache_set(key: str, value: Any, ttl: int) -> bool:
    """
    Store a JSON-serializable value with a TTL (seconds).
    Returns True on success, False on error.
    """
    try:
        await get_redis().setex(key, ttl, json.dumps(value, default=str))
        return True
    except Exception as exc:
        logger.warning("Redis SET failed for key=%s: %s", key, exc)
        return False


async def cache_delete(key: str) -> None:
    """Delete a single cache key."""
    try:
        await get_redis().delete(key)
    except Exception as exc:
        logger.warning("Redis DELETE failed for key=%s: %s", key, exc)


async def cache_invalidate_tenant(tenant_id: str) -> None:
    """
    Delete all cached keys belonging to a tenant.
    Called after any write operation that changes business data
    (record sale, update stock, etc.) so the next read gets fresh data.
    Key pattern: "tenant:{tenant_id}:*"
    """
    try:
        pattern = f"tenant:{tenant_id}:*"
        cursor = 0
        while True:
            cursor, keys = await get_redis().scan(cursor, match=pattern, count=100)
            if keys:
                await get_redis().delete(*keys)
            if cursor == 0:
                break
        logger.debug("Cache invalidated for tenant=%s", tenant_id)
    except Exception as exc:
        logger.warning("Cache invalidation failed for tenant=%s: %s", tenant_id, exc)


def tenant_key(tenant_id: str, key: str) -> str:
    """
    Build a namespaced cache key scoped to one tenant.
    Example: tenant_key("abc-123", "dashboard") -> "tenant:abc-123:dashboard"
    Prevents one tenant's cache from accidentally being served to another.
    """
    return f"tenant:{tenant_id}:{key}"
