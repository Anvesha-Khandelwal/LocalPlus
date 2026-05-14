from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db, Product
from models.schemas import ProductCreate, ProductOut
from auth import get_current_user, User

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/", response_model=List[ProductOut])
def list_products(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Product).filter(Product.owner_id == user.id).all()


@router.post("/", response_model=ProductOut)
def create_product(data: ProductCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = Product(**data.model_dump(), owner_id=user.id)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.put("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, data: ProductCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = db.query(Product).filter(Product.id == product_id, Product.owner_id == user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    for k, v in data.model_dump().items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    p = db.query(Product).filter(Product.id == product_id, Product.owner_id == user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(p)
    db.commit()
    return {"detail": "Deleted"}