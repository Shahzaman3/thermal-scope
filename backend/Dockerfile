# Production Dockerfile for IGNITRA Backend
FROM python:3.13-slim

WORKDIR /app

# Prevent Python from writing pyc files and buffering stdout
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code & pre-populated SQLite database
COPY app/ ./app/
COPY scripts/ ./scripts/
COPY data/ ./data/

EXPOSE 8000

# Start FastAPI uvicorn server
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
