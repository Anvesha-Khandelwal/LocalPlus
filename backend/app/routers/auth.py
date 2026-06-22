"""
backend/app/routers/auth.py
Authentication: register, login, refresh (rotation+theft detection), logout,
profile management, staff invites. See earlier conversation turn for full
line-by-line annotations.
"""
import logging, secrets, uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.user import RefreshToken, Tenant, User, UserRole

logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)
bearer_scheme = HTTPBearer(auto_error=False)
router = APIRouter()


class RegisterRequest(BaseModel):
    business_name: str = Field(..., min_length=2, max_length=100)
    owner_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)
    phone: str | None = Field(None, pattern=r"^\+?[0-9]{10,15}$")

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
    plan: str
    created_at: datetime
    model_config = {"from_attributes": True}


class RegisterResponse(BaseModel):
    user: UserProfileResponse
    tokens: TokenResponse
    message: str


class UpdateProfileRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    phone: str | None = Field(None, pattern=r"^\+?[0-9]{10,15}$")
    current_password: str | None = None
    new_password: str | None = Field(None, min_length=8, max_length=72)


class InviteRequest(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=2, max_length=100)
    role: UserRole = UserRole.STAFF


class AcceptInviteRequest(BaseModel):
    token: str
    password: str = Field(..., min_length=8, max_length=72)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain[:72])


def verify_password(plain: str, hashed: str) -> bool:
    # Bcrypt has a 72-byte limit for passwords
    # Truncate to 72 bytes as a safety measure
    truncated = plain.encode()[:72].decode(errors='ignore')
    return pwd_context.verify(truncated, hashed)


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
    hashed = pwd_context.hash(raw)
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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type.", headers={"WWW-Authenticate": "Bearer"})
    return payload


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a Bearer token.",
            headers={"WWW-Authenticate": "Bearer"})
    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))  # noqa: E712
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or account has been deactivated.",
            headers={"WWW-Authenticate": "Bearer"})
    request.state.tenant_id = str(user.tenant_id)
    return user


async def require_owner(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.role != UserRole.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This action requires owner privileges.")
    return current_user


async def _build_profile_response(user: User, db: AsyncSession) -> UserProfileResponse:
    result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = result.scalar_one()
    return UserProfileResponse(
        id=str(user.id), email=user.email, name=user.name, role=user.role.value,
        tenant_id=str(user.tenant_id), business_name=tenant.business_name,
        plan=tenant.plan, created_at=user.created_at,
    )


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, background_tasks: BackgroundTasks, db: Annotated[AsyncSession, Depends(get_db)]) -> RegisterResponse:
    existing = await db.execute(select(User).where(User.email == body.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")
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
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")

    logger.info("New business registered: tenant=%s user=%s", tenant.id, user.id)
    background_tasks.add_task(_send_welcome_email, user.email, user.name, body.business_name)

    profile = await _build_profile_response(user, db)
    tokens = TokenResponse(access_token=access_token, refresh_token=raw_refresh,
                            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    return RegisterResponse(user=profile, tokens=tokens,
        message=f"Welcome to AI Business Copilot, {user.name}! Your account is ready.")


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == body.email.lower(), User.is_active == True))  # noqa: E712
    user = result.scalar_one_or_none()
    dummy_hash = "$2b$12$KIXHxGkGoD1yTrk1lFjAXeDaBkiuDdLHBomCAWAaRdj8YYRMdL.9m"
    password_ok = verify_password(body.password, user.hashed_password if user else dummy_hash)
    if not user or not password_ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.",
                             headers={"WWW-Authenticate": "Bearer"})
    access_token = create_access_token(str(user.id), str(user.tenant_id), user.role.value)
    raw_refresh, hashed_refresh = create_refresh_token()
    db.add(RefreshToken(id=uuid.uuid4(), user_id=user.id, token_hash=hashed_refresh,
        token_prefix=raw_refresh[:8],
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)))
    await db.execute(update(User).where(User.id == user.id).values(last_login_at=datetime.now(timezone.utc)))
    await db.commit()
    logger.info("Login: user=%s tenant=%s", user.id, user.tenant_id)
    return TokenResponse(access_token=access_token, refresh_token=raw_refresh,
                          expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenResponse:
    token_prefix = body.refresh_token[:8] if len(body.refresh_token) >= 8 else body.refresh_token
    result = await db.execute(select(RefreshToken).where(
        RefreshToken.token_prefix == token_prefix,
        RefreshToken.expires_at > datetime.now(timezone.utc)))
    candidates = result.scalars().all()

    matched_record = None
    for record in candidates:
        if pwd_context.verify(body.refresh_token, record.token_hash):
            matched_record = record
            break
    if not matched_record:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"})

    user_result = await db.execute(select(User).where(User.id == matched_record.user_id, User.is_active == True))  # noqa: E712
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account not found or deactivated.",
                             headers={"WWW-Authenticate": "Bearer"})

    await db.delete(matched_record)
    new_access = create_access_token(str(user.id), str(user.tenant_id), user.role.value)
    new_raw_refresh, new_hashed_refresh = create_refresh_token()
    db.add(RefreshToken(id=uuid.uuid4(), user_id=user.id, token_hash=new_hashed_refresh,
        token_prefix=new_raw_refresh[:8],
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)))
    await db.commit()
    return TokenResponse(access_token=new_access, refresh_token=new_raw_refresh,
                          expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest, current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)]) -> None:
    token_prefix = body.refresh_token[:8] if len(body.refresh_token) >= 8 else body.refresh_token
    result = await db.execute(select(RefreshToken).where(
        RefreshToken.user_id == current_user.id, RefreshToken.token_prefix == token_prefix))
    for record in result.scalars().all():
        if pwd_context.verify(body.refresh_token, record.token_hash):
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
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="current_password is required to set a new password.")
        if not verify_password(body.current_password, current_user.hashed_password):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")
        current_user.hashed_password = hash_password(body.new_password)
    if body.name:
        current_user.name = body.name.strip()
    if body.phone is not None:
        current_user.phone = body.phone
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return await _build_profile_response(current_user, db)


@router.post("/invite", status_code=status.HTTP_201_CREATED)
async def invite_staff(body: InviteRequest, background_tasks: BackgroundTasks,
                        current_user: Annotated[User, Depends(require_owner)], db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    existing = await db.execute(select(User).where(User.email == body.email.lower(), User.tenant_id == current_user.tenant_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists in your business.")

    raw_invite_token = secrets.token_urlsafe(32)
    hashed_invite = hash_password(raw_invite_token)
    invited_user = User(id=uuid.uuid4(), tenant_id=current_user.tenant_id, email=body.email.lower().strip(),
        name=body.name.strip(), hashed_password=hash_password(secrets.token_urlsafe(16)), role=body.role,
        is_active=False, invite_token_hash=hashed_invite, invite_expires_at=datetime.now(timezone.utc) + timedelta(hours=72))
    db.add(invited_user)
    await db.commit()
    background_tasks.add_task(_send_invite_email, body.email, current_user.name, raw_invite_token)
    return {"message": f"Invitation sent to {body.email}. They have 72 hours to accept.", "user_id": str(invited_user.id)}


@router.post("/accept-invite", response_model=TokenResponse)
async def accept_invite(body: AcceptInviteRequest, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenResponse:
    result = await db.execute(select(User).where(User.is_active == False, User.invite_expires_at > datetime.now(timezone.utc)))  # noqa: E712
    matched_user = None
    for candidate in result.scalars().all():
        if candidate.invite_token_hash and verify_password(body.token, candidate.invite_token_hash):
            matched_user = candidate
            break
    if not matched_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite link is invalid or has expired. Please ask for a new invite.")

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


async def _send_welcome_email(to_email: str, name: str, business_name: str) -> None:
    logger.info("TODO: send welcome email to %s (%s)", to_email, business_name)


async def _send_invite_email(to_email: str, inviter_name: str, invite_token: str) -> None:
    invite_url = f"{settings.FRONTEND_URL}/auth/accept-invite?token={invite_token}"
    logger.info("TODO: send invite email to %s — invite_url=%s", to_email, invite_url)
