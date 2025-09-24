#!/usr/bin/env bash
set -euo pipefail

# Run from the folder that contains this script,
# so relative paths like ./data and ticket_loader.log work.
cd "$(dirname "$0")"

echo "$(date -u) [WebJob] Starting ticket loader..."

# Ensure unbuffered logs so you can see output live in WebJob logs
export PYTHONUNBUFFERED=1

# Call your loader (expects DATABASE_URL in App Settings)
python3 advanced_load_tickets.py

echo "$(date -u) [WebJob] Finished ticket loader."