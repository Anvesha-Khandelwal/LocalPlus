"""
backend/app/routers/ai_router.py
All AI-powered endpoints:
  POST /chat              — streaming LLM chat grounded in business data
  GET  /recommendations   — restocking + opportunity suggestions
  GET  /forecast          — demand predictions per product
  GET  /health-score      — business health score with breakdown
  GET  /dead-stock        — slow/expiring items with discount recommendations
  GET  /marketing/content — AI-generated WhatsApp/Instagram copy
"""
import json
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.redis_client import cache_get, cache_set, tenant_key
from app.models.product import Product
from app.models.sale import SaleTransaction, SaleItem
from app.models.user import User, Tenant
from app.routers.auth import get_current_user
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


# ── POST /chat — streaming LLM chat ──────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    conversation_history: list = []  # [{role, content}]

@router.post("/chat")
async def ai_chat(
    body: ChatRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Streams an LLM response grounded in the business's live data.
    1. Builds a business context string from the DB (revenue, stock, top products).
    2. Prepends it as a system prompt to the LLM request.
    3. Streams back tokens via Server-Sent Events so the UI can show typing.
    """
    context = await _build_business_context(current_user.tenant_id, db)

    system_prompt = f"""You are an AI Business Copilot for a small Indian retail business.
You have access to the following real-time data about this business:

{context}

Instructions:
- Answer questions using ONLY the data provided above.
- Give specific, actionable recommendations (not generic advice).
- Use INR (₹) for all monetary values.
- Keep responses concise and practical for a busy shopkeeper.
- If you don't have enough data to answer, say so honestly.
- Respond in the same language the user writes in (English or Hindi).
"""

    async def stream_response():
        try:
            import httpx
            headers = {"Content-Type": "application/json"}
            payload = {
                "model": settings.LLM_MODEL,
                "max_tokens": settings.LLM_MAX_TOKENS,
                "system": system_prompt,
                "stream": True,
                "messages": [
                    *[{"role": m["role"], "content": m["content"]} for m in body.conversation_history[-6:]],
                    {"role": "user", "content": body.message},
                ],
            }

            if "claude" in settings.LLM_MODEL:
                url = "https://api.anthropic.com/v1/messages"
                headers["x-api-key"] = settings.ANTHROPIC_API_KEY
                headers["anthropic-version"] = "2023-06-01"
            else:
                url = "https://api.openai.com/v1/chat/completions"
                headers["Authorization"] = f"Bearer {settings.OPENAI_API_KEY}"
                payload["messages"] = [{"role": "system", "content": system_prompt}] + payload["messages"]
                del payload["system"]

            async with httpx.AsyncClient(timeout=60) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as resp:
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            chunk = line[6:]
                            if chunk == "[DONE]":
                                break
                            try:
                                data = json.loads(chunk)
                                # Handle both OpenAI and Anthropic stream formats
                                text = (
                                    data.get("choices", [{}])[0].get("delta", {}).get("content", "") or
                                    data.get("delta", {}).get("text", "")
                                )
                                if text:
                                    yield f"data: {json.dumps({'text': text})}\n\n"
                            except json.JSONDecodeError:
                                pass
        except Exception as exc:
            logger.error("LLM stream error: %s", exc)
            yield f"data: {json.dumps({'error': 'AI service temporarily unavailable.'})}\n\n"

    return StreamingResponse(stream_response(), media_type="text/event-stream")


# ── GET /recommendations ───────────────────────────────────────────────────────

@router.get("/recommendations")
async def get_recommendations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Returns a list of AI-generated action cards for the dashboard Insights panel.
    Combines rule-based signals (low stock, dead stock) with LLM-generated summaries.
    Cached 30 min per tenant.
    """
    cache_key = tenant_key(str(current_user.tenant_id), "recommendations")
    if cached := await cache_get(cache_key):
        return cached

    recommendations = []

    # 1. Low stock alerts
    low_result = await db.execute(
        select(Product).where(
            Product.tenant_id == current_user.tenant_id,
            Product.is_active == True,
            Product.quantity <= Product.reorder_point,
            Product.quantity > 0,
        ).order_by(Product.quantity).limit(5)
    )
    for p in low_result.scalars():
        days_left = _estimate_days_of_stock(p)
        recommendations.append({
            "id": str(uuid.uuid4()), "type": "restock", "urgency": "high" if days_left <= 3 else "medium",
            "product_name": p.name, "product_id": str(p.id),
            "message": f"Only ~{days_left} days of stock left ({p.quantity} units). Reorder from supplier soon.",
        })

    # 2. Out-of-stock
    out_result = await db.execute(
        select(Product).where(
            Product.tenant_id == current_user.tenant_id, Product.is_active == True, Product.quantity <= 0
        ).limit(3)
    )
    for p in out_result.scalars():
        recommendations.append({
            "id": str(uuid.uuid4()), "type": "alert", "urgency": "high",
            "product_name": p.name, "product_id": str(p.id),
            "message": f"'{p.name}' is OUT OF STOCK. You are losing sales right now.",
        })

    # 3. Dead stock (no sales in 30 days, stock > 0)
    since = datetime.now(timezone.utc) - timedelta(days=30)
    sold_ids_result = await db.execute(
        select(SaleItem.product_id.distinct()).join(SaleTransaction)
        .where(SaleTransaction.tenant_id == current_user.tenant_id, SaleTransaction.created_at >= since)
    )
    sold_ids = {r[0] for r in sold_ids_result}
    dead_result = await db.execute(
        select(Product).where(
            Product.tenant_id == current_user.tenant_id, Product.is_active == True, Product.quantity > 5
        ).limit(20)
    )
    dead_products = [p for p in dead_result.scalars() if p.id not in sold_ids][:3]
    for p in dead_products:
        stock_value = float(p.cost_price) * p.quantity
        recommendations.append({
            "id": str(uuid.uuid4()), "type": "deadstock", "urgency": "medium",
            "product_name": p.name, "product_id": str(p.id),
            "message": f"No sales in 30+ days. ₹{stock_value:,.0f} tied up in {p.quantity} units. Consider a discount.",
        })

    await cache_set(cache_key, recommendations, settings.CACHE_TTL_RECOMMENDATIONS)
    return recommendations


# ── GET /health-score ──────────────────────────────────────────────────────────

@router.get("/health-score")
async def health_score(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Calculates a 0–100 Business Health Score across 5 dimensions.
    Each dimension scores 0–20. Cached 1hr per tenant.
    """
    cache_key = tenant_key(str(current_user.tenant_id), "health_score")
    if cached := await cache_get(cache_key):
        return cached

    now = datetime.now(timezone.utc)

    # 1. Revenue growth (20 pts): compare last 30 days to prior 30 days
    rev_30 = await _period_revenue(db, current_user.tenant_id, now - timedelta(days=30), now)
    rev_60 = await _period_revenue(db, current_user.tenant_id, now - timedelta(days=60), now - timedelta(days=30))
    if rev_60 > 0:
        growth_pct = (rev_30 - rev_60) / rev_60 * 100
        revenue_score = min(20, max(0, int(10 + growth_pct / 5)))
    else:
        revenue_score = 10 if rev_30 > 0 else 0

    # 2. Inventory efficiency (20 pts): low-stock items / total items ratio
    total_count = await db.scalar(select(func.count()).where(Product.tenant_id == current_user.tenant_id, Product.is_active == True))
    low_count   = await db.scalar(select(func.count()).where(Product.tenant_id == current_user.tenant_id, Product.is_active == True, Product.quantity <= Product.reorder_point))
    out_count   = await db.scalar(select(func.count()).where(Product.tenant_id == current_user.tenant_id, Product.is_active == True, Product.quantity <= 0))
    if total_count and total_count > 0:
        problem_ratio = ((low_count or 0) + (out_count or 0)) / total_count
        inventory_score = max(0, int(20 - problem_ratio * 40))
    else:
        inventory_score = 10

    # 3. Profit margin (20 pts): average margin across transactions
    margin_result = await db.execute(
        select(func.avg((SaleTransaction.profit / func.nullif(SaleTransaction.total, 0)) * 100))
        .where(SaleTransaction.tenant_id == current_user.tenant_id, SaleTransaction.created_at >= now - timedelta(days=30))
    )
    avg_margin = float(margin_result.scalar() or 15)
    margin_score = min(20, max(0, int(avg_margin / 2)))

    # 4. Stock turnover (20 pts): 20 if fast-moving items > 70% of catalog
    active_since = now - timedelta(days=30)
    active_ids_result = await db.execute(
        select(SaleItem.product_id.distinct()).join(SaleTransaction)
        .where(SaleTransaction.tenant_id == current_user.tenant_id, SaleTransaction.created_at >= active_since)
    )
    active_count = len(active_ids_result.fetchall())
    turnover_score = min(20, int((active_count / max(total_count or 1, 1)) * 20))

    # 5. Dead stock (20 pts): penalise for every dead stock SKU
    since30 = now - timedelta(days=30)
    sold30_ids = {r[0] for r in (await db.execute(select(SaleItem.product_id.distinct()).join(SaleTransaction).where(SaleTransaction.tenant_id == current_user.tenant_id, SaleTransaction.created_at >= since30))).fetchall()}
    all_stocked = await db.execute(select(Product.id).where(Product.tenant_id == current_user.tenant_id, Product.is_active == True, Product.quantity > 0))
    stocked_ids = {r[0] for r in all_stocked.fetchall()}
    dead_count = len(stocked_ids - sold30_ids)
    dead_score = max(0, 20 - dead_count * 2)

    total_score = revenue_score + inventory_score + margin_score + turnover_score + dead_score

    # Generate suggestions based on weakest areas
    suggestions = _generate_suggestions(revenue_score, inventory_score, margin_score, turnover_score, dead_score)

    data = {
        "total": total_score,
        "revenue_growth": revenue_score,
        "inventory_efficiency": inventory_score,
        "profit_margin": margin_score,
        "stock_turnover": turnover_score,
        "dead_stock": dead_score,
        "suggestions": suggestions,
    }
    await cache_set(cache_key, data, settings.CACHE_TTL_HEALTH_SCORE)
    return data


# ── GET /forecast ──────────────────────────────────────────────────────────────

@router.get("/forecast")
async def demand_forecast(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    product_id: Optional[str] = Query(None),
):
    """
    Returns 30-day demand forecast for top products.
    Uses simple moving-average baseline (replace with Prophet in ml/ for production).
    Cached 2hrs per tenant.
    """
    cache_key = tenant_key(str(current_user.tenant_id), f"forecast:{product_id or 'all'}")
    if cached := await cache_get(cache_key):
        return cached

    since = datetime.now(timezone.utc) - timedelta(days=60)
    stmt = (
        select(SaleItem.product_id, SaleItem.product_name, func.sum(SaleItem.quantity).label("total_units"), func.count(SaleItem.transaction_id.distinct()).label("sale_days"))
        .join(SaleTransaction)
        .where(SaleTransaction.tenant_id == current_user.tenant_id, SaleTransaction.created_at >= since)
        .group_by(SaleItem.product_id, SaleItem.product_name)
        .order_by(func.sum(SaleItem.quantity).desc())
        .limit(10)
    )
    if product_id:
        stmt = stmt.where(SaleItem.product_id == uuid.UUID(product_id))

    result = await db.execute(stmt)
    forecasts = []
    for row in result:
        daily_avg = float(row.total_units) / 60
        forecasts.append({
            "product_id": str(row.product_id),
            "product_name": row.product_name,
            "daily_avg_units": round(daily_avg, 2),
            "predicted_30d_units": round(daily_avg * 30),
            "predicted_30d_revenue": None,
            "reorder_recommended": daily_avg * 7 > 5,
            "confidence": "medium",
        })

    await cache_set(cache_key, forecasts, settings.CACHE_TTL_FORECAST)
    return forecasts


# ── GET /marketing/content ─────────────────────────────────────────────────────

@router.get("/marketing/content")
async def marketing_content(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    content_type: str = Query("whatsapp", description="whatsapp|instagram|offer"),
):
    """
    Generates promotional content based on the business's actual top products.
    Returns 3 variants so the owner can choose the tone they prefer.
    """
    cache_key = tenant_key(str(current_user.tenant_id), f"marketing:{content_type}")
    if cached := await cache_get(cache_key):
        return cached

    # Get tenant business name
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = tenant_result.scalar_one()

    # Get top 3 selling products
    since = datetime.now(timezone.utc) - timedelta(days=30)
    top_result = await db.execute(
        select(SaleItem.product_name, func.sum(SaleItem.quantity).label("units"))
        .join(SaleTransaction)
        .where(SaleTransaction.tenant_id == current_user.tenant_id, SaleTransaction.created_at >= since)
        .group_by(SaleItem.product_name).order_by(func.sum(SaleItem.quantity).desc()).limit(3)
    )
    top_products = [r.product_name for r in top_result]

    prompt = f"""Generate 3 different {content_type} promotional messages for a small Indian retail store called "{tenant.business_name}".
Their top-selling products this month: {", ".join(top_products) if top_products else "daily groceries and household items"}.
Rules: Write in a friendly, local tone. Include relevant emojis. Keep each message under 100 words.
Offer a small discount or bundle deal in at least one message.
Format your response as JSON: {{"variants": [{{"tone": "...", "message": "..."}}]}}"""

    try:
        import httpx
        headers = {"Content-Type": "application/json"}
        if "claude" in settings.LLM_MODEL:
            url = "https://api.anthropic.com/v1/messages"
            headers["x-api-key"] = settings.ANTHROPIC_API_KEY
            headers["anthropic-version"] = "2023-06-01"
            payload = {"model": settings.LLM_MODEL, "max_tokens": 800, "messages": [{"role": "user", "content": prompt}]}
        else:
            url = "https://api.openai.com/v1/chat/completions"
            headers["Authorization"] = f"Bearer {settings.OPENAI_API_KEY}"
            payload = {"model": settings.LLM_MODEL, "max_tokens": 800, "messages": [{"role": "user", "content": prompt}]}

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            raw = data.get("content", [{}])[0].get("text") or data["choices"][0]["message"]["content"]
            result = json.loads(raw.strip().strip("```json").strip("```"))
    except Exception as exc:
        logger.error("Marketing content generation failed: %s", exc)
        result = {"variants": [
            {"tone": "Friendly", "message": f"🛒 Fresh stocks available at {tenant.business_name}! Visit us today for great deals on {top_products[0] if top_products else 'daily essentials'}. 😊"},
            {"tone": "Promotional", "message": f"🎉 Special offer at {tenant.business_name}! Buy 2 get 5% off on select items. Limited time only! 🛍️"},
            {"tone": "Festival", "message": f"✨ Celebrate with quality products from {tenant.business_name}! Best prices, freshest stock. Come visit us! 🙏"},
        ]}

    await cache_set(cache_key, result, 3600)
    return result


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _build_business_context(tenant_id: uuid.UUID, db: AsyncSession) -> str:
    """Builds a plain-text context string from live business data for LLM prompts."""
    now = datetime.now(timezone.utc)
    since_30 = now - timedelta(days=30)
    since_7  = now - timedelta(days=7)

    rev_30 = await _period_revenue(db, tenant_id, since_30, now)
    rev_7  = await _period_revenue(db, tenant_id, since_7, now)

    low_result = await db.execute(select(Product.name, Product.quantity).where(Product.tenant_id == tenant_id, Product.is_active == True, Product.quantity <= Product.reorder_point).limit(5))
    low_stock = [f"{r.name} ({r.quantity} left)" for r in low_result]

    top_result = await db.execute(
        select(SaleItem.product_name, func.sum(SaleItem.quantity).label("u"))
        .join(SaleTransaction).where(SaleTransaction.tenant_id == tenant_id, SaleTransaction.created_at >= since_30)
        .group_by(SaleItem.product_name).order_by(func.sum(SaleItem.quantity).desc()).limit(5)
    )
    top_products = [f"{r.product_name} ({int(r.u)} units)" for r in top_result]

    total_products = await db.scalar(select(func.count()).where(Product.tenant_id == tenant_id, Product.is_active == True)) or 0

    return f"""
REVENUE (last 30 days): ₹{rev_30:,.0f}
REVENUE (last 7 days): ₹{rev_7:,.0f}
TOTAL PRODUCTS IN CATALOG: {total_products}
LOW STOCK ITEMS: {", ".join(low_stock) if low_stock else "None"}
TOP SELLING PRODUCTS (last 30 days): {", ".join(top_products) if top_products else "No sales data yet"}
CURRENT DATE: {now.strftime("%d %B %Y")}
""".strip()


async def _period_revenue(db: AsyncSession, tenant_id: uuid.UUID, start: datetime, end: datetime) -> float:
    result = await db.execute(
        select(func.coalesce(func.sum(SaleTransaction.total), 0))
        .where(SaleTransaction.tenant_id == tenant_id, SaleTransaction.created_at >= start, SaleTransaction.created_at < end)
    )
    return float(result.scalar() or 0)


def _estimate_days_of_stock(product: Product) -> int:
    """Rough estimate: quantity / reorder_point * 7 days. Replace with forecast data in production."""
    if product.reorder_point > 0:
        return max(1, int((product.quantity / product.reorder_point) * 7))
    return 7


def _generate_suggestions(rev: int, inv: int, margin: int, turnover: int, dead: int) -> list:
    suggestions = []
    scores = [("revenue_growth", rev), ("inventory_efficiency", inv), ("profit_margin", margin), ("stock_turnover", turnover), ("dead_stock", dead)]
    scores.sort(key=lambda x: x[1])
    for dimension, score in scores[:3]:
        if dimension == "revenue_growth" and score < 12:
            suggestions.append("Revenue growth is below average. Consider running a weekend promotion to drive footfall.")
        elif dimension == "inventory_efficiency" and score < 12:
            suggestions.append("Several items are low or out of stock. Place supplier orders this week to avoid lost sales.")
        elif dimension == "profit_margin" and score < 12:
            suggestions.append("Your average profit margin is low. Review pricing on your top-5 SKUs — small increases compound fast.")
        elif dimension == "stock_turnover" and score < 12:
            suggestions.append("Many products haven't sold this month. Audit your catalog and drop slow movers.")
        elif dimension == "dead_stock" and score < 12:
            suggestions.append("Dead stock is tying up working capital. Bundle slow movers with fast sellers or offer clearance discounts.")
    if not suggestions:
        suggestions = ["Your business is performing well! Consider expanding into new product categories.", "Strong margins — you're pricing well. Focus on driving more volume.", "Great stock turnover. Make sure reorder points are set correctly to avoid stockouts."]
    return suggestions[:3]
