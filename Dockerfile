# syntax=docker/dockerfile:1.7
#
# Task2SMS — single-service image (Railway / any container host)
#
# Builds the React frontend in stage 1, then bakes the built artifacts
# into the backend image in stage 2. The FastAPI app serves both /api/*
# (API) and /* (SPA) from one uvicorn process on one port — no nginx,
# no second container.
#
# Build:  docker build -t task2sms .
# Run:    docker run -p 8000:8000 \
#           -e SECRET_KEY=... -e WEBHOOK_SECRET=... \
#           -e FRONTEND_URL=http://localhost:8000 \
#           -e DATABASE_URL=sqlite+aiosqlite:////app/data/task2sms.db \
#           -v task2sms-data:/app/data task2sms
#
# Railway: see railway.toml — PORT, DATABASE_URL, and the volume mount
# are wired there. preDeploy runs `alembic upgrade head`.

# ----------------------------------------------------------------------------
# Stage 1 — build the frontend
# ----------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Copy lockfile + package.json first for layer caching.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy the rest of the frontend source and build.
COPY frontend/ ./
RUN npm run build
# Output is in /app/dist after `vite build`.

# ----------------------------------------------------------------------------
# Stage 2 — final image: backend + built frontend
# ----------------------------------------------------------------------------
FROM python:3.11-slim

WORKDIR /app

# System deps for build + Playwright Chromium runtime (same set as
# backend/Dockerfile — kept in sync so the single-service image can run
# the web monitor's headless Chromium path too).
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl gnupg ca-certificates \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libxkbcommon0 libpango-1.0-0 \
    libcairo2 libasound2 libxshmfence1 libx11-xcb1 libxcb-dri3-0 \
    libdrm2 libglib2.0-0 libnspr4 libdbus-1-3 libexpat1 \
    fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Backend deps
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Playwright Chromium (for the web monitor's JS-rendered-page path)
RUN playwright install chromium
RUN playwright install-deps chromium

# Backend source
COPY backend/ ./

# Built frontend from stage 1 — served by FastAPI when STATIC_DIR is set.
COPY --from=frontend-builder /app/dist /app/static

# SQLite data dir (volume mount target). Created even if Postgres is
# used, so a SQLite fallback doesn't fail on a missing dir.
RUN mkdir -p /app/data

# Tell the backend to serve the SPA. Other env vars (SECRET_KEY,
# WEBHOOK_SECRET, FRONTEND_URL, DATABASE_URL, PORT) come from the
# host / Railway at runtime.
ENV STATIC_DIR=/app/static \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

# Entrypoint: run migrations, then start uvicorn on $PORT (Railway
# injects PORT; default 8000 for local docker run). The migration step
# is idempotent — safe to run on every container start.
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
