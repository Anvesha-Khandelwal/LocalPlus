"""
backend/app/routers/inventory.py
All CRUD for products, stock adjustments, suppliers, and purchase orders.
Every query is scoped to current_user.tenant_id — one business cannot see another's data.
"""
import uuid
import logging
from datetime import date
from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.redis_client import cache_get, cache_set, cache_invalidate_tenant, tenant_key
from app.models.product import Product, Supplier, PurchaseOrder, PurchaseOrderItem
from app.models.user import User
from app.routers.auth import get_current_user
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Schemas ────────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    unit: str = "piece"
    cost_price: float = Field(..., ge=0)
    selling_price: float = Field(..., ge=0)
    quantity: int = Field(0, ge=0)
    reorder_point: int = Field(10, ge=0)
    max_stock: Optional[int] = None
    expiry_date: Optional[date] = None
    supplier_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    cost_price: Optional[float] = None
    selling_price: Optional[float] = None
    reorder_point: Optional[int] = None
    max_stock: Optional[int] = None
    expiry_date: Optional[date] = None
    supplier_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class StockAdjustment(BaseModel):
    delta: int = Field(..., description="Positive=add stock, Negative=remove stock")
    reason: Optional[str] = None  # "purchase", "damage", "correction"


class ProductResponse(BaseModel):
    id: uuid.UUID
    sku: Optional[str]
    barcode: Optional[str]
    name: str
    category: Optional[str]
    brand: Optional[str]
    unit: str
    cost_price: float
    selling_price: float
    quantity: int
    reorder_point: int
    is_low_stock: bool
    is_out_of_stock: bool
    margin_pct: float
    expiry_date: Optional[date]
    supplier_id: Optional[uuid.UUID]
    is_active: bool

    model_config = {"from_attributes": True}


class SupplierCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    lead_time_days: int = Field(3, ge=0)


class PurchaseOrderCreate(BaseModel):
    supplier_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    items: List[dict]  # [{product_id, quantity, unit_cost}]


# ── Product endpoints ──────────────────────────────────────────────────────────

@router.get("/products", response_model=List[ProductResponse])
async def list_products(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = Query(None, description="Search by name/SKU/barcode"),
    category: Optional[str] = Query(None),
    stock_filter: Optional[str] = Query(None, description="all|low|out"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """
    Returns paginated product list for the current tenant.
    Filters: full-text search on name/sku/barcode, category, stock level.
    Results are cached per tenant+filter combo for 5 minutes.
    """
    cache_key = tenant_key(str(current_user.tenant_id), f"products:{q}:{category}:{stock_filter}:{skip}:{limit}")
    if cached := await cache_get(cache_key):
        return cached

    stmt = select(Product).where(
        Product.tenant_id == current_user.tenant_id,
        Product.is_active == True,
    )
    if q:
        stmt = stmt.where(
            Product.name.ilike(f"%{q}%") |
            Product.sku.ilike(f"%{q}%") |
            Product.barcode.ilike(f"%{q}%")
        )
    if category:
        stmt = stmt.where(Product.category == category)
    if stock_filter == "low":
        stmt = stmt.where(Product.quantity <= Product.reorder_point, Product.quantity > 0)
    elif stock_filter == "out":
        stmt = stmt.where(Product.quantity <= 0)

    stmt = stmt.order_by(Product.name).offset(skip).limit(limit)
    result = await db.execute(stmt)
    products = result.scalars().all()
    data = [ProductResponse.model_validate(p).model_dump() for p in products]
    await cache_set(cache_key, data, settings.CACHE_TTL_DASHBOARD)
    return data


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new product in the current tenant's inventory."""
    product = Product(
        id=uuid.uuid4(),
        tenant_id=current_user.tenant_id,
        **body.model_dump(exclude_none=True),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    await cache_invalidate_tenant(str(current_user.tenant_id))
    logger.info("Product created: %s tenant=%s", product.id, current_user.tenant_id)
    return product


@router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    product = await _get_product_or_404(db, product_id, current_user.tenant_id)
    return product


@router.put("/products/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: uuid.UUID,
    body: ProductUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    product = await _get_product_or_404(db, product_id, current_user.tenant_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(product, field, value)
    db.add(product)
    await db.commit()
    await db.refresh(product)
    await cache_invalidate_tenant(str(current_user.tenant_id))
    return product


@router.put("/products/{product_id}/stock", response_model=ProductResponse)
async def adjust_stock(
    product_id: uuid.UUID,
    body: StockAdjustment,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Adjust stock level by a delta (positive=add, negative=remove).
    Prevents going below zero. Invalidates tenant cache on change.
    """
    product = await _get_product_or_404(db, product_id, current_user.tenant_id)
    new_qty = product.quantity + body.delta
    if new_qty < 0:
        raise HTTPException(status_code=400, detail=f"Cannot remove {abs(body.delta)} units — only {product.quantity} in stock.")
    product.quantity = new_qty
    db.add(product)
    await db.commit()
    await db.refresh(product)
    await cache_invalidate_tenant(str(current_user.tenant_id))
    return product


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Soft delete — sets is_active=False. Data is preserved for analytics."""
    product = await _get_product_or_404(db, product_id, current_user.tenant_id)
    product.is_active = False
    db.add(product)
    await db.commit()
    await cache_invalidate_tenant(str(current_user.tenant_id))


# ── Supplier endpoints ─────────────────────────────────────────────────────────

@router.get("/suppliers", response_model=List[dict])
async def list_suppliers(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(Supplier).where(Supplier.tenant_id == current_user.tenant_id, Supplier.is_active == True)
        .order_by(Supplier.name)
    )
    suppliers = result.scalars().all()
    return [{"id": str(s.id), "name": s.name, "phone": s.phone, "lead_time_days": s.lead_time_days} for s in suppliers]


@router.post("/suppliers", status_code=status.HTTP_201_CREATED)
async def create_supplier(
    body: SupplierCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    supplier = Supplier(id=uuid.uuid4(), tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(supplier)
    await db.commit()
    return {"id": str(supplier.id), "name": supplier.name}


# ── Purchase orders ────────────────────────────────────────────────────────────

@router.post("/purchase-orders", status_code=status.HTTP_201_CREATED)
async def create_purchase_order(
    body: PurchaseOrderCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Record a stock purchase. For each item, increments product.quantity.
    All stock changes are atomic — partial updates are rolled back on failure.
    """
    from datetime import datetime, timezone
    order = PurchaseOrder(
        id=uuid.uuid4(),
        tenant_id=current_user.tenant_id,
        supplier_id=body.supplier_id,
        notes=body.notes,
        received_at=datetime.now(timezone.utc),
    )
    db.add(order)
    await db.flush()

    total_cost = 0.0
    for item_data in body.items:
        product = await _get_product_or_404(db, uuid.UUID(item_data["product_id"]), current_user.tenant_id)
        qty = int(item_data["quantity"])
        cost = float(item_data["unit_cost"])
        product.quantity += qty
        db.add(product)
        order_item = PurchaseOrderItem(
            id=uuid.uuid4(), order_id=order.id,
            product_id=product.id, quantity=qty, unit_cost=cost,
        )
        db.add(order_item)
        total_cost += qty * cost

    order.total_cost = total_cost
    await db.commit()
    await cache_invalidate_tenant(str(current_user.tenant_id))
    return {"id": str(order.id), "total_cost": total_cost, "items_count": len(body.items)}


# ── Low stock summary ──────────────────────────────────────────────────────────

@router.get("/low-stock-summary")
async def low_stock_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Quick count of low-stock and out-of-stock items. Used by sidebar badge."""
    result = await db.execute(
        select(
            func.count().filter(Product.quantity <= Product.reorder_point).label("low"),
            func.count().filter(Product.quantity <= 0).label("out"),
        ).where(Product.tenant_id == current_user.tenant_id, Product.is_active == True)
    )
    row = result.one()
    return {"low_stock": row.low, "out_of_stock": row.out}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_product_or_404(db: AsyncSession, product_id: uuid.UUID, tenant_id: uuid.UUID) -> Product:
    result = await db.execute(
        select(Product).where(Product.id == product_id, Product.tenant_id == tenant_id, Product.is_active == True)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product
