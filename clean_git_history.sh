#!/bin/bash

git clone --mirror . backup-cleanup.git
java -jar bfg-1.15.0.jar --delete-folders 'venv,backup-AI-powered-support-assitant-.git' --no-blob-protection backup-cleanup.git
cd backup-cleanup.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
