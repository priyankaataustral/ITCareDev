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
- **Backend:** Flask (Python), OpenAI API, SQLAlchemy, FAISS, Pandas
- **Data:** CSV knowledge base, ticket database

```
project-root/
├── app.py                # Flask backend
├── requirements.txt      # Python dependencies
├── frontend/
│   └── components/
│       └── ChatHistory.jsx  # Main chat UI
├── data/
│   └── knowledge_base.csv   # Knowledge base
├── static/              # Frontend static files
├── templates/           # HTML templates
└── utils/
    └── faiss_helper.py  # Vector search helper
```

## Setup Instructions

### Prerequisites
- Python 3.8+
- Node.js 16+
- (Optional) OpenAI API key

### Backend Setup
```bash
python -m venv venv
venv\Scripts\activate  # On Windows
pip install -r requirements.txt
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Running the Backend
```bash
# In project root
python app.py
```

### Environment Variables
- `OPENAI_API_KEY` (for GPT integration)
- (Optional) Email server settings for sending emails

## Usage
- Open the app in your browser (usually http://localhost:3000)
- Select or create a ticket
- Chat with the AI assistant for solutions
- Use suggested prompts or related tickets for faster help
- Draft and send emails directly from the chat

## Configuration
- **Knowledge Base:** Update `data/knowledge_base.csv` with new Q&A pairs
- **AI Model:** Configure your OpenAI API key in the backend

## Development
- All main React components are in `frontend/components/`
- Backend logic is in `app.py` and `utils/`
- Use `npm run dev` for hot-reloading frontend
- Use `python app.py` for backend

## Deployment
- Deploy backend (Flask) to your preferred cloud (Heroku, Azure, AWS, etc.)
- Deploy frontend (Next.js) to Vercel, Netlify, or similar
- Set environment variables in your deployment platform

## Troubleshooting
- **Large file errors on git push:** Make sure `venv/` is in `.gitignore` and not tracked by git
- **CORS errors:** Ensure backend allows requests from frontend origin
- **OpenAI errors:** Check your API key and usage limits

## License
MIT License

## Credits
Developed by Priyanka at Austral Dynamics with GitHub Copilot assistance.
