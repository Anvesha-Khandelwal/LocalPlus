from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────

class UserRegister(BaseModel):
    name:      str
    phone:     str
    password:  str
    shop_name: Optional[str] = None
    city:      Optional[str] = None
    email:     Optional[str] = None

class UserLogin(BaseModel):
    phone:    str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user_name:    str
    shop_name:    Optional[str]


# ── Products ──────────────────────────────────────────────

class ProductCreate(BaseModel):
    name:     str
    category: Optional[str] = None
    price:    float
    stock:    float = 0
    unit:     str   = "units"
    expiry:   Optional[datetime] = None

class ProductOut(ProductCreate):
    id:       int
    owner_id: int
    class Config:
        from_attributes = True


# ── Sales ─────────────────────────────────────────────────

class SaleCreate(BaseModel):
    product_id: int
    quantity:   float

class SaleOut(BaseModel):
    id:         int
    product_id: int
    quantity:   float
    total:      float
    sold_at:    datetime
    class Config:
        from_attributes = True


# ── Udhaar ────────────────────────────────────────────────

class UdhaarCreate(BaseModel):
    customer: str
    phone:    Optional[str] = None
    amount:   float

class UdhaarOut(UdhaarCreate):
    id:         int
    paid:       bool
    created_at: datetime
    class Config:
        from_attributes = True


# ── Forecast ──────────────────────────────────────────────

class ForecastRequest(BaseModel):
    product_id: int
    city:       Optional[str] = "Bengaluru"
    days:       int = 7

class DayForecast(BaseModel):
    date:       str
    day:        str
    predicted:  float
    confidence: float
    signals:    List[str]

class ForecastResponse(BaseModel):
    product_name: str
    unit:         str
    forecasts:    List[DayForecast]
    alert:        Optional[str]
    reorder_by:   Optional[str]