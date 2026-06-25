"""
backend/app/routers/inventory.py
Changes: image_url support, upload endpoint, fixed empty string validation for optional fields.
"""
import uuid
import os
import logging
from datetime import date
from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.redis_client import cache_get, cache_set, cache_invalidate_tenant, tenant_key
from app.models.product import Product, Supplier, PurchaseOrder, PurchaseOrderItem
from app.models.user import User
from app.routers.auth import get_current_user
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "static", "uploads")


class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    unit: str = "piece"
    cost_price: float = Field(0, ge=0)
    selling_price: float = Field(0, ge=0)
    quantity: int = Field(0, ge=0)
    reorder_point: int = Field(10, ge=0)
    max_stock: Optional[int] = None
    expiry_date: Optional[date] = None
    supplier_id: Optional[uuid.UUID] = None
    image_url: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("expiry_date", mode="before")
    @classmethod
    def empty_expiry_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v

    @field_validator("supplier_id", mode="before")
    @classmethod
    def empty_supplier_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v

    @field_validator("sku", "barcode", "category", "brand", "notes", mode="before")
    @classmethod
    def empty_string_to_none(cls, v):
        if v == "":
            return None
        return v


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
    image_url: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("expiry_date", mode="before")
    @classmethod
    def empty_expiry_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v

    @field_validator("supplier_id", mode="before")
    @classmethod
    def empty_supplier_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v


class StockAdjustment(BaseModel):
    delta: int
    reason: Optional[str] = None


class ProductResponse(BaseModel):
    id: uuid.UUID
    sku: Optional[str] = None
    barcode: Optional[str] = None
    name: str
    category: Optional[str] = None
    brand: Optional[str] = None
    unit: str
    cost_price: float
    selling_price: float
    quantity: int
    reorder_point: int
    is_low_stock: bool
    is_out_of_stock: bool
    margin_pct: float
    expiry_date: Optional[date] = None
    supplier_id: Optional[uuid.UUID] = None
    image_url: Optional[str] = None
    is_active: bool
    model_config = {"from_attributes": True}


class SupplierCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    lead_time_days: int = Field(3, ge=0)


# ── Image upload ──────────────────────────────────────────────────────────────

@router.post("/products/upload-image")
async def upload_product_image(
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> dict:
    """
    Uploads a product image to static/uploads/ and returns the URL path.
    Accepts JPEG, PNG, WebP. Max 5MB.
    Returns: {"image_url": "/static/uploads/{filename}"}
    """
    allowed_types = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(400, f"Unsupported image type: {file.content_type}. Use JPEG, PNG, or WebP.")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image too large. Maximum size is 5MB.")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    filename = f"{uuid.uuid4()}.{ext}"
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(contents)

    image_url = f"/static/uploads/{filename}"
    logger.info("Image uploaded: %s by tenant=%s", image_url, current_user.tenant_id)
    return {"image_url": image_url}


# ── Product endpoints ─────────────────────────────────────────────────────────

@router.get("/products", response_model=List[ProductResponse])
async def list_products(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    stock_filter: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
):
    stmt = select(Product).where(
        Product.tenant_id == current_user.tenant_id,
        Product.is_active == True,  # noqa: E712
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

    stmt = stmt.order_by(Product.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    products = result.scalars().all()
    logger.debug("Listed %d products for tenant=%s", len(products), current_user.tenant_id)
    return [ProductResponse.model_validate(p) for p in products]


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        product = Product(
            id=uuid.uuid4(),
            tenant_id=current_user.tenant_id,
            **body.model_dump(exclude_none=True),
        )
        db.add(product)
        await db.commit()
        await db.refresh(product)
        await cache_invalidate_tenant(str(current_user.tenant_id))
        logger.info("Product created: %s '%s' tenant=%s", product.id, product.name, current_user.tenant_id)
        return ProductResponse.model_validate(product)
    except Exception as exc:
        await db.rollback()
        logger.error("Failed to create product: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to create product: {str(exc)}")


@router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    product = await _get_product_or_404(db, product_id, current_user.tenant_id)
    return ProductResponse.model_validate(product)


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
    return ProductResponse.model_validate(product)


@router.put("/products/{product_id}/stock", response_model=ProductResponse)
async def adjust_stock(
    product_id: uuid.UUID,
    body: StockAdjustment,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    product = await _get_product_or_404(db, product_id, current_user.tenant_id)
    new_qty = product.quantity + body.delta
    if new_qty < 0:
        raise HTTPException(status_code=400, detail=f"Cannot remove {abs(body.delta)} units — only {product.quantity} in stock.")
    product.quantity = new_qty
    db.add(product)
    await db.commit()
    await db.refresh(product)
    await cache_invalidate_tenant(str(current_user.tenant_id))
    return ProductResponse.model_validate(product)


@router.delete("/products/{product_id}", status_code=204)
async def delete_product(
    product_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    product = await _get_product_or_404(db, product_id, current_user.tenant_id)
    product.is_active = False
    db.add(product)
    await db.commit()
    await cache_invalidate_tenant(str(current_user.tenant_id))


@router.get("/suppliers")
async def list_suppliers(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(Supplier).where(Supplier.tenant_id == current_user.tenant_id, Supplier.is_active == True)  # noqa: E712
        .order_by(Supplier.name)
    )
    suppliers = result.scalars().all()
    return [{"id": str(s.id), "name": s.name, "phone": s.phone, "lead_time_days": s.lead_time_days} for s in suppliers]


@router.post("/suppliers", status_code=201)
async def create_supplier(
    body: SupplierCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    supplier = Supplier(id=uuid.uuid4(), tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(supplier)
    await db.commit()
    return {"id": str(supplier.id), "name": supplier.name}


@router.get("/low-stock-summary")
async def low_stock_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(
            func.count().filter(Product.quantity <= Product.reorder_point).label("low"),
            func.count().filter(Product.quantity <= 0).label("out"),
        ).where(Product.tenant_id == current_user.tenant_id, Product.is_active == True)  # noqa: E712
    )
    row = result.one()
    return {"low_stock": row.low, "out_of_stock": row.out}


async def _get_product_or_404(db: AsyncSession, product_id: uuid.UUID, tenant_id: uuid.UUID) -> Product:
    result = await db.execute(
        select(Product).where(Product.id == product_id, Product.tenant_id == tenant_id, Product.is_active == True)  # noqa: E712
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product
