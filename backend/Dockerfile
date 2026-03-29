FROM python:3.11-slim

WORKDIR /app

# System deps: gcc for C extensions, libpq for postgres, chromium deps for Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    # Playwright/Chromium runtime dependencies
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libxkbcommon0 libpango-1.0-0 \
    libcairo2 libasound2 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright Chromium browser (used for dynamic page scraping)
RUN playwright install chromium --with-deps 2>/dev/null || true

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
