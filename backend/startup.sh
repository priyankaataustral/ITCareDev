#!/bin/bash

# Azure App Service startup script
echo "Starting AI Support Assistant Backend..."

# Run database migrations
flask --app run:app db upgrade

# Start Gunicorn
gunicorn --bind=0.0.0.0:8000 --timeout 600 --workers=4 run:app