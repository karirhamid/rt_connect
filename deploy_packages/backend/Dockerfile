# ============================================================================
# RT Connect Backend — FastAPI / Uvicorn
# ============================================================================
FROM python:3.11-slim

# System dependencies needed for psycopg2, the ZKTeco lib, and Arabic-capable
# fonts so the PDF can render FR + AR holiday labels.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev gcc curl tzdata postgresql-client \
        fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first so they're cached when only source changes
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Default env (overridable from docker-compose)
ENV API_HOST=0.0.0.0 \
    API_PORT=8000 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fs http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
