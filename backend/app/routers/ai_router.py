"""
backend/app/routers/ai_router.py
Changes: offline fallback mode, business_type-aware prompts, improved health score, graceful error handling.
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
from app.models.sale import SaleTransaction, SaleItem, Customer
from app.models.user import User, Tenant
from app.routers.auth import get_current_user
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


def _has_llm_key() -> bool:
    return bool(settings.OPENAI_API_KEY or settings.ANTHROPIC_API_KEY)


# ── POST /chat ─────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    conversation_history: list = []


@router.post("/chat")
async def ai_chat(
    body: ChatRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    context = await _build_business_context(current_user.tenant_id, db)
    tenant = await _get_tenant(db, current_user.tenant_id)
    business_type = tenant.business_type or "retail store"

    system_prompt = f"""You are an AI Business Copilot for a small Indian {business_type}.
You have access to this real-time business data:

{context}

Instructions:
- Answer using ONLY the data provided above.
- Give specific, actionable recommendations (not generic advice).
- Use INR (₹) for all monetary values.
- Keep responses concise and practical for a busy shopkeeper.
- If you don't have enough data, say so honestly.
- Respond in the same language the user writes in (English or Hindi).
"""

    if not _has_llm_key():
        # Offline fallback — generate rule-based response from context
        async def offline_stream():
            warning = "⚠️ **AI service not configured** (no API key set). Here's what I can tell from your data:\n\n"
            for char in warning:
                yield f"data: {json.dumps({'text': char})}\n\n"
            response = _generate_offline_response(body.message, context, business_type)
            for char in response:
                yield f"data: {json.dumps({'text': char})}\n\n"
        return StreamingResponse(offline_stream(), media_type="text/event-stream")

    async def stream_response():
        try:
            import httpx
            headers = {"Content-Type": "application/json"}
            payload = {
                "model": settings.LLM_MODEL,
                "max_tokens": settings.LLM_MAX_TOKENS,
                "stream": True,
                "messages": [
                    *[{"role": m["role"], "content": m["content"]} for m in body.conversation_history[-6:]],
                    {"role": "user", "content": body.message},
                ],
            }

            if settings.ANTHROPIC_API_KEY and "claude" in settings.LLM_MODEL.lower():
                url = "https://api.anthropic.com/v1/messages"
                headers["x-api-key"] = settings.ANTHROPIC_API_KEY
                headers["anthropic-version"] = "2023-06-01"
                payload["system"] = system_prompt
            else:
                url = "https://api.openai.com/v1/chat/completions"
                headers["Authorization"] = f"Bearer {settings.OPENAI_API_KEY}"
                payload["messages"] = [{"role": "system", "content": system_prompt}] + payload["messages"]

            async with httpx.AsyncClient(timeout=60) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as resp:
                    if resp.status_code != 200:
                        error_body = await resp.aread()
                        logger.error("LLM API error %d: %s", resp.status_code, error_body[:200])
                        yield f"data: {json.dumps({'error': f'AI service error ({resp.status_code}). Check your API key.'})}\n\n"
                        return
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            chunk = line[6:]
                            if chunk == "[DONE]":
                                break
                            try:
                                data = json.loads(chunk)
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
            yield f"data: {json.dumps({'error': 'AI service temporarily unavailable. Please try again.'})}\n\n"

    return StreamingResponse(stream_response(), media_type="text/event-stream")


def _generate_offline_response(question: str, context: str, business_type: str) -> str:
    """Rule-based response when no LLM key is configured."""
    q = question.lower()
    if any(w in q for w in ["reorder", "stock", "buy", "order"]):
        return ("Based on your current inventory data, look for products where quantity is at or below "
                "the reorder point. Those need to be restocked immediately. "
                "Check the **Inventory** page — items highlighted in amber or red need urgent attention.")
    elif any(w in q for w in ["sales", "revenue", "money", "profit"]):
        return ("Your sales data is available on the **Dashboard** and **Sales** pages. "
                "Check the revenue trend chart to see your daily performance. "
                "The top products panel shows which items are generating the most revenue.")
    elif any(w in q for w in ["slow", "dead", "not selling"]):
        return ("Dead stock products are items that haven't sold in 30+ days. "
                "Go to the **Forecasts** page to see slow-moving items. "
                "Consider offering a discount or bundling them with fast-selling products.")
    elif any(w in q for w in ["health", "score", "performance"]):
        return ("Your **Business Health Score** is on the Health page. "
                "It considers revenue growth, inventory efficiency, profit margins, and more. "
                "Add products and record sales to generate a meaningful score.")
    else:
        return (f"I'm analyzing your {business_type} data. "
                "To get full AI-powered answers, add your OpenAI or Anthropic API key to the backend `.env` file. "
                "Meanwhile, check your Dashboard for key metrics and the Inventory page for stock levels.")


# ── GET /recommendations ───────────────────────────────────────────────────────

@router.get("/recommendations")
async def get_recommendations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    cache_key = tenant_key(str(current_user.tenant_id), "recommendations")
    if cached := await cache_get(cache_key):
        return cached

    recommendations = []

    # Low stock alerts
    low_result = await db.execute(
        select(Product).where(
            Product.tenant_id == current_user.tenant_id,
            Product.is_active == True,  # noqa: E712
            Product.quantity <= Product.reorder_point,
            Product.quantity > 0,
        ).order_by(Product.quantity).limit(5)
    )
    for p in low_result.scalars():
        days_left = _estimate_days_of_stock(p)
        recommendations.append({
            "id": str(uuid.uuid4()), "type": "restock",
            "urgency": "high" if days_left <= 3 else "medium",
            "product_name": p.name, "product_id": str(p.id),
            "message": f"Only ~{days_left} days of stock left ({p.quantity} units). Reorder from supplier soon.",
        })

    # Out of stock
    out_result = await db.execute(
        select(Product).where(
            Product.tenant_id == current_user.tenant_id,
            Product.is_active == True,  # noqa: E712
            Product.quantity <= 0
        ).limit(3)
    )
    for p in out_result.scalars():
        recommendations.append({
            "id": str(uuid.uuid4()), "type": "alert", "urgency": "high",
            "product_name": p.name, "product_id": str(p.id),
            "message": f"'{p.name}' is OUT OF STOCK. You are losing sales right now.",
        })

    # Dead stock (no sales in 30 days, stock > 0)
    since = datetime.now(timezone.utc) - timedelta(days=30)
    sold_ids_result = await db.execute(
        select(SaleItem.product_id.distinct()).join(SaleTransaction)
        .where(SaleTransaction.tenant_id == current_user.tenant_id, SaleTransaction.created_at >= since)
    )
    sold_ids = {r[0] for r in sold_ids_result}
    dead_result = await db.execute(
        select(Product).where(
            Product.tenant_id == current_user.tenant_id,
            Product.is_active == True,  # noqa: E712
            Product.quantity > 5
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

    # If no data yet — show helpful onboarding tip
    if not recommendations:
        recommendations.append({
            "id": str(uuid.uuid4()), "type": "opportunity", "urgency": "low",
            "product_name": None,
            "message": "Add products to your inventory and record sales to start receiving AI-powered recommendations.",
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
    5 dimensions, 20 pts each = 100 total:
    1. Sales Trends (revenue_growth)
    2. Low Stock Products (inventory_efficiency)
    3. Revenue Performance (profit_margin)
    4. Inventory Turnover (stock_turnover)
    5. Customer Engagement (customer_engagement) — NEW replaces dead_stock
    """
    cache_key = tenant_key(str(current_user.tenant_id), "health_score")
    if cached := await cache_get(cache_key):
        return cached

    now = datetime.now(timezone.utc)

    # Check if there's enough data
    total_products = await db.scalar(
        select(func.count()).where(Product.tenant_id == current_user.tenant_id, Product.is_active == True)  # noqa: E712
    ) or 0
    total_sales = await db.scalar(
        select(func.count()).where(SaleTransaction.tenant_id == current_user.tenant_id)
    ) or 0

    if total_products == 0 or total_sales == 0:
        data = {
            "insufficient_data": True,
            "total": 0,
            "revenue_growth": 0,
            "inventory_efficiency": 0,
            "profit_margin": 0,
            "stock_turnover": 0,
            "customer_engagement": 0,
            "suggestions": [
                "Add your products to the Inventory page to get started.",
                "Record your first sale using the Sales & POS page.",
                "Come back after a week of data for your full health score.",
            ],
        }
        return data

    # 1. Sales Trends — compare last 30 days to prior 30 days
    rev_30 = await _period_revenue(db, current_user.tenant_id, now - timedelta(days=30), now)
    rev_60 = await _period_revenue(db, current_user.tenant_id, now - timedelta(days=60), now - timedelta(days=30))
    if rev_60 > 0:
        growth_pct = (rev_30 - rev_60) / rev_60 * 100
        revenue_score = min(20, max(0, int(10 + growth_pct / 5)))
    else:
        revenue_score = 10 if rev_30 > 0 else 5

    # 2. Low Stock Products — penalise for low/out-of-stock items
    low_count = await db.scalar(
        select(func.count()).where(Product.tenant_id == current_user.tenant_id,
            Product.is_active == True, Product.quantity <= Product.reorder_point)  # noqa: E712
    ) or 0
    out_count = await db.scalar(
        select(func.count()).where(Product.tenant_id == current_user.tenant_id,
            Product.is_active == True, Product.quantity <= 0)  # noqa: E712
    ) or 0
    problem_ratio = (low_count + out_count) / max(total_products, 1)
    inventory_score = max(0, int(20 - problem_ratio * 40))

    # 3. Revenue Performance — average profit margin
    margin_result = await db.execute(
        select(func.avg((SaleTransaction.profit / func.nullif(SaleTransaction.total, 0)) * 100))
        .where(SaleTransaction.tenant_id == current_user.tenant_id,
               SaleTransaction.created_at >= now - timedelta(days=30))
    )
    avg_margin = float(margin_result.scalar() or 15)
    margin_score = min(20, max(0, int(avg_margin / 2)))

    # 4. Inventory Turnover — products that sold in last 30 days
    active_since = now - timedelta(days=30)
    active_ids_result = await db.execute(
        select(SaleItem.product_id.distinct()).join(SaleTransaction)
        .where(SaleTransaction.tenant_id == current_user.tenant_id, SaleTransaction.created_at >= active_since)
    )
    active_count = len(active_ids_result.fetchall())
    turnover_score = min(20, int((active_count / max(total_products, 1)) * 20))

    # 5. Customer Engagement — ratio of repeat customers (visit_count > 1)
    total_customers = await db.scalar(
        select(func.count()).where(Customer.tenant_id == current_user.tenant_id, Customer.is_active == True)  # noqa: E712
    ) or 0
    repeat_customers = await db.scalar(
        select(func.count()).where(Customer.tenant_id == current_user.tenant_id,
            Customer.is_active == True, Customer.visit_count > 1)  # noqa: E712
    ) or 0

    if total_customers > 0:
        engagement_ratio = repeat_customers / total_customers
        customer_score = min(20, int(engagement_ratio * 20))
    else:
        # No customers tracked — give a neutral score, not zero
        customer_score = 10

    total_score = revenue_score + inventory_score + margin_score + turnover_score + customer_score

    suggestions = _generate_suggestions(revenue_score, inventory_score, margin_score, turnover_score, customer_score)

    data = {
        "insufficient_data": False,
        "total": total_score,
        "revenue_growth": revenue_score,
        "inventory_efficiency": inventory_score,
        "profit_margin": margin_score,
        "stock_turnover": turnover_score,
        "customer_engagement": customer_score,
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
    cache_key = tenant_key(str(current_user.tenant_id), f"forecast:{product_id or 'all'}")
    if cached := await cache_get(cache_key):
        return cached

    since = datetime.now(timezone.utc) - timedelta(days=60)
    stmt = (
        select(SaleItem.product_id, SaleItem.product_name,
               func.sum(SaleItem.quantity).label("total_units"))
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
            "reorder_recommended": daily_avg * 7 > 5,
            "confidence": "medium",
        })

    if not forecasts:
        return []

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
    Generates personalised marketing content with different strategies for each channel.
    WhatsApp: short, conversational, promotional, clear CTA.
    Instagram: storytelling, emoji-rich, hashtags, strong CTA.
    Offer: discount announcement, urgency-focused.
    """
    cache_key = tenant_key(str(current_user.tenant_id), f"marketing:{content_type}")
    if cached := await cache_get(cache_key):
        return cached

    tenant = await _get_tenant(db, current_user.tenant_id)
    business_type = tenant.business_type or "retail store"

    # Get top 3 products
    since = datetime.now(timezone.utc) - timedelta(days=30)
    top_result = await db.execute(
        select(SaleItem.product_name, func.sum(SaleItem.quantity).label("units"))
        .join(SaleTransaction)
        .where(SaleTransaction.tenant_id == current_user.tenant_id, SaleTransaction.created_at >= since)
        .group_by(SaleItem.product_name).order_by(func.sum(SaleItem.quantity).desc()).limit(3)
    )
    top_products = [r.product_name for r in top_result]
    products_str = ", ".join(top_products) if top_products else "our popular products"

    # Business-type specific tone guidance
    tone_guide = {
        "Grocery Store": "friendly, neighbourhood feel, value-focused",
        "Pharmacy": "professional, trustworthy, health-focused",
        "Clothing Store": "trendy, stylish, fashion-forward",
        "Electronics Shop": "tech-savvy, deal-focused, specification-driven",
        "Restaurant/Cafe": "warm, food-loving, inviting, appetizing",
        "Beauty/Cosmetics": "glamorous, self-care focused, aspirational",
        "Hardware Store": "practical, reliable, value-driven",
        "Other": "friendly, professional, value-focused",
    }
    tone = tone_guide.get(business_type, "friendly, professional, value-focused")

    # Different prompts per channel
    if content_type == "whatsapp":
        prompt = f"""Generate 3 WhatsApp broadcast messages for "{tenant.business_name}", a {business_type}.
Tone: {tone}. Top products: {products_str}.

Rules:
- Each message MUST be under 60 words
- Conversational, direct, personal tone (like texting a friend)
- Include ONE specific promotional offer (e.g. "10% off today only")
- End with a clear call-to-action (visit us, call now, reply YES)
- NO hashtags, NO emojis overload (max 2 per message)
- Each should feel like it comes from a real shopkeeper

Return ONLY valid JSON: {{"variants": [{{"tone": "...", "message": "..."}}]}}"""

    elif content_type == "instagram":
        prompt = f"""Generate 3 Instagram post captions for "{tenant.business_name}", a {business_type}.
Tone: {tone}. Top products: {products_str}.

Rules:
- Each caption 80-120 words
- Start with an attention-grabbing first line
- Use storytelling — paint a picture, evoke emotion
- 4-6 relevant emojis spread naturally through the text
- End with a strong CTA ("Shop now", "Visit us today", "DM for details")
- Add 8-10 relevant hashtags at the end
- Make each variant feel distinct (different angle/story)

Return ONLY valid JSON: {{"variants": [{{"tone": "...", "message": "..."}}]}}"""

    else:  # offer
        prompt = f"""Generate 3 sale/offer announcements for "{tenant.business_name}", a {business_type}.
Top products: {products_str}.

Rules:
- Each announcement under 80 words
- Lead with the offer/discount prominently
- Create urgency (limited time, today only, while stocks last)
- Include the store name
- Clear CTA

Return ONLY valid JSON: {{"variants": [{{"tone": "...", "message": "..."}}]}}"""

    if not _has_llm_key():
        # Offline fallback
        result = _generate_offline_marketing(content_type, tenant.business_name, business_type, top_products)
        await cache_set(cache_key, result, 3600)
        return result

    try:
        import httpx
        headers = {"Content-Type": "application/json"}
        if settings.ANTHROPIC_API_KEY:
            url = "https://api.anthropic.com/v1/messages"
            headers["x-api-key"] = settings.ANTHROPIC_API_KEY
            headers["anthropic-version"] = "2023-06-01"
            payload = {"model": settings.LLM_MODEL, "max_tokens": 1000,
                       "messages": [{"role": "user", "content": prompt}]}
        else:
            url = "https://api.openai.com/v1/chat/completions"
            headers["Authorization"] = f"Bearer {settings.OPENAI_API_KEY}"
            payload = {"model": settings.LLM_MODEL, "max_tokens": 1000,
                       "messages": [{"role": "user", "content": prompt}]}

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            raw = (data.get("content", [{}])[0].get("text") or
                   data["choices"][0]["message"]["content"])
            clean = raw.strip().strip("```json").strip("```").strip()
            result = json.loads(clean)
    except Exception as exc:
        logger.error("Marketing content generation failed: %s", exc)
        result = _generate_offline_marketing(content_type, tenant.business_name, business_type, top_products)

    await cache_set(cache_key, result, 3600)
    return result


def _generate_offline_marketing(content_type: str, business_name: str, business_type: str, top_products: list) -> dict:
    """Fallback marketing content when no API key is set."""
    product = top_products[0] if top_products else "our products"
    if content_type == "whatsapp":
        return {"variants": [
            {"tone": "Friendly",    "message": f"Hi! Fresh stock available at {business_name}. Visit us today and enjoy great deals on {product}. See you soon! 😊"},
            {"tone": "Promotional", "message": f"🎉 Special offer at {business_name}! Get 10% off on selected items today only. Limited stock — visit us now!"},
            {"tone": "Urgent",      "message": f"Last chance! {business_name} is offering exclusive deals this week. Don't miss out. Call or visit us today!"},
        ]}
    elif content_type == "instagram":
        return {"variants": [
            {"tone": "Aspirational", "message": f"✨ Discover the best at {business_name}! We bring you quality {product} and so much more. Your satisfaction is our priority. Visit us and experience the difference. 🛍️ #ShopLocal #{business_type.replace('/', '').replace(' ', '')}"},
            {"tone": "Community",    "message": f"💛 Thank you for making {business_name} your favourite! We're here every day with fresh stock and unbeatable prices. Come say hello! 👋 #LocalBusiness #CommunityFirst"},
            {"tone": "Product",      "message": f"🌟 {product} is flying off the shelves at {business_name}! Grab yours before it's gone. Quality you can trust, prices you'll love. 🔥 #MustHave #ShopNow"},
        ]}
    else:
        return {"variants": [
            {"tone": "Limited Time", "message": f"🏷️ SALE at {business_name}! 10% off on {product} — today only! Visit us before closing time. Hurry, limited stock!"},
            {"tone": "Weekend Deal", "message": f"Weekend Special at {business_name}! Buy 2 get 1 FREE on selected items. This weekend only. Don't miss out!"},
            {"tone": "Clearance",    "message": f"Clearance Sale at {business_name}! Massive discounts on {product} and more. First come, first served. Visit us today!"},
        ]}


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    return result.scalar_one()


async def _build_business_context(tenant_id: uuid.UUID, db: AsyncSession) -> str:
    now = datetime.now(timezone.utc)
    since_30 = now - timedelta(days=30)
    since_7 = now - timedelta(days=7)

    rev_30 = await _period_revenue(db, tenant_id, since_30, now)
    rev_7 = await _period_revenue(db, tenant_id, since_7, now)

    low_result = await db.execute(
        select(Product.name, Product.quantity)
        .where(Product.tenant_id == tenant_id, Product.is_active == True,  # noqa: E712
               Product.quantity <= Product.reorder_point)
        .limit(5)
    )
    low_stock = [f"{r.name} ({r.quantity} left)" for r in low_result]

    top_result = await db.execute(
        select(SaleItem.product_name, func.sum(SaleItem.quantity).label("u"))
        .join(SaleTransaction)
        .where(SaleTransaction.tenant_id == tenant_id, SaleTransaction.created_at >= since_30)
        .group_by(SaleItem.product_name).order_by(func.sum(SaleItem.quantity).desc()).limit(5)
    )
    top_products = [f"{r.product_name} ({int(r.u)} units)" for r in top_result]

    total_products = await db.scalar(
        select(func.count()).where(Product.tenant_id == tenant_id, Product.is_active == True)  # noqa: E712
    ) or 0

    return f"""
REVENUE (last 30 days): ₹{rev_30:,.0f}
REVENUE (last 7 days): ₹{rev_7:,.0f}
TOTAL PRODUCTS: {total_products}
LOW STOCK ITEMS: {", ".join(low_stock) if low_stock else "None"}
TOP SELLING PRODUCTS (last 30 days): {", ".join(top_products) if top_products else "No sales data yet"}
CURRENT DATE: {now.strftime("%d %B %Y")}
""".strip()


async def _period_revenue(db: AsyncSession, tenant_id: uuid.UUID, start: datetime, end: datetime) -> float:
    result = await db.execute(
        select(func.coalesce(func.sum(SaleTransaction.total), 0))
        .where(SaleTransaction.tenant_id == tenant_id,
               SaleTransaction.created_at >= start, SaleTransaction.created_at < end)
    )
    return float(result.scalar() or 0)


def _estimate_days_of_stock(product: Product) -> int:
    if product.reorder_point > 0:
        return max(1, int((product.quantity / product.reorder_point) * 7))
    return 7


def _generate_suggestions(rev: int, inv: int, margin: int, turnover: int, engagement: int) -> list:
    scores = [
        ("revenue_growth", rev, "Revenue is declining. Run a weekend promotion or introduce a loyalty discount."),
        ("inventory_efficiency", inv, "Several items are low or out of stock. Place supplier orders this week."),
        ("profit_margin", margin, "Your average profit margin is low. Review pricing on your top-5 SKUs."),
        ("stock_turnover", turnover, "Many products haven't sold this month. Audit your catalog and remove slow movers."),
        ("customer_engagement", engagement, "Low repeat customers. Start a simple loyalty program — even a punch card works."),
    ]
    scores.sort(key=lambda x: x[1])
    suggestions = [s[2] for s in scores[:3] if s[1] < 14]
    if not suggestions:
        suggestions = [
            "Great performance! Consider expanding into adjacent product categories.",
            "Strong margins — focus on volume to multiply profits.",
            "Good stock turnover. Ensure reorder points are set correctly to avoid stockouts.",
        ]
    return suggestions[:3]
