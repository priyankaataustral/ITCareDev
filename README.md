
# AI-Powered Support Assistant

## Overview

The AI-Powered Support Assistant is a modern IT support co-pilot that helps resolve support tickets efficiently. It combines your organization's knowledge base with the latest AI models (like GPT-4) to provide actionable, step-by-step solutions, draft professional emails, and suggest related tickets for faster resolution.

## Features
- **AI-Driven Ticket Solutions:** Combines knowledge base search with GPT for accurate, context-aware answers.
- **Draft Email Workflow:** Instantly draft professional emails to users with the proposed solution.
- **Related Tickets:** Surfaces similar tickets to speed up troubleshooting.
- **Modern Chat UI:** Clean, SaaS-style interface with dark mode, collapsible sections, and step-by-step guidance.
- **Escalation & Status Management:** Escalate tickets, close them, and download escalation reports.


## Architecture
- **Frontend:** React (Next.js), Tailwind CSS, Framer Motion
- **Backend:** Flask (Python, modular, app factory pattern), OpenAI API, SQLAlchemy, FAISS, Pandas
- **Data:** CSV knowledge base, ticket database (SQLite)

```
project-root/
├── backend/
│   ├── app.py                # Flask app factory (main entry point)
│   ├── requirements.txt      # Python dependencies
│   ├── extensions.py         # db, migrate, and other extensions
│   ├── models.py             # SQLAlchemy models
│   ├── routes_*.py           # licensing schema routes
│   ├── urls.py               # Main blueprint and API endpoints
│   ├── db_helpers.py         # DB helper functions
│   ├── openai_helpers.py     # OpenAI integration
│   ├── email_helpers.py      # Email sending helpers
│   ├── cli.py                # CLI commands (migrations, etc.)
│   ├── data/
│   │   ├── tickets.json      # Ticket data
│   │   └── cleaned_tickets.csv # Knowledge base
│   └── tickets.db            # SQLite database
├── frontend/
│   ├── components/           # React/Next.js components
│   ├── pages/                # Next.js pages
│   └── ...
├── static/                   # Frontend static files
└── README.md
```
llll

## Setup Instructions

### Prerequisites
- Python 3.12
- Node.js 16+
- (Optional) OpenAI API key


### Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # On Windows
pip install -r requirements.txt
```


### Frontend Setup
```bash
cd ../frontend
npm install
npm run dev
```


### Running the Backend
```bash
# In backend directory
python app.py
# or, if using Flask CLI
flask run --app app:create_app
```


### Environment Variables
- `OPENAI_KEY` (for GPT integration, required)
- `FRONTEND_URL` (URL of your frontend, e.g. http://localhost:3000)
- `RUN_EMAIL_WORKER` (set to "1" to enable background email worker, default: 1)
- (Optional) Email server settings for sending emails

You can create a `.env` file in the `backend/` directory to set these variables. Example:

```
OPENAI_KEY=sk-...
FRONTEND_URL=http://localhost:3000
RUN_EMAIL_WORKER=1
```


## Usage
- Start the backend and frontend as described above.
- Open the app in your browser (usually http://localhost:3000).
- Log in as an agent or create a new ticket.
- Chat with the AI assistant for solutions.
- Use suggested prompts or related tickets for faster help.
- Draft and send emails directly from the chat UI.


## Configuration
- **Knowledge Base:** Update `backend/data/cleaned_tickets.csv` with new Q&A pairs or ticket data.
- **AI Model:** Configure your OpenAI API key in the backend `.env` file.


## Development
- All main React components are in `frontend/components/`
- Backend logic is modularized in `backend/` (see `app.py`, `urls.py`, etc.)
- Use `npm run dev` for hot-reloading frontend
- Use `python app.py` or `flask run --app app:create_app` for backend


## Deployment
- Deploy backend (Flask) to your preferred cloud (Heroku, Azure, AWS, etc.)
- Deploy frontend (Next.js) to Vercel, Netlify, or similar
- Set environment variables in your deployment platform (see above)


## Troubleshooting
- **Large file errors on git push:** Make sure `venv/` is in `.gitignore` and not tracked by git
- **CORS errors:** Ensure backend allows requests from frontend origin (set `FRONTEND_URL`)
- **OpenAI errors:** Check your API key and usage limits


## License
MIT License

## Credits
Developed by Priyanka at Austral Dynamics with GitHub Copilot assistance.
