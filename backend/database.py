from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

DATABASE_URL = "sqlite:///./localplus.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ── ORM Models ─────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"
    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String, nullable=False)
    phone      = Column(String, unique=True, index=True)
    email      = Column(String, unique=True, index=True, nullable=True)
    hashed_pw  = Column(String, nullable=False)
    shop_name  = Column(String, nullable=True)
    city       = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    products   = relationship("Product", back_populates="owner")
    sales      = relationship("Sale", back_populates="owner")


class Product(Base):
    __tablename__ = "products"
    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String, nullable=False)
    category   = Column(String, nullable=True)
    price      = Column(Float, nullable=False)
    stock      = Column(Float, default=0)
    unit       = Column(String, default="units")
    expiry     = Column(DateTime, nullable=True)
    owner_id   = Column(Integer, ForeignKey("users.id"))
    owner      = relationship("User", back_populates="products")
    sales      = relationship("Sale", back_populates="product")


class Sale(Base):
    __tablename__ = "sales"
    id         = Column(Integer, primary_key=True, index=True)
    quantity   = Column(Float, nullable=False)
    total      = Column(Float, nullable=False)
    sold_at    = Column(DateTime, default=datetime.utcnow)
    owner_id   = Column(Integer, ForeignKey("users.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    owner      = relationship("User", back_populates="sales")
    product    = relationship("Product", back_populates="sales")


class Udhaar(Base):
    __tablename__ = "udhaar"
    id           = Column(Integer, primary_key=True, index=True)
    customer     = Column(String, nullable=False)
    phone        = Column(String, nullable=True)
    amount       = Column(Float, nullable=False)
    paid         = Column(Boolean, default=False)
    created_at   = Column(DateTime, default=datetime.utcnow)
    owner_id     = Column(Integer, ForeignKey("users.id"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)