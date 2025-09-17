# Utility: Extract @mentions from message text
from flask import json, jsonify, request
import jwt
from functools import wraps
from sqlalchemy import Engine, event
import re
from config import SECRET_KEY
from models import Department


def extract_mentions(text):
    """
    Finds all @mentions in the text and returns a list of names (without the '@').
    Example: "Hey @AgentB, can you assist @Priyanka?" -> ["AgentB", "Priyanka"]
    """
    if not isinstance(text, str):
        return []
    return re.findall(r'@([\w]+)', text)

def extract_json(text: str) -> dict:
    """
    Finds and returns the first JSON object in `text`. Raises ValueError if none found.
    """
    # Strip out triple-backticks or fences
    cleaned = re.sub(r"```(?:json)?\s*", "", text).strip()

    # Locate the first `{` and its matching `}`
    start = cleaned.find("{")
    if start == -1:
        raise ValueError("No JSON object found in response")
    depth = 0
    for i, ch in enumerate(cleaned[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    else:
        raise ValueError("Could not find matching '}' for JSON")

    json_str = cleaned[start:end]
    return json.loads(json_str)

def _can_view(role: str, lvl: int) -> bool:
    """Role-based ticket visibility rules:
    - L1: can see all tickets (level 1, 2, 3, 4)
    - L2: can only see L2 and L3 tickets (level 2, 3)
    - L3: can see only L3 tickets (level 3)
    - MANAGER: can see all tickets (level 1, 2, 3, 4)
    """
    ticket_level = lvl or 1
    
    if role == "L1":
        return True  # L1 sees all tickets
    elif role == "L2":
        return ticket_level in [2, 3]  # L2 sees only L2 and L3 tickets
    elif role == "L3":
        return ticket_level == 3  # L3 sees only L3 tickets
    elif role == "MANAGER":
        return True  # Manager sees all tickets
    else:
        return False  # Unknown role, no access

def require_role(*allowed):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            authToken = (request.headers.get("Authorization","").replace("Bearer ","")
                     or request.cookies.get("token"))
            if not authToken:
                return jsonify(error="unauthorized"), 401
            try:
                user = jwt.decode(authToken, SECRET_KEY, algorithms=["HS256"])
            except Exception:
                return jsonify(error="invalid token"), 401
            # Case-insensitive role check
            user_role = (user.get("role") or "").upper()
            user_dept = user.get("department_id")
            allowed_upper = [r.upper() for r in allowed]
            
            if allowed and user_role not in allowed_upper:
                return jsonify(error="forbidden"), 403
            
            # CRITICAL: L1 role can only exist in Helpdesk (department_id = 7)
            if user_role == "L1" and user_dept != 7:
                return jsonify(error="L1 role is only allowed in Helpdesk department"), 403
                
            request.agent_ctx = user
            return fn(*args, **kwargs)
        return wrapper
    return deco

def route_department_from_category(category: str) -> int | None:
    """Map a noisy category like 'CRM_Ticket' or 'NetworkIssue' to a Department id."""
    if not category:
        return None

    s = str(category).lower()
    # normalize: turn 'CRM_Ticket' / 'NetworkIssue' => 'crm ticket', 'network issue'
    tokens = re.findall(r"[a-z]+", s)
    norm = " ".join(tokens)

    # keywords/synonyms per department (tune as needed)
    buckets = [
        (("crm", "salesforce", "customer"), "CRM"),
        (("erp", "sap", "netsuite", "oracleerp", "financials"), "ERP"),
        (("srm", "supplier", "procure", "vendor"), "SRM"),
        (("network", "vpn", "dns", "dhcp", "wifi", "lan", "wan"), "Network"),
        (("security", "mfa", "2fa", "okta", "auth", "phish", "antivirus", "edr"), "Security"),
    ]

    target_name = None
    for keys, dep_name in buckets:
        if any(k in norm for k in keys):
            target_name = dep_name
            break

    if not target_name:
        return None

    d = Department.query.filter_by(name=target_name).first()
    return d.id if d else None

@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_conn, conn_record):
    try:
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON;")
        cur.close()
    except Exception:
        pass



