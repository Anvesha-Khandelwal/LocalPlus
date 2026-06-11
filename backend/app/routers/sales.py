"""
backend/app/routers/sales.py
Sales transaction recording and analytics endpoints.
POST /transaction  — record a sale; deducts stock; updates customer stats
GET  /dashboard    — today's KPIs (revenue, profit, units, top products)
GET  /trends       — time-series data for charts (daily/weekly/monthly)
GET  /top-products — products ranked by revenue for a date range
GET  /slow-movers  — products with low sales velocity
"""
import uuid
import logging
from datetime import datetime, timezone, timedelta, date
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.redis_client import cache_get, cache_set, cache_invalidate_tenant, tenant_key
from app.models.product import Product
from app.models.sale import SaleTransaction, SaleItem, Customer
from app.models.user import User
from app.routers.auth import get_current_user
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class SaleItemInput(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(..., ge=1)

class TransactionCreate(BaseModel):
    items: List[SaleItemInput]
    discount_amount: float = Field(0, ge=0)
    payment_method: str = "cash"
    customer_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


# ── POST /transaction ─────────────────────────────────────────────────────────

@router.post("/transaction", status_code=201)
async def record_transaction(
    body: TransactionCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Records a sale. For each item:
      1. Loads the product (validates tenant ownership).
      2. Deducts stock (raises 400 if insufficient).
      3. Creates SaleItem with price/cost snapshot.
    Then creates SaleTransaction with computed totals.
    Everything is one atomic DB transaction — partial sales are impossible.
    Invalidates tenant cache so next dashboard load reflects the new sale.
    """
    subtotal = 0.0
    total_cost = 0.0
    sale_items = []

    for item_input in body.items:
        result = await db.execute(
            select(Product).where(
                Product.id == item_input.product_id,
                Product.tenant_id == current_user.tenant_id,
                Product.is_active == True,
            )
        )
        product = result.scalar_one_or_none()
        if not product:
            from fastapi import HTTPException
            raise HTTPException(404, f"Product {item_input.product_id} not found.")
        if product.quantity < item_input.quantity:
            from fastapi import HTTPException
            raise HTTPException(400, f"Insufficient stock for '{product.name}'. Available: {product.quantity}, requested: {item_input.quantity}.")

        product.quantity -= item_input.quantity
        db.add(product)

        line_total = float(product.selling_price) * item_input.quantity
        line_cost  = float(product.cost_price)    * item_input.quantity
        subtotal   += line_total
        total_cost += line_cost

        sale_items.append(SaleItem(
            id=uuid.uuid4(),
            product_id=product.id,
            product_name=product.name,
            quantity=item_input.quantity,
            unit_price=float(product.selling_price),
            unit_cost=float(product.cost_price),
            line_total=line_total,
            line_profit=line_total - line_cost,
        ))

    total   = subtotal - body.discount_amount
    profit  = total - total_cost

    txn = SaleTransaction(
        id=uuid.uuid4(),
        tenant_id=current_user.tenant_id,
        customer_id=body.customer_id,
        subtotal=subtotal,
        discount_amount=body.discount_amount,
        total=total,
        total_cost=total_cost,
        profit=profit,
        payment_method=body.payment_method,
        notes=body.notes,
    )
    db.add(txn)
    await db.flush()

    for si in sale_items:
        si.transaction_id = txn.id
        db.add(si)

    # Update customer stats if customer provided
    if body.customer_id:
        result = await db.execute(select(Customer).where(Customer.id == body.customer_id, Customer.tenant_id == current_user.tenant_id))
        customer = result.scalar_one_or_none()
        if customer:
            customer.total_spent = float(customer.total_spent or 0) + total
            customer.visit_count = (customer.visit_count or 0) + 1
            customer.last_purchase_at = datetime.now(timezone.utc)
            db.add(customer)

    await db.commit()
    await cache_invalidate_tenant(str(current_user.tenant_id))
    logger.info("Sale recorded: txn=%s total=%.2f tenant=%s", txn.id, total, current_user.tenant_id)

    return {
        "transaction_id": str(txn.id),
        "total": total,
        "profit": profit,
        "items_count": len(sale_items),
    }


# ── GET /dashboard ─────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def sales_dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Today's KPIs. Cached 5 min per tenant.
    Returns: revenue, profit, units_sold, transaction_count, avg_order_value,
             revenue_change_pct (vs yesterday), top_products (today top 5).
    """
    cache_key = tenant_key(str(current_user.tenant_id), "dashboard:today")
    if cached := await cache_get(cache_key):
        return cached

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)

    async def period_stats(start: datetime, end: datetime) -> dict:
        result = await db.execute(
            select(
                func.coalesce(func.sum(SaleTransaction.total), 0).label("revenue"),
                func.coalesce(func.sum(SaleTransaction.profit), 0).label("profit"),
                func.count().label("transactions"),
            ).where(
                SaleTransaction.tenant_id == current_user.tenant_id,
                SaleTransaction.created_at >= start,
                SaleTransaction.created_at < end,
            )
        )
        row = result.one()
        # Units sold
        units_result = await db.execute(
            select(func.coalesce(func.sum(SaleItem.quantity), 0))
            .join(SaleTransaction, SaleItem.transaction_id == SaleTransaction.id)
            .where(
                SaleTransaction.tenant_id == current_user.tenant_id,
                SaleTransaction.created_at >= start,
                SaleTransaction.created_at < end,
            )
        )
        units = units_result.scalar() or 0
        return {"revenue": float(row.revenue), "profit": float(row.profit),
                "transactions": row.transactions, "units": int(units)}

    today_stats = await period_stats(today_start, today_start + timedelta(days=1))
    yesterday_stats = await period_stats(yesterday_start, today_start)

    def pct_change(new: float, old: float) -> float:
        if old == 0:
            return 100.0 if new > 0 else 0.0
        return round(((new - old) / old) * 100, 1)

    # Top 5 products today
    top_result = await db.execute(
        select(SaleItem.product_name, func.sum(SaleItem.line_total).label("revenue"), func.sum(SaleItem.quantity).label("units"))
        .join(SaleTransaction, SaleItem.transaction_id == SaleTransaction.id)
        .where(SaleTransaction.tenant_id == current_user.tenant_id, SaleTransaction.created_at >= today_start)
        .group_by(SaleItem.product_name)
        .order_by(func.sum(SaleItem.line_total).desc())
        .limit(5)
    )
    top_products = [{"name": r.product_name, "revenue": float(r.revenue), "units": int(r.units)} for r in top_result]

    data = {
        "revenue": today_stats["revenue"],
        "profit": today_stats["profit"],
        "units_sold": today_stats["units"],
        "transaction_count": today_stats["transactions"],
        "avg_order_value": round(today_stats["revenue"] / max(today_stats["transactions"], 1), 2),
        "revenue_change_pct": pct_change(today_stats["revenue"], yesterday_stats["revenue"]),
        "profit_change_pct": pct_change(today_stats["profit"], yesterday_stats["profit"]),
        "units_change_pct": pct_change(today_stats["units"], yesterday_stats["units"]),
        "top_products": top_products,
    }
    await cache_set(cache_key, data, settings.CACHE_TTL_DASHBOARD)
    return data


# ── GET /trends ────────────────────────────────────────────────────────────────

@router.get("/trends")
async def sales_trends(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    period: str = Query("weekly", description="daily|weekly|monthly"),
    days: int = Query(30, ge=7, le=365),
):
    """
    Time-series revenue + profit aggregated by period.
    Used by the RevenueChart component on the dashboard and forecasts page.
    Returns list of {date, revenue, profit} objects.
    """
    cache_key = tenant_key(str(current_user.tenant_id), f"trends:{period}:{days}")
    if cached := await cache_get(cache_key):
        return cached

    since = datetime.now(timezone.utc) - timedelta(days=days)

    if period == "daily":
        trunc = "day"
    elif period == "weekly":
        trunc = "week"
    else:
        trunc = "month"

    result = await db.execute(text("""
        SELECT
            date_trunc(:trunc, created_at AT TIME ZONE 'UTC') AS period,
            COALESCE(SUM(total), 0)  AS revenue,
            COALESCE(SUM(profit), 0) AS profit
        FROM sale_transactions
        WHERE tenant_id = :tenant_id AND created_at >= :since
        GROUP BY 1
        ORDER BY 1
    """), {"trunc": trunc, "tenant_id": str(current_user.tenant_id), "since": since})

    rows = result.fetchall()
    data = [{"date": str(r[0])[:10], "revenue": float(r[1]), "profit": float(r[2])} for r in rows]
    await cache_set(cache_key, data, settings.CACHE_TTL_DASHBOARD)
    return data


# ── GET /top-products ──────────────────────────────────────────────────────────

@router.get("/top-products")
async def top_products(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(30),
    limit: int = Query(10),
):
    """Products ranked by revenue over the last N days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(SaleItem.product_id, SaleItem.product_name,
               func.sum(SaleItem.line_total).label("revenue"),
               func.sum(SaleItem.quantity).label("units"),
               func.sum(SaleItem.line_profit).label("profit"))
        .join(SaleTransaction, SaleItem.transaction_id == SaleTransaction.id)
        .where(SaleTransaction.tenant_id == current_user.tenant_id, SaleTransaction.created_at >= since)
        .group_by(SaleItem.product_id, SaleItem.product_name)
        .order_by(func.sum(SaleItem.line_total).desc())
        .limit(limit)
    )
    return [{"product_id": str(r.product_id), "name": r.product_name,
             "revenue": float(r.revenue), "units": int(r.units), "profit": float(r.profit)} for r in result]


# ── GET /slow-movers ───────────────────────────────────────────────────────────

@router.get("/slow-movers")
async def slow_movers(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(30, description="Products with no sales in this many days"),
    limit: int = Query(20),
):
    """
    Products with zero or near-zero sales velocity.
    Cross-referenced against current stock > 0 so we only flag products
    that are sitting on the shelf costing money.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    # Products that had NO sale in the last N days but still have stock
    sold_ids_result = await db.execute(
        select(SaleItem.product_id.distinct())
        .join(SaleTransaction)
        .where(SaleTransaction.tenant_id == current_user.tenant_id, SaleTransaction.created_at >= since)
    )
    sold_ids = {row[0] for row in sold_ids_result}

    result = await db.execute(
        select(Product)
        .where(Product.tenant_id == current_user.tenant_id, Product.is_active == True, Product.quantity > 0)
        .order_by(Product.quantity.desc())
        .limit(limit * 2)
    )
    products = result.scalars().all()
    slow = [p for p in products if p.id not in sold_ids][:limit]

    return [{
        "id": str(p.id), "name": p.name, "quantity": p.quantity,
        "stock_value": float(p.cost_price) * p.quantity,
        "days_no_sale": days,
        "expiry_date": str(p.expiry_date) if p.expiry_date else None,
    } for p in slow]
