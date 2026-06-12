"""
backend/app/routers/customers.py
Customer management: CRUD, segments, CLV, and purchase history.
GET  /           — list customers with RFM segment filter
POST /           — create a customer
GET  /{id}       — customer profile + purchase history
GET  /segments   — counts by segment (for marketing page)
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.sale import Customer, SaleTransaction
from app.models.user import User
from app.routers.auth import get_current_user

router = APIRouter()


class CustomerCreate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = Field(None, pattern=r"^\+?[0-9]{10,15}$")
    email: Optional[str] = None


@router.get("")
async def list_customers(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    segment: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    skip: int = 0, limit: int = 50,
):
    stmt = select(Customer).where(Customer.tenant_id == current_user.tenant_id, Customer.is_active == True)
    if segment:
        stmt = stmt.where(Customer.segment == segment)
    if q:
        stmt = stmt.where(Customer.name.ilike(f"%{q}%") | Customer.phone.ilike(f"%{q}%"))
    stmt = stmt.order_by(Customer.total_spent.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    customers = result.scalars().all()
    return [{"id": str(c.id), "name": c.name, "phone": c.phone, "segment": c.segment,
             "total_spent": float(c.total_spent or 0), "visit_count": c.visit_count,
             "last_purchase_at": str(c.last_purchase_at) if c.last_purchase_at else None} for c in customers]


@router.post("", status_code=201)
async def create_customer(
    body: CustomerCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    customer = Customer(id=uuid.uuid4(), tenant_id=current_user.tenant_id, **body.model_dump(exclude_none=True))
    db.add(customer)
    await db.commit()
    return {"id": str(customer.id)}


@router.get("/segments")
async def segment_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Returns customer count per RFM segment for the marketing dashboard."""
    result = await db.execute(
        select(Customer.segment, func.count().label("count"))
        .where(Customer.tenant_id == current_user.tenant_id, Customer.is_active == True)
        .group_by(Customer.segment)
    )
    return {r.segment or "unknown": r.count for r in result}


@router.get("/{customer_id}")
async def get_customer(
    customer_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Returns customer profile + last 10 transactions."""
    from fastapi import HTTPException
    result = await db.execute(select(Customer).where(Customer.id == customer_id, Customer.tenant_id == current_user.tenant_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(404, "Customer not found.")

    txn_result = await db.execute(
        select(SaleTransaction).where(SaleTransaction.customer_id == customer_id)
        .order_by(SaleTransaction.created_at.desc()).limit(10)
    )
    transactions = [{"id": str(t.id), "total": float(t.total), "profit": float(t.profit),
                     "payment_method": t.payment_method, "created_at": str(t.created_at)}
                    for t in txn_result.scalars()]

    return {"id": str(customer.id), "name": customer.name, "phone": customer.phone,
            "email": customer.email, "segment": customer.segment,
            "total_spent": float(customer.total_spent or 0), "visit_count": customer.visit_count,
            "last_purchase_at": str(customer.last_purchase_at) if customer.last_purchase_at else None,
            "recent_transactions": transactions}
