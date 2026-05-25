FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY alembic.ini .
COPY migrations ./migrations
COPY app ./app
COPY pyproject.toml .
RUN pip install --no-cache-dir .

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
