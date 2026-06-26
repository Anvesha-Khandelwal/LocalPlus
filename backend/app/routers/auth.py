"""
backend/app/routers/auth.py
Changes: business_type in profile response, /business-type endpoint, fixed hash_password truncation.

FIXED: removed passlib/CryptContext entirely (was causing NameError on startup because the
import was missing, and was the root cause of the earlier "password cannot be longer than
72 bytes" ValueError — bcrypt>=5.0.0 dropped an attribute passlib's backend-detection relies
on). Refresh tokens and invite tokens now use the same raw `bcrypt` helpers as user passwords,
so there's only one hashing path in this file and one less library that can break on upgrade.
"""
import logging, secrets, uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
import bcrypt as _bcrypt
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.user import RefreshToken, Tenant, User, UserRole

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)
router = APIRouter()

VALID_BUSINESS_TYPES = [
    "Grocery Store", "Clothing Store", "Pharmacy", "Electronics Shop",
    "Restaurant/Cafe", "Beauty/Cosmetics", "Hardware Store", "Other"
]


class RegisterRequest(BaseModel):
    business_name: str = Field(..., min_length=2, max_length=100)
    owner_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    phone: str | None = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        has_letter = any(c.isalpha() for c in v)
        has_digit = any(c.isdigit() for c in v)
        if not (has_letter and has_digit):
            raise ValueError("Password must contain at least one letter and one number.")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserProfileResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    tenant_id: str
    business_name: str
    business_type: str | None = None  # NEW
    plan: str
    created_at: datetime
    model_config = {"from_attributes": True}


class RegisterResponse(BaseModel):
    user: UserProfileResponse
    tokens: TokenResponse
    message: str


class UpdateProfileRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    phone: str | None = None
    current_password: str | None = None
    new_password: str | None = Field(None, min_length=8, max_length=128)


class BusinessTypeRequest(BaseModel):
    business_type: str

    @field_validator("business_type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in VALID_BUSINESS_TYPES:
            raise ValueError(f"Invalid business type. Choose from: {', '.join(VALID_BUSINESS_TYPES)}")
        return v


class InviteRequest(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=2, max_length=100)
    role: UserRole = UserRole.STAFF


class AcceptInviteRequest(BaseModel):
    token: str
    password: str = Field(..., min_length=8, max_length=128)


def hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain[:72].encode(), _bcrypt.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(plain[:72].encode(), hashed.encode())
    except Exception:
        return False


def hash_token(raw: str) -> str:
    """Same raw-bcrypt backend as user passwords. Used for refresh & invite tokens
    instead of passlib's CryptContext, which broke under bcrypt>=5.0.0."""
    return _bcrypt.hashpw(raw[:72].encode(), _bcrypt.gensalt(rounds=12)).decode()


def verify_token(raw: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(raw[:72].encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(user_id: str, tenant_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id, "tenant_id": tenant_id, "role": role, "type": "access",
        "iat": now, "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(64)
    hashed = hash_token(raw)
    return raw, hashed


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as exc:
        logger.debug("JWT decode failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is invalid or has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"})
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type.",
            headers={"WWW-Authenticate": "Bearer"})
    return payload


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.", headers={"WWW-Authenticate": "Bearer"})
    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))  # noqa: E712
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated.", headers={"WWW-Authenticate": "Bearer"})
    request.state.tenant_id = str(user.tenant_id)
    return user


async def require_owner(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role != UserRole.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner privileges required.")
    return current_user


async def _build_profile_response(user: User, db: AsyncSession) -> UserProfileResponse:
    result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = result.scalar_one()
    return UserProfileResponse(
        id=str(user.id), email=user.email, name=user.name, role=user.role.value,
        tenant_id=str(user.tenant_id), business_name=tenant.business_name,
        business_type=tenant.business_type,  # NEW
        plan=tenant.plan, created_at=user.created_at,
    )


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, background_tasks: BackgroundTasks, db: Annotated[AsyncSession, Depends(get_db)]) -> RegisterResponse:
    existing = await db.execute(select(User).where(User.email == body.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    try:
        tenant = Tenant(id=uuid.uuid4(), business_name=body.business_name.strip(), plan="free")
        db.add(tenant)
        await db.flush()
        user = User(id=uuid.uuid4(), tenant_id=tenant.id, email=body.email.lower().strip(),
                    name=body.owner_name.strip(), hashed_password=hash_password(body.password),
                    role=UserRole.OWNER, phone=body.phone, is_active=True)
        db.add(user)
        await db.flush()
        access_token = create_access_token(str(user.id), str(tenant.id), user.role.value)
        raw_refresh, hashed_refresh = create_refresh_token()
        db.add(RefreshToken(id=uuid.uuid4(), user_id=user.id, token_hash=hashed_refresh,
            token_prefix=raw_refresh[:8],
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)))
        await db.commit()
        logger.info("New business registered: tenant=%s user=%s", tenant.id, user.id)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    except Exception as exc:
        await db.rollback()
        logger.error("Registration failed: %s", exc)
        raise HTTPException(status_code=500, detail="Registration failed. Please try again.")

    profile = await _build_profile_response(user, db)
    tokens = TokenResponse(access_token=access_token, refresh_token=raw_refresh,
                           expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    return RegisterResponse(user=profile, tokens=tokens,
        message=f"Welcome to AI Business Copilot, {user.name}!")


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == body.email.lower(), User.is_active == True))  # noqa: E712
    user = result.scalar_one_or_none()
    dummy_hash = "$2b$12$KIXHxGkGoD1yTrk1lFjAXeDaBkiuDdLHBomCAWAaRdj8YYRMdL.9m"
    password_ok = verify_password(body.password, user.hashed_password if user else dummy_hash)
    if not user or not password_ok:
        raise HTTPException(status_code=401, detail="Invalid email or password.", headers={"WWW-Authenticate": "Bearer"})
    access_token = create_access_token(str(user.id), str(user.tenant_id), user.role.value)
    raw_refresh, hashed_refresh = create_refresh_token()
    db.add(RefreshToken(id=uuid.uuid4(), user_id=user.id, token_hash=hashed_refresh,
        token_prefix=raw_refresh[:8],
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)))
    await db.execute(update(User).where(User.id == user.id).values(last_login_at=datetime.now(timezone.utc)))
    await db.commit()
    logger.info("Login: user=%s", user.id)
    return TokenResponse(access_token=access_token, refresh_token=raw_refresh,
                         expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenResponse:
    token_prefix = body.refresh_token[:8] if len(body.refresh_token) >= 8 else body.refresh_token
    result = await db.execute(select(RefreshToken).where(
        RefreshToken.token_prefix == token_prefix,
        RefreshToken.expires_at > datetime.now(timezone.utc)))
    matched_record = None
    for record in result.scalars().all():
        if verify_token(body.refresh_token, record.token_hash):
            matched_record = record
            break
    if not matched_record:
        raise HTTPException(status_code=401, detail="Refresh token invalid or expired.", headers={"WWW-Authenticate": "Bearer"})
    user_result = await db.execute(select(User).where(User.id == matched_record.user_id, User.is_active == True))  # noqa: E712
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found.", headers={"WWW-Authenticate": "Bearer"})
    await db.delete(matched_record)
    new_access = create_access_token(str(user.id), str(user.tenant_id), user.role.value)
    new_raw, new_hashed = create_refresh_token()
    db.add(RefreshToken(id=uuid.uuid4(), user_id=user.id, token_hash=new_hashed,
        token_prefix=new_raw[:8],
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)))
    await db.commit()
    return TokenResponse(access_token=new_access, refresh_token=new_raw,
                         expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)


@router.post("/logout", status_code=204)
async def logout(body: RefreshRequest, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> None:
    token_prefix = body.refresh_token[:8] if len(body.refresh_token) >= 8 else body.refresh_token
    result = await db.execute(select(RefreshToken).where(
        RefreshToken.user_id == current_user.id, RefreshToken.token_prefix == token_prefix))
    for record in result.scalars().all():
        if verify_token(body.refresh_token, record.token_hash):
            await db.delete(record)
            break
    await db.commit()


@router.get("/me", response_model=UserProfileResponse)
async def get_me(current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> UserProfileResponse:
    return await _build_profile_response(current_user, db)


@router.put("/me", response_model=UserProfileResponse)
async def update_me(body: UpdateProfileRequest, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> UserProfileResponse:
    if body.new_password:
        if not body.current_password:
            raise HTTPException(status_code=400, detail="current_password is required.")
        if not verify_password(body.current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")
        current_user.hashed_password = hash_password(body.new_password)
    if body.name:
        current_user.name = body.name.strip()
    if body.phone is not None:
        current_user.phone = body.phone
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return await _build_profile_response(current_user, db)


@router.put("/business-type")
async def set_business_type(
    body: BusinessTypeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Called from the onboarding page after the user selects their business type.
    Updates the Tenant.business_type and returns the updated profile.
    """
    try:
        await db.execute(
            update(Tenant)
            .where(Tenant.id == current_user.tenant_id)
            .values(business_type=body.business_type)
        )
        await db.commit()
        logger.info("Business type set: tenant=%s type=%s", current_user.tenant_id, body.business_type)
        return {"message": "Business type updated.", "business_type": body.business_type}
    except Exception as exc:
        await db.rollback()
        logger.error("Failed to set business type: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update business type.")


@router.post("/invite", status_code=201)
async def invite_staff(body: InviteRequest, background_tasks: BackgroundTasks,
                        current_user: Annotated[User, Depends(require_owner)], db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    existing = await db.execute(select(User).where(User.email == body.email.lower(), User.tenant_id == current_user.tenant_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User already exists in your business.")
    raw_invite_token = secrets.token_urlsafe(32)
    invited_user = User(id=uuid.uuid4(), tenant_id=current_user.tenant_id, email=body.email.lower().strip(),
        name=body.name.strip(), hashed_password=hash_password(secrets.token_urlsafe(16)), role=body.role,
        is_active=False, invite_token_hash=hash_password(raw_invite_token),
        invite_expires_at=datetime.now(timezone.utc) + timedelta(hours=72))
    db.add(invited_user)
    await db.commit()
    logger.info("Invite sent by owner=%s to=%s", current_user.id, body.email)
    return {"message": f"Invitation sent to {body.email}.", "user_id": str(invited_user.id)}


@router.post("/accept-invite", response_model=TokenResponse)
async def accept_invite(body: AcceptInviteRequest, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenResponse:
    result = await db.execute(select(User).where(User.is_active == False, User.invite_expires_at > datetime.now(timezone.utc)))  # noqa: E712
    matched_user = None
    for candidate in result.scalars().all():
        if candidate.invite_token_hash and verify_password(body.token, candidate.invite_token_hash):
            matched_user = candidate
            break
    if not matched_user:
        raise HTTPException(status_code=400, detail="Invite link is invalid or has expired.")
    matched_user.is_active = True
    matched_user.hashed_password = hash_password(body.password)
    matched_user.invite_token_hash = None
    matched_user.invite_expires_at = None
    db.add(matched_user)
    await db.flush()
    access_token = create_access_token(str(matched_user.id), str(matched_user.tenant_id), matched_user.role.value)
    raw_refresh, hashed_refresh = create_refresh_token()
    db.add(RefreshToken(id=uuid.uuid4(), user_id=matched_user.id, token_hash=hashed_refresh,
        token_prefix=raw_refresh[:8],
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)))
    await db.commit()
    return TokenResponse(access_token=access_token, refresh_token=raw_refresh,
                         expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)