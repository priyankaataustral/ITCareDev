#!/bin/bash

# Azure App Service startup script
echo "Starting AI Support Assistant Backend..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable is not set!"
    exit 1
fi

echo "Database URL configured: ${DATABASE_URL%%:*}://[hidden]"

# Test database connection before migrations
echo "Testing database connection..."
python3 -c "
import os
from sqlalchemy import create_engine, text
try:
    engine = create_engine(os.environ['DATABASE_URL'])
    with engine.connect() as conn:
        conn.execute(text('SELECT 1'))
    print('✅ Database connection successful')
except Exception as e:
    print(f'❌ Database connection failed: {e}')
    exit(1)
"

if [ $? -ne 0 ]; then
    echo "Database connection test failed. Exiting..."
    exit 1
fi

# Run database migrations
echo "Running database migrations..."
flask --app run:app db upgrade

if [ $? -ne 0 ]; then
    echo "Database migrations failed. Exiting..."
    exit 1
fi

echo "Starting Gunicorn server..."
# Start Gunicorn with better configuration for Azure
gunicorn --bind=0.0.0.0:$PORT --timeout 600 --workers=2 --max-requests=1000 --preload run:app