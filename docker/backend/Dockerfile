# ─── Backend Dockerfile ────────────────────────────────────────────────────
# Multi-stage: development + production

# Stage 1 — base
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc netcat-openbsd curl \
    && rm -rf /var/lib/apt/lists/*

# Stage 2 — development
FROM base AS development

COPY requirements/dev.txt .
RUN pip install -r dev.txt

COPY . .

EXPOSE 8000 5678

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# Stage 3 — production
FROM base AS production

COPY requirements/prod.txt .
RUN pip install -r prod.txt

COPY . .

RUN addgroup --system agro && adduser --system --group agro
USER agro

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "4", \
     "--timeout", "60", \
     "--access-logfile", "-"]
