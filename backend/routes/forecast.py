from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
from database import get_db, Sale, Product
from models.schemas import ForecastRequest, ForecastResponse, DayForecast
from auth import get_current_user, User
from services.demand_oracle import run_demand_oracle

router = APIRouter(prefix="/forecast", tags=["forecast"])


@router.post("/", response_model=ForecastResponse)
async def get_forecast(
    data: ForecastRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    product = db.query(Product).filter(
        Product.id == data.product_id, Product.owner_id == user.id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Fetch 90-day sales history for this product
    since = date.today() - timedelta(days=90)
    rows = (
        db.query(func.date(Sale.sold_at).label("day"), func.sum(Sale.quantity).label("qty"))
        .filter(Sale.owner_id == user.id, Sale.product_id == data.product_id, Sale.sold_at >= since)
        .group_by(func.date(Sale.sold_at))
        .order_by(func.date(Sale.sold_at))
        .all()
    )
    history = [{"date": str(r.day), "qty": float(r.qty)} for r in rows]

    # Seed demo data if shop is new (< 5 days of history)
    if len(history) < 5:
        today = date.today()
        import random, math
        history = [
            {"date": str(today - timedelta(days=d)), "qty": round(10 + 4 * math.sin(d / 7 * 3.14) + random.uniform(-2, 2), 1)}
            for d in range(30, 0, -1)
        ]

    city = user.city or data.city or "Bengaluru"
    forecasts_raw, alert, reorder_by = await run_demand_oracle(
        history=history,
        product_name=product.name,
        unit=product.unit,
        city=city,
        days=data.days,
    )

    forecasts = [DayForecast(**f) for f in forecasts_raw]
    return ForecastResponse(
        product_name=product.name,
        unit=product.unit,
        forecasts=forecasts,
        alert=alert,
        reorder_by=reorder_by,
    )