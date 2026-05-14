from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db, Udhaar
from models.schemas import UdhaarCreate, UdhaarOut
from auth import get_current_user, User

router = APIRouter(prefix="/udhaar", tags=["udhaar"])


@router.get("/", response_model=List[UdhaarOut])
def list_udhaar(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Udhaar).filter(Udhaar.owner_id == user.id, Udhaar.paid == False).all()


@router.post("/", response_model=UdhaarOut)
def add_udhaar(data: UdhaarCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    entry = Udhaar(**data.model_dump(), owner_id=user.id)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.patch("/{udhaar_id}/paid", response_model=UdhaarOut)
def mark_paid(udhaar_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    entry = db.query(Udhaar).filter(Udhaar.id == udhaar_id, Udhaar.owner_id == user.id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    entry.paid = True
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/summary")
def udhaar_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    entries = db.query(Udhaar).filter(Udhaar.owner_id == user.id, Udhaar.paid == False).all()
    total = sum(e.amount for e in entries)
    return {"total_outstanding": round(total, 2), "count": len(entries)}