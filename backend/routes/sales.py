from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import date, timedelta
from database import get_db, Sale, Product
from models.schemas import SaleCreate, SaleOut
from auth import get_current_user, User

router = APIRouter(prefix="/sales", tags=["sales"])


@router.post("/", response_model=SaleOut)
def record_sale(data: SaleCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    product = db.query(Product).filter(Product.id == data.product_id, Product.owner_id == user.id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.stock < data.quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock")

    product.stock -= data.quantity
    sale = Sale(
        product_id = data.product_id,
        quantity   = data.quantity,
        total      = round(product.price * data.quantity, 2),
        owner_id   = user.id,
    )
    db.add(sale)
    db.commit()
    db.refresh(sale)
    return sale


@router.get("/", response_model=List[SaleOut])
def list_sales(days: int = 30, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    since = date.today() - timedelta(days=days)
    return (
        db.query(Sale)
        .filter(Sale.owner_id == user.id, Sale.sold_at >= since)
        .order_by(Sale.sold_at.desc())
        .all()
    )


@router.get("/summary")
def daily_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Last 7-day daily revenue totals for the dashboard chart."""
    rows = (
        db.query(func.date(Sale.sold_at).label("day"), func.sum(Sale.total).label("revenue"))
        .filter(Sale.owner_id == user.id)
        .group_by(func.date(Sale.sold_at))
        .order_by(func.date(Sale.sold_at).desc())
        .limit(7)
        .all()
    )
    return [{"day": str(r.day), "revenue": round(r.revenue, 2)} for r in reversed(rows)]


@router.get("/history/{product_id}")
def product_history(product_id: int, days: int = 90, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Daily quantity sold per product — used by the Demand Oracle."""
    since = date.today() - timedelta(days=days)
    rows = (
        db.query(func.date(Sale.sold_at).label("day"), func.sum(Sale.quantity).label("qty"))
        .filter(Sale.owner_id == user.id, Sale.product_id == product_id, Sale.sold_at >= since)
        .group_by(func.date(Sale.sold_at))
        .order_by(func.date(Sale.sold_at))
        .all()
    )
    return [{"date": str(r.day), "qty": float(r.qty)} for r in rows]