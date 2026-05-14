from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db, User
from models.schemas import UserRegister, UserLogin, TokenResponse
from auth import hash_password, verify_password, create_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(data: UserRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.phone == data.phone).first():
        raise HTTPException(status_code=400, detail="Phone number already registered")
    user = User(
        name      = data.name,
        phone     = data.phone,
        email     = data.email,
        hashed_pw = hash_password(data.password),
        shop_name = data.shop_name,
        city      = data.city,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token({"sub": user.id})
    return TokenResponse(access_token=token, user_name=user.name, shop_name=user.shop_name)


@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.phone == data.phone).first()
    if not user or not verify_password(data.password, user.hashed_pw):
        raise HTTPException(status_code=401, detail="Invalid phone or password")
    token = create_token({"sub": user.id})
    return TokenResponse(access_token=token, user_name=user.name, shop_name=user.shop_name)