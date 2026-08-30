FROM python:3.12.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements.lock.txt /app/backend/requirements.lock.txt
RUN python -m pip install "pip==26.2.1" \
    && python -m pip install --requirement /app/backend/requirements.lock.txt

COPY backend /app/backend
RUN mkdir -p /app/data/cache/fortyguard

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
