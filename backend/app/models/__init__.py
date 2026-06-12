"""
backend/app/models/__init__.py
Imports all ORM models so SQLAlchemy's Base.metadata knows about every table.
main.py imports this module to trigger Base.metadata.create_all().
"""
from app.db.session import Base  # noqa: F401
from app.models.user import Tenant, User, RefreshToken  # noqa: F401
from app.models.product import Supplier, Product, PurchaseOrder, PurchaseOrderItem  # noqa: F401
from app.models.sale import Customer, SaleTransaction, SaleItem  # noqa: F401

__all__ = [
    "Base",
    "Tenant", "User", "RefreshToken",
    "Supplier", "Product", "PurchaseOrder", "PurchaseOrderItem",
    "Customer", "SaleTransaction", "SaleItem",
]
