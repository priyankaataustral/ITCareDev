# ─── Intent Expansion Helper ────────────────────────────────────────────────
import difflib
import re
from openai import OpenAI
from category_map import LABELS, TEAM_MAP
from config import ASSISTANT_STYLE, OPENAI_KEY

from models import Department, Ticket


client     = OpenAI(api_key=OPENAI_KEY)
CHAT_MODEL = "gpt-3.5-turbo"
EMB_MODEL  = "text-embedding-ada-002"

def build_prompt_from_intent(intent, ticket_text, ticket_id=None):
    """
    Expands a suggested prompt (intent) into a rich, context-aware instruction for the assistant.
    """
    ctx = f"""
Ticket Context:
- ID: {ticket_id or 'N/A'}
- Description: {ticket_text or 'N/A'}
"""
    intent_lc = (intent or '').strip().lower()
    if intent_lc == 'can you suggest a fix for this issue?':
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nGoal: Suggest the *most likely* fix first.\nOutput format:\n1) Likely Cause (1–2 lines)\n2) Fix (step-by-step, numbered, with exact commands/paths)\n3) Verify (how the user confirms it worked)\n4) If Not Fixed (1–2 next options)\n"
    elif intent_lc == 'draft a professional email to the user with the solution.':
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nGoal: Write a short, professional email to the end user explaining the fix. \nConstraints: 120–180 words, simple language, bullet points for steps, friendly closing."
    elif intent_lc == 'is this a common problem?':
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nGoal: Briefly explain how common this issue is and typical root causes.\nOutput: 3 bullets (Prevalence, Usual Causes, What Usually Fixes It)."
    elif intent_lc == 'has this happened before?':
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nGoal: Assume we’re checking prior tickets. Summarize likely similar cases and their successful fixes (3 bullets), then suggest the best next step."
    elif intent_lc == 'should i escalate this?':
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nGoal: Decide escalate vs continue. \nIf escalate: give a one‑line reason and list the 3 items L2 needs (logs, screenshots, timestamps).\nIf not: give the next 1–2 concrete steps to try first."
    elif intent_lc == 'suggest an alternative approach.':
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nGoal: Suggest a different troubleshooting or resolution approach than previously discussed. Explain why it might work."
    elif intent_lc.startswith('ask me 3 clarifying questions'):
        # Special handling for clarifying questions prompt
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nGoal: Ask exactly 3 concise, specific clarifying questions that would help resolve the issue fastest.\nOutput format: Return only a JSON array of 3 questions, e.g. [\"What operating system is the user running?\", \"Has the user tried restarting their computer?\", \"Is the issue affecting other users?\"]\nDo not provide answers, steps, or explanations."
    else:
        # Fallback: still wrap context + style
        return f"{ASSISTANT_STYLE}\n{ctx}\n\nUser request: {intent}\nProvide a concise, step-by-step answer."
  
# ─── GPT-Based Categorization Helper ──────────────────────────────────────────
def categorize_with_gpt(text: str) -> tuple[str, str]:
    """
    Uses GPT to pick one label from LABELS for the given ticket text,
    then looks up the corresponding team.
    """
    # Build a prompt listing choices
    label_list = ", ".join(f'"{l}"' for l in LABELS)
    prompt = f"""
You are an expert ticket triage assistant.
Pick the single best category for this issue from the list: [{label_list}].
Respond with exactly one of those labels, and nothing else.

Issue description:
\"\"\"{text}\"\"\"
"""

    try:
        resp = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[
                {"role": "system", "content": "You are a helpful ticket classifier."},
                {"role": "user",   "content": prompt}
            ],
            temperature=0.0,
            max_tokens=10
        )
        label = resp.choices[0].message.content.strip()
        # Clean up any stray punctuation
        label = re.sub(r'[^a-zA-Z0-9_]', '', label)
        team  = TEAM_MAP.get(label, TEAM_MAP.get("other", "General-Support"))
        return label, team
    except Exception as e:
        # On error (rate limit, etc), return fallback values
        return "General-Support", TEAM_MAP.get("General-Support", "General-Support")

# --- Department categorization with GPT ---
def categorize_department_with_gpt(text: str) -> str | None:
    """
    Uses GPT to pick the best department for the given ticket text.
    Returns the department name (e.g., 'ERP', 'CRM', etc.) or None.
    """
    department_list = [d.name for d in Department.query.all()]
    if not department_list:
        department_list = ['ERP', 'CRM', 'SRM', 'Network', 'Security']
    prompt = f"""
You are an expert IT support triage assistant.
Pick the single best department for this issue from the list: [{', '.join(department_list)}].
Respond with exactly one of those department names, and nothing else.

Issue description:
{text}
"""
    resp = client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[
            {"role": "system", "content": "You are a helpful ticket classifier."},
            {"role": "user",   "content": prompt}
        ],
        temperature=0.0,
        max_tokens=10
    )
    dep = resp.choices[0].message.content.strip()
    dep = re.sub(r'[^a-zA-Z0-9 ]', '', dep)
    # Return department name if valid
    if dep in department_list:
        return dep
    return None

def is_materially_different(new_text: str, prev_text: str, threshold: float = 0.90) -> bool:
    a = (new_text or "").strip().lower()
    b = (prev_text or "").strip().lower()
    if not a or not b:
        return True
    return difflib.SequenceMatcher(a=a, b=b).ratio() < threshold

def next_action_for(ticket: Ticket, attempt_no: int, reason_code: str | None) -> dict:
    p = (ticket.priority or "").upper()
    lvl = ticket.level or 1

    # Fast-path escalations based on reason
    if reason_code in ("no_permissions", "needs_admin_access"):
        return {"action": "escalate", "to_level": max(lvl, 2)}

    # Priority-aware guard rails
    if p in ("P1", "CRITICAL", "HIGH") and attempt_no >= 1:
        return {"action": "escalate", "to_level": max(lvl, 2)}

    if attempt_no == 1:
        return {"action": "collect_diagnostics", "pack": "basic"}
    if attempt_no == 2:
        return {"action": "new_solution"}
    if attempt_no == 3:
        return {"action": "escalate", "to_level": max(lvl, 2)}
    return {"action": "live_assist"}  # final safety cap

def _inject_system_message(ticket_id: str, text: str):
    # Your UI already treats content starting with [SYSTEM] as system
    from db_helpers import insert_message_with_mentions
    insert_message_with_mentions(ticket_id, "assistant", f"[SYSTEM] {text}")

def _start_step_sequence_basic(ticket_id: str):
    steps = [
        "Please share a screenshot or exact error message you see.",
        "Confirm your OS + app version (e.g. Windows 11 23H2, Outlook 2405).",
        "Run the quick check: restart the affected app and try again. Tell us the result."
    ]
    from db_helpers import save_steps
    save_steps(ticket_id, steps)
    _inject_system_message(ticket_id, "Started diagnostics (Pack A).")

# --- Embedding helper for KB articles ---
def get_embedding_for_article(article):
    """
    Given a KBArticle object or dict, returns the OpenAI embedding for the concatenation of title, problem_summary, and content_md.
    """
    # Accept both SQLAlchemy objects and dicts
    title = getattr(article, 'title', None) or article.get('title', '')
    summary = getattr(article, 'problem_summary', None) or article.get('problem_summary', '')
    content = getattr(article, 'content_md', None) or article.get('content_md', '')
    text = f"Title: {title}\nSummary: {summary}\nContent: {content}"

    # Call OpenAI API for embedding
    response = client.embeddings.create(
        input=text,
        model=EMB_MODEL
    )
    return response.data[0].embedding

