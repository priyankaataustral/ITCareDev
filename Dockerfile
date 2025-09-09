FROM python:3.12-slim

WORKDIR /app

# Install build deps only if needed (pymysql doesn’t require MySQL dev libs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

# Copy requirements first (for caching)
COPY ./backend/requirements.txt .

RUN pip install --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Copy all backend code
COPY ./backend .

# Ensure logs print straight to console
ENV PYTHONUNBUFFERED=1 \
    PORT=8000

EXPOSE 8000

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "run:app"]
