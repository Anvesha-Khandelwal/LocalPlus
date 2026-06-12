"""
backend/app/models/user.py
ORM models for multi-tenant identity: Tenant, User, RefreshToken.

Tenant  — one row per business (Sharma Kirana Store, etc.)
User    — one row per person; always belongs to exactly one Tenant
RefreshToken — one row per active login session (device); deleted on logout/refresh

All tables include tenant_id so queries can always be scoped correctly.
"""
import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum
from typing import List

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, PyEnum):
    OWNER = "owner"
    STAFF = "staff"


class Tenant(Base):
    """
    One Tenant = one business.
    Created automatically when an owner registers.
    All business data (products, sales, customers) references tenant_id.
    """
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_name: Mapped[str] = mapped_column(String(200), nullable=False)
    plan: Mapped[str] = mapped_column(String(50), default="free", nullable=False)
    # JSON blob for misc settings (timezone, currency, language)
    settings_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    users: Mapped[List["User"]] = relationship("User", back_populates="tenant", cascade="all, delete-orphan")


class User(Base):
    """
    One User = one person (owner or staff) belonging to one Tenant.
    Staff are created via the invite flow; they start with is_active=False.
    """
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.STAFF, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Invite flow — set when owner invites staff, cleared after acceptance
    invite_token_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)
    invite_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="users")
    refresh_tokens: Mapped[List["RefreshToken"]] = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")


class RefreshToken(Base):
    """
    One row per active login session. Deleted on logout or after use (rotation).
    token_hash: bcrypt of the raw token sent to the client. Never store raw.
    token_prefix: first 8 chars of raw token — used as lookup index to avoid full-table scan.
    """
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    token_prefix: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="refresh_tokens")
