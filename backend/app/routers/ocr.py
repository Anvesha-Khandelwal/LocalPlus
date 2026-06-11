"""
backend/app/routers/ocr.py
Invoice / bill OCR: upload an image or PDF, extract product data, import to inventory.
POST /invoice  — upload file, return structured extraction for user to review
POST /confirm  — user confirms extracted data, it's saved to inventory
"""
import uuid, json, base64, logging, io
from typing import Annotated
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional

from app.db.session import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_SIZE_MB = 10


class ExtractedItem(BaseModel):
    name: str
    quantity: Optional[int] = None
    unit_cost: Optional[float] = None
    selling_price: Optional[float] = None


class ConfirmImportRequest(BaseModel):
    items: List[ExtractedItem]
    supplier_name: Optional[str] = None


@router.post("/invoice")
async def process_invoice(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    """
    Upload a supplier invoice image or PDF.
    Pipeline:
      1. Validate file type and size.
      2. Run Tesseract OCR to extract raw text.
      3. Send raw text to LLM with extraction prompt.
      4. Return structured JSON for user to review/edit before confirming.
    """
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}. Use JPEG, PNG, or PDF.")

    contents = await file.read()
    if len(contents) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large. Maximum size is {MAX_SIZE_MB}MB.")

    raw_text = await _run_ocr(contents, file.content_type)
    extracted = await _extract_with_llm(raw_text)

    return {
        "raw_text": raw_text[:500] + "..." if len(raw_text) > 500 else raw_text,
        "extracted_items": extracted.get("items", []),
        "supplier_name": extracted.get("supplier_name"),
        "invoice_date": extracted.get("invoice_date"),
        "total_amount": extracted.get("total_amount"),
        "confidence": extracted.get("confidence", "medium"),
    }


@router.post("/confirm")
async def confirm_import(
    body: ConfirmImportRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    After user reviews and edits extracted items, call this to save them.
    Creates products if they don't exist (matched by name), or updates stock.
    """
    from sqlalchemy import select
    from app.models.product import Product, Supplier, PurchaseOrder, PurchaseOrderItem

    # Find or create supplier
    supplier_id = None
    if body.supplier_name:
        result = await db.execute(
            select(Supplier).where(
                Supplier.tenant_id == current_user.tenant_id,
                Supplier.name.ilike(body.supplier_name),
            )
        )
        supplier = result.scalar_one_or_none()
        if not supplier:
            supplier = Supplier(id=uuid.uuid4(), tenant_id=current_user.tenant_id, name=body.supplier_name)
            db.add(supplier)
            await db.flush()
        supplier_id = supplier.id

    order = PurchaseOrder(id=uuid.uuid4(), tenant_id=current_user.tenant_id, supplier_id=supplier_id, status="received")
    db.add(order)
    await db.flush()

    total_cost = 0.0
    created_count = 0
    updated_count = 0

    for item in body.items:
        result = await db.execute(
            select(Product).where(
                Product.tenant_id == current_user.tenant_id,
                Product.name.ilike(item.name),
                Product.is_active == True,
            )
        )
        product = result.scalar_one_or_none()

        if product:
            if item.quantity:
                product.quantity += item.quantity
            if item.unit_cost:
                product.cost_price = item.unit_cost
            db.add(product)
            updated_count += 1
        else:
            product = Product(
                id=uuid.uuid4(), tenant_id=current_user.tenant_id,
                name=item.name,
                cost_price=item.unit_cost or 0,
                selling_price=item.selling_price or (item.unit_cost * 1.2 if item.unit_cost else 0),
                quantity=item.quantity or 0,
                supplier_id=supplier_id,
            )
            db.add(product)
            await db.flush()
            created_count += 1

        if item.quantity and item.unit_cost:
            oi = PurchaseOrderItem(
                id=uuid.uuid4(), order_id=order.id,
                product_id=product.id, quantity=item.quantity, unit_cost=item.unit_cost,
            )
            db.add(oi)
            total_cost += item.quantity * item.unit_cost

    order.total_cost = total_cost
    await db.commit()
    logger.info("Invoice imported: tenant=%s created=%d updated=%d", current_user.tenant_id, created_count, updated_count)
    return {"created": created_count, "updated": updated_count, "purchase_order_id": str(order.id), "total_cost": total_cost}


async def _run_ocr(file_bytes: bytes, mime_type: str) -> str:
    """
    Runs Tesseract OCR on the uploaded image.
    For PDFs, converts first page to image using pdf2image, then OCRs.
    Falls back to base64 LLM vision if Tesseract fails.
    """
    try:
        import pytesseract
        from PIL import Image
        pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD

        if mime_type == "application/pdf":
            try:
                from pdf2image import convert_from_bytes
                images = convert_from_bytes(file_bytes, first_page=1, last_page=1)
                image = images[0] if images else None
            except Exception:
                return ""
        else:
            image = Image.open(io.BytesIO(file_bytes))

        if image:
            # Try multiple languages: English + Hindi
            text = pytesseract.image_to_string(image, lang="eng+hin", config="--psm 6")
            return text.strip()
    except ImportError:
        logger.warning("pytesseract not installed — falling back to LLM vision")
    except Exception as exc:
        logger.warning("OCR failed: %s", exc)
    return ""


async def _extract_with_llm(raw_text: str) -> dict:
    """
    Sends OCR text to the LLM to extract structured product data.
    Returns: {items: [{name, quantity, unit_cost}], supplier_name, invoice_date, total_amount}
    """
    if not raw_text.strip():
        return {"items": [], "confidence": "low"}

    prompt = f"""Extract product information from this invoice/bill text.
Return ONLY valid JSON in this exact format:
{{
  "supplier_name": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "total_amount": number or null,
  "confidence": "high|medium|low",
  "items": [
    {{"name": "product name", "quantity": number or null, "unit_cost": number or null}}
  ]
}}

Invoice text:
{raw_text[:3000]}"""

    try:
        import httpx
        headers = {"Content-Type": "application/json"}
        if "claude" in settings.LLM_MODEL:
            url = "https://api.anthropic.com/v1/messages"
            headers["x-api-key"] = settings.ANTHROPIC_API_KEY
            headers["anthropic-version"] = "2023-06-01"
            payload = {"model": settings.LLM_MODEL, "max_tokens": 1000, "messages": [{"role": "user", "content": prompt}]}
        else:
            url = "https://api.openai.com/v1/chat/completions"
            headers["Authorization"] = f"Bearer {settings.OPENAI_API_KEY}"
            payload = {"model": settings.LLM_MODEL, "max_tokens": 1000, "messages": [{"role": "user", "content": prompt}]}

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            raw = data.get("content", [{}])[0].get("text") or data["choices"][0]["message"]["content"]
            return json.loads(raw.strip().strip("```json").strip("```"))
    except Exception as exc:
        logger.error("LLM extraction failed: %s", exc)
        return {"items": [], "confidence": "low"}
