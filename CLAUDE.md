# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-Powered Support Assistant - A full-stack IT support ticket management system with AI-powered ticket resolution capabilities using OpenAI GPT-4 and knowledge base search.

## Tech Stack

- **Backend**: Flask (Python 3.12) with SQLAlchemy, FAISS for vector search, OpenAI API integration
- **Frontend**: Next.js 15.4 with React 19, TypeScript, Tailwind CSS, Framer Motion
- **Database**: SQLite with Alembic migrations
- **Authentication**: JWT-based with custom implementation

## Development Commands

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Unix/Mac
pip install -r requirements.txt

# Run development server
python app.py
# or
flask run --app app:create_app

# Database migrations
flask --app app:create_app db init
flask --app app:create_app db migrate -m "description"
flask --app app:create_app db upgrade

# Train classifier (if needed)
python train_classifier.py

# Ingest knowledge base
python kb_ingest.py
```

### Frontend
```bash
cd frontend
npm install

# Development with Turbopack
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

### Environment Variables Required
Create `.env` file in backend directory:
```
OPENAI_KEY=sk-...
FRONTEND_URL=http://localhost:3000
RUN_EMAIL_WORKER=1
```

## Architecture Overview

### Backend Structure
- **app.py**: Flask application factory pattern entry point
- **urls.py**: Main API blueprint with all endpoints
- **models.py**: SQLAlchemy models for tickets, agents, messages, solutions
- **models_license.py**: Licensing schema models (separated concern)
- **openai_helpers.py**: GPT integration for categorization and solution generation
- **db_helpers.py**: Database utility functions
- **email_helpers.py**: Email sending with queue system
- **kb_ingest.py**: Knowledge base ingestion from CSV
- **faiss_index.bin/faiss_meta.json**: Vector search index for KB articles

### Frontend Structure
- **pages/_app.jsx**: Main app wrapper with AuthContext
- **pages/index.jsx**: Main ticket interface
- **components/ChatHistory.jsx**: Core chat UI component
- **components/SupportInboxPlugin.jsx**: Main ticket management interface
- **lib/api.js**: API client for backend communication
- **lib/apiClient.ts**: TypeScript API utilities

### Key API Endpoints
- **POST /login**: Agent authentication
- **GET /tickets**: List tickets (with filters)
- **POST /message**: Send message in ticket thread
- **POST /solution-draft**: Generate AI solution
- **POST /email-draft**: Generate email from solution
- **GET /related-tickets**: Find similar tickets
- **POST /kb-search**: Search knowledge base

### Database Models
- **Ticket**: Main ticket entity with status, priority, department
- **Agent**: Support agents with roles (L1, L2, L3)
- **Message**: Chat messages within tickets
- **Solution**: AI-generated solutions with status tracking
- **KBArticle**: Knowledge base articles with vector embeddings

## Important Implementation Details

1. **Authentication**: Custom JWT implementation in routes_auth.py using PyJWT
2. **Vector Search**: FAISS index for semantic search of KB articles using sentence-transformers
3. **Email Queue**: Background worker thread for async email sending
4. **Ticket Assignment**: Automatic routing based on category and department
5. **Solution Generation**: Multi-step process with GPT-4 for actionable solutions
6. **Mentions System**: @mentions in messages trigger notifications

## Common Development Tasks

### Adding a New API Endpoint
1. Add route in backend/urls.py
2. Add any new models in backend/models.py
3. Create migration if database schema changed
4. Update frontend API client in lib/api.js

### Modifying the Chat UI
1. Main component: frontend/components/ChatHistory.jsx
2. Solution cards: frontend/lib/SolutionCard.tsx
3. Update styles in frontend/styles/globals.css or component-specific CSS

### Working with Knowledge Base
1. Update CSV file: backend/data/cleaned_tickets.csv
2. Re-run ingestion: `python kb_ingest.py`
3. Verify FAISS index updated: faiss_index.bin timestamp

### Testing Email Functionality
1. Configure email settings in .env
2. Check EmailQueue table for queued emails
3. Monitor backend logs for email worker status