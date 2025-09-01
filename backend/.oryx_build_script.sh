#!/usr/bin/env bash

Exit immediately if a command exits with a non-zero status.
set -e

echo "Starting custom build script..."

Check if the virtual environment directory exists and create it if not.
if [ ! -d "/tmp/antenv" ]; then
python3.12 -m venv /tmp/antenv
fi

Activate the virtual environment.
source /tmp/antenv/bin/activate

Install dependencies from requirements.txt
pip install -r /tmp/zipdeploy/extracted/requirements.txt

Copy application files to the web root
cp -r /tmp/zipdeploy/extracted/* /home/site/wwwroot/

echo "Build script completed successfully."