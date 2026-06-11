# AI Business Copilot

AI-powered SaaS platform for small Indian retailers — acts as an inventory manager,
sales analyst, demand forecaster, and marketing advisor.

## Quick Start

```bash
# 1. Clone and configure
cp backend/.env.example backend/.env
# Edit backend/.env — add your OPENAI_API_KEY or ANTHROPIC_API_KEY

# 2. Start everything
docker compose up --build

# 3. Open the app
# Frontend:  http://localhost:3000
# API docs:  http://localhost:8000/docs (dev only)
```

## Project Structure

```
ai-business-copilot/
├── backend/          FastAPI + PostgreSQL + Redis + Celery
│   ├── main.py       App entry point
│   └── app/
│       ├── routers/  API endpoints (auth, inventory, sales, ai, ocr, customers, marketing)
│       ├── models/   SQLAlchemy ORM models
│       ├── core/     Config + logging
│       ├── db/       Database session + Redis client
│       └── tasks/    Celery background jobs
├── frontend/         Next.js 14 + React + Zustand + Recharts
│   ├── app/          Pages (dashboard, inventory, sales, chat, forecasts, health, marketing, ocr, customers, settings)
│   ├── components/   Shared UI (SidebarNav, AuthProvider)
│   └── lib/          API client + global state
├── ml/               Standalone ML scripts (Prophet forecasting, RFM segmentation, Apriori recommendations)
└── docker-compose.yml
```

## First-Time Setup

1. **Register**: Go to http://localhost:3000/register and create your business account.
2. **Add products**: Go to Inventory → Add Product. Set cost price, selling price, and reorder point.
3. **Record sales**: Go to Sales & POS, search products, build a cart, record the sale.
4. **Wait for data**: AI features (forecasts, health score, recommendations) need at least 7-14 days
   of sales data to produce meaningful results. Until then they show fallback/empty states.

## Environment Variables

See `backend/.env.example` for the full list. Minimum required to run:

- `JWT_SECRET_KEY` — generate with `openssl rand -hex 64`
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` — for AI chat, marketing content, OCR extraction
- `DATABASE_URL` and `REDIS_URL` — pre-configured for docker-compose, change for production

## Background Jobs (Celery)

Scheduled tasks run automatically via `celery-beat`:
- **2:00 AM** — Regenerate demand forecasts
- **8:00 AM** — Send low-stock alerts to owners
- **Midnight** — Recalculate health scores
- **Sunday 3 AM** — Customer RFM segmentation
- **Hourly** — Clean up expired auth tokens

## Production Deployment

1. Set `ENVIRONMENT=production` and `DEBUG=false` in `backend/.env`
2. Use a managed PostgreSQL (AWS RDS) and Redis (ElastiCache)
3. Run database migrations with Alembic instead of `create_all()`
4. Set real `ALLOWED_ORIGINS` to your production domain
5. Use a real S3 bucket for invoice storage
6. Deploy backend + celery workers to ECS/Fargate, frontend to Vercel
