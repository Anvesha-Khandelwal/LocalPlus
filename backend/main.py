from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from routes import auth, products, sales, forecast, udhaar

app = FastAPI(
    title="LocalPlus API",
    description="Backend for the LocalPlus small business platform",
    version="1.0.0",
)

# ── CORS — allow React dev server ─────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routers ──────────────────────────────────────
app.include_router(auth.router)
app.include_router(products.router)
app.include_router(sales.router)
app.include_router(forecast.router)
app.include_router(udhaar.router)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/")
def root():
    return {"status": "LocalPlus API running", "docs": "/docs"}