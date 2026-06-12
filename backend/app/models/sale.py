"""
backend/app/models/sale.py
ORM models for sales: SaleTransaction, SaleItem, Customer.

SaleTransaction is a single checkout event (like a POS receipt).
SaleItem is one line in that receipt (product + qty + price).
Customer is optional — anonymous sales are allowed.

We store unit_price and unit_cost AT TIME OF SALE so historical profit
calculations remain accurate even if prices change later.
"""
import uuid
from datetime import datetime, timezone
from typing import List

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Customer(Base):
    """
    Optional customer record. A sale can be anonymous (customer_id=None).
    Used for CLV analysis, churn prediction, and loyalty segmentation.
    """
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(20), index=True)
    email: Mapped[str | None] = mapped_column(String(320))
    # RFM segment — set by the nightly customer_segmentation Celery task
    segment: Mapped[str | None] = mapped_column(String(50))  # champion|loyal|at_risk|lost
    total_spent: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    visit_count: Mapped[int] = mapped_column(Integer, default=0)
    last_purchase_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    transactions: Mapped[List["SaleTransaction"]] = relationship("SaleTransaction", back_populates="customer")


class SaleTransaction(Base):
    """
    One checkout event. Has 1..N SaleItems.
    total and profit are pre-computed and stored for fast dashboard queries.
    discount_amount: rupee value of any discount applied to the whole basket.
    """
    __tablename__ = "sale_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=True)
    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    discount_amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    total_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)  # sum of unit_cost*qty
    profit: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)      # total - total_cost
    payment_method: Mapped[str] = mapped_column(String(50), default="cash")    # cash|upi|card|credit
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    customer: Mapped["Customer | None"] = relationship("Customer", back_populates="transactions")
    items: Mapped[List["SaleItem"]] = relationship("SaleItem", back_populates="transaction", cascade="all, delete-orphan")


class SaleItem(Base):
    """
    One product line within a SaleTransaction.
    Stores prices at time of sale — not foreign-keyed to current price.
    """
    __tablename__ = "sale_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sale_transactions.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True)
    product_name: Mapped[str] = mapped_column(String(300), nullable=False)  # snapshot at sale time
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    unit_cost: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    line_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    line_profit: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)

    transaction: Mapped["SaleTransaction"] = relationship("SaleTransaction", back_populates="items")
