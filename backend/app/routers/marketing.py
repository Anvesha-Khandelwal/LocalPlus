"""
backend/app/routers/marketing.py
Marketing content generation proxy. Thin wrapper over ai_router's content endpoint
so the frontend has a clean /api/v1/marketing/ namespace.
"""
from fastapi import APIRouter, Depends, Query
from typing import Annotated
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.routers.ai_router import marketing_content

router = APIRouter()

# Re-export the AI marketing endpoint under the /marketing prefix
router.get("/content")(marketing_content)
