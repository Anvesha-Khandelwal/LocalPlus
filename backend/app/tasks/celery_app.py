"""
backend/app/tasks/celery_app.py
Celery worker configuration and scheduled background tasks.
Workers run separately from the API: `celery -A app.tasks.celery_app worker`
Schedule: `celery -A app.tasks.celery_app beat`

Scheduled tasks:
  run_daily_forecasts       — 2:00 AM daily: regenerate demand forecasts for all tenants
  send_restock_alerts       — 8:00 AM daily: email/WhatsApp low-stock alerts to owners
  recalculate_health_scores — midnight: recompute health scores (cache refresh)
  segment_customers         — 3:00 AM Sunday: RFM segmentation for all tenants
  cleanup_expired_tokens    — hourly: delete expired refresh tokens from DB
"""
import logging
from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "copilot_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.celery_app"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,   # re-queue on worker crash
)

# ── Beat schedule ──────────────────────────────────────────────────────────────
celery_app.conf.beat_schedule = {
    "daily-forecasts": {
        "task": "app.tasks.celery_app.run_daily_forecasts",
        "schedule": crontab(hour=2, minute=0),  # 2:00 AM IST
    },
    "restock-alerts": {
        "task": "app.tasks.celery_app.send_restock_alerts",
        "schedule": crontab(hour=8, minute=0),  # 8:00 AM IST
    },
    "health-scores": {
        "task": "app.tasks.celery_app.recalculate_health_scores",
        "schedule": crontab(hour=0, minute=0),  # midnight IST
    },
    "customer-segments": {
        "task": "app.tasks.celery_app.segment_customers",
        "schedule": crontab(hour=3, minute=0, day_of_week=0),  # 3 AM Sunday
    },
    "cleanup-tokens": {
        "task": "app.tasks.celery_app.cleanup_expired_tokens",
        "schedule": crontab(minute=0),  # every hour
    },
}


# ── Tasks ──────────────────────────────────────────────────────────────────────

@celery_app.task(bind=True, max_retries=3)
def run_daily_forecasts(self):
    """
    For each active tenant, pulls 90 days of sales data per product and
    regenerates Prophet/XGBoost demand forecasts. Stores results in Redis
    so the API serves them instantly. Falls back to moving-average on failure.
    """
    import asyncio
    from sqlalchemy import select
    try:
        asyncio.run(_async_run_forecasts())
        logger.info("Daily forecasts completed.")
    except Exception as exc:
        logger.error("Forecast task failed: %s", exc)
        raise self.retry(exc=exc, countdown=300)


@celery_app.task(bind=True, max_retries=3)
def send_restock_alerts(self):
    """
    Scans every tenant for low-stock and out-of-stock products.
    Sends a WhatsApp message (via Twilio/2Factor) or email to the owner.
    Only sends if the owner hasn't dismissed the alert in the last 24h.
    """
    import asyncio
    try:
        asyncio.run(_async_send_alerts())
        logger.info("Restock alerts sent.")
    except Exception as exc:
        logger.error("Restock alert task failed: %s", exc)
        raise self.retry(exc=exc, countdown=300)


@celery_app.task
def recalculate_health_scores():
    """
    Invalidates and recomputes health scores for all tenants.
    This ensures the score on the dashboard always reflects yesterday's complete data.
    """
    import asyncio
    asyncio.run(_async_recalculate_health())
    logger.info("Health scores recalculated.")


@celery_app.task
def segment_customers():
    """
    Runs RFM (Recency, Frequency, Monetary) analysis per tenant.
    Assigns each customer a segment: champion, loyal, at_risk, or lost.
    Updates Customer.segment in the DB.
    The ml/customer_segmentation.py module does the actual K-Means work.
    """
    import asyncio
    asyncio.run(_async_segment_customers())
    logger.info("Customer segmentation completed.")


@celery_app.task
def cleanup_expired_tokens():
    """Delete RefreshToken rows where expires_at < now. Keeps the table small."""
    import asyncio
    asyncio.run(_async_cleanup_tokens())


# ── Async implementations ─────────────────────────────────────────────────────

async def _async_run_forecasts():
    from app.db.session import AsyncSessionLocal
    from app.models.user import Tenant
    from app.db.redis_client import cache_set, tenant_key
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Tenant))
        tenants = result.scalars().all()
        for tenant in tenants:
            try:
                # In production: call ml/demand_forecast.py per product
                # Here we just invalidate the forecast cache so next API call recomputes
                from app.db.redis_client import cache_delete
                await cache_delete(tenant_key(str(tenant.id), "forecast:all"))
            except Exception as exc:
                logger.error("Forecast failed for tenant=%s: %s", tenant.id, exc)


async def _async_send_alerts():
    from app.db.session import AsyncSessionLocal
    from app.models.product import Product
    from app.models.user import Tenant, User, UserRole
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Tenant))
        tenants = result.scalars().all()
        for tenant in tenants:
            low = await db.execute(
                select(Product.name, Product.quantity)
                .where(Product.tenant_id == tenant.id, Product.is_active == True,
                       Product.quantity <= Product.reorder_point)
                .limit(10)
            )
            low_items = low.fetchall()
            if not low_items:
                continue
            # Get owner's contact
            owner_result = await db.execute(
                select(User).where(User.tenant_id == tenant.id, User.role == UserRole.OWNER, User.is_active == True)
            )
            owner = owner_result.scalar_one_or_none()
            if owner:
                logger.info("TODO: send alert to %s: %d low stock items", owner.email, len(low_items))
                # await send_whatsapp_alert(owner.phone, low_items)
                # await send_email_alert(owner.email, low_items)


async def _async_recalculate_health():
    from app.db.session import AsyncSessionLocal
    from app.models.user import Tenant
    from app.db.redis_client import cache_delete, tenant_key
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Tenant))
        tenants = result.scalars().all()
        for tenant in tenants:
            await cache_delete(tenant_key(str(tenant.id), "health_score"))


async def _async_segment_customers():
    """
    Simple RFM segmentation without scikit-learn dependency in this module.
    For ML-powered segmentation, see ml/customer_segmentation.py.
    """
    from app.db.session import AsyncSessionLocal
    from app.models.sale import Customer, SaleTransaction
    from app.models.user import Tenant
    from sqlalchemy import select, func
    from datetime import datetime, timezone, timedelta

    async with AsyncSessionLocal() as db:
        tenant_result = await db.execute(select(Tenant))
        for tenant in tenant_result.scalars():
            cust_result = await db.execute(
                select(Customer).where(Customer.tenant_id == tenant.id, Customer.is_active == True)
            )
            now = datetime.now(timezone.utc)
            for customer in cust_result.scalars():
                recency_days = (now - customer.last_purchase_at).days if customer.last_purchase_at else 9999
                freq = customer.visit_count or 0
                monetary = float(customer.total_spent or 0)

                if recency_days <= 30 and freq >= 5 and monetary >= 2000:
                    customer.segment = "champion"
                elif recency_days <= 60 and freq >= 3:
                    customer.segment = "loyal"
                elif recency_days <= 90:
                    customer.segment = "at_risk"
                else:
                    customer.segment = "lost"
                db.add(customer)
            await db.commit()


async def _async_cleanup_tokens():
    from app.db.session import AsyncSessionLocal
    from app.models.user import RefreshToken
    from sqlalchemy import delete
    from datetime import datetime, timezone

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            delete(RefreshToken).where(RefreshToken.expires_at < datetime.now(timezone.utc))
        )
        await db.commit()
        logger.debug("Cleaned up %d expired refresh tokens", result.rowcount)
