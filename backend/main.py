"""
backend/main.py
Updated: DDL migrations on startup, static file serving for product images.
"""
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import Callable

import redis.asyncio as aioredis
from fastapi import FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.core.config import settings
from app.core.logging_config import configure_logging
from app.db.session import engine, AsyncSessionLocal
from app import models  # noqa: F401
from app.routers import auth, inventory, sales, ai_router, ocr, customers, marketing

configure_logging()
logger = logging.getLogger(__name__)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static", "uploads")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting AI Business Copilot API — env=%s", settings.ENVIRONMENT)

    # Ensure static upload directory exists
    os.makedirs(STATIC_DIR, exist_ok=True)
    logger.info("Static uploads directory ready: %s", STATIC_DIR)

    # Create tables
    try:
        async with engine.begin() as conn:
            await conn.run_sync(models.Base.metadata.create_all)
        logger.info("Database tables verified / created.")
    except Exception as exc:
        logger.critical("Database connection failed on startup: %s", exc)
        raise

    # Run safe DDL migrations — ADD COLUMN IF NOT EXISTS so they never crash
    try:
        async with engine.begin() as conn:
            await conn.execute(text(
                "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_type VARCHAR(100)"
            ))
            await conn.execute(text(
                "ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)"
            ))
        logger.info("DDL migrations applied.")
    except Exception as exc:
        logger.warning("DDL migration warning (non-fatal): %s", exc)

    # Redis
    try:
        redis_client = aioredis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
        await redis_client.ping()
        app.state.redis = redis_client
        logger.info("Redis connection established.")
    except Exception as exc:
        logger.warning("Redis unavailable: %s — caching disabled.", exc)
        app.state.redis = None

    logger.info("Startup complete. Serving requests.")
    yield

    logger.info("Shutting down...")
    if app.state.redis:
        await app.state.redis.close()
    logger.info("Shutdown complete.")


def create_app() -> FastAPI:
    app = FastAPI(
        title="AI Business Copilot API",
        version="1.0.0",
        docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
        redoc_url="/redoc" if settings.ENVIRONMENT == "development" else None,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    _register_middleware(app)
    _register_routers(app)
    _register_exception_handlers(app)

    # Serve uploaded product images at /static/uploads/
    static_path = os.path.join(os.path.dirname(__file__), "static")
    os.makedirs(os.path.join(static_path, "uploads"), exist_ok=True)
    app.mount("/static", StaticFiles(directory=static_path), name="static")

    return app


def _register_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    @app.middleware("http")
    async def timing_middleware(request: Request, call_next: Callable) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        response.headers["X-Process-Time"] = f"{duration_ms:.1f}ms"
        log_level = logging.WARNING if duration_ms > 2000 else logging.DEBUG
        logger.log(log_level, "%-6s %-40s → %d  [%.0fms]", request.method, request.url.path, response.status_code, duration_ms)
        return response

    @app.middleware("http")
    async def tenant_middleware(request: Request, call_next: Callable) -> Response:
        request.state.tenant_id = None
        return await call_next(request)


def _register_routers(app: FastAPI) -> None:
    API_PREFIX = "/api/v1"
    app.include_router(auth.router, prefix=f"{API_PREFIX}/auth", tags=["Authentication"])
    app.include_router(inventory.router, prefix=f"{API_PREFIX}/inventory", tags=["Inventory"])
    app.include_router(sales.router, prefix=f"{API_PREFIX}/sales", tags=["Sales"])
    app.include_router(ai_router.router, prefix=f"{API_PREFIX}/ai", tags=["AI & Forecasting"])
    app.include_router(ocr.router, prefix=f"{API_PREFIX}/ocr", tags=["OCR"])
    app.include_router(customers.router, prefix=f"{API_PREFIX}/customers", tags=["Customers"])
    app.include_router(marketing.router, prefix=f"{API_PREFIX}/marketing", tags=["Marketing AI"])


def _register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = []
        for error in exc.errors():
            field = " → ".join(str(loc) for loc in error["loc"] if loc != "body")
            errors.append({"field": field, "message": error["msg"]})
        logger.warning("Validation error %s %s: %s", request.method, request.url.path, errors)
        return JSONResponse(status_code=422, content={"error": "Validation failed", "detail": errors})

    @app.exception_handler(404)
    async def not_found_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=404, content={"error": f"Not found: {request.method} {request.url.path}"})

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"error": "An unexpected error occurred."})


app = create_app()


@app.get("/health", tags=["Health"])
async def health_check(request: Request) -> JSONResponse:
    db_ok = redis_ok = False
    db_error = redis_error = None
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception as exc:
        db_error = str(exc)

    try:
        if request.app.state.redis:
            await request.app.state.redis.ping()
            redis_ok = True
        else:
            redis_error = "Not initialised"
    except Exception as exc:
        redis_error = str(exc)

    return JSONResponse(
        status_code=200 if db_ok else 503,
        content={"status": "healthy" if db_ok else "degraded",
                 "dependencies": {"database": {"ok": db_ok, "error": db_error}, "redis": {"ok": redis_ok, "error": redis_error}}}
    )


@app.get("/", include_in_schema=False)
async def root() -> JSONResponse:
    return JSONResponse(content={"message": "AI Business Copilot API", "version": app.version})
