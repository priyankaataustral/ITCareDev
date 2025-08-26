# routes_auth.py
from datetime import timedelta
import os
from flask import Blueprint, redirect, url_for, session, request, jsonify
from authlib.integrations.flask_client import OAuth
from urllib.parse import urlparse as url_parse

from models_license import db, Tenant, User


bp = Blueprint("auth", __name__, url_prefix="/auth")

# --- Config from env ---
OIDC_TENANT_ID   = os.getenv("OIDC_TENANT_ID")     # e.g. 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
OIDC_CLIENT_ID   = os.getenv("OIDC_CLIENT_ID")
OIDC_CLIENT_SEC  = os.getenv("OIDC_CLIENT_SECRET")
OIDC_AUTHORITY   = f"https://login.microsoftonline.com/{OIDC_TENANT_ID}/v2.0"
OIDC_DISCOVERY   = f"{OIDC_AUTHORITY}/.well-known/openid-configuration"
OIDC_SCOPE       = "openid profile email"

# Optional: pin to a single pilot tenant
PILOT_TENANT_ID  = os.getenv("PILOT_TENANT_ID")    # e.g. your seeded tenant UUID

oauth = OAuth()

def init_auth(app):
    # cookie/session hardening
    app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret")  # replace in prod
    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
    )
    oauth.init_app(app)
    oauth.register(
        name="entra",
        server_metadata_url=OIDC_DISCOVERY,
        client_id=OIDC_CLIENT_ID,
        client_secret=OIDC_CLIENT_SEC,
        client_kwargs={"scope": OIDC_SCOPE},
    )

@bp.get("/login")
def login():
    # Allow optional 'next' to return user back to UI
    next_url = request.args.get("next") or "/"
    session["post_login_redirect"] = next_url
    redirect_uri = url_for("auth.callback", _external=True)
    return oauth.entra.authorize_redirect(redirect_uri)

@bp.get("/callback")
def callback():
    token = oauth.entra.authorize_access_token()
    # `id_token` claims carry the identity we need
    claims = token.get("userinfo") or {}
    if not claims:
        # some providers keep everything in id_token
        claims = token.get("id_token_claims", {})

    user_id = claims.get("oid") or claims.get("sub")
    email   = claims.get("preferred_username") or claims.get("email")
    name    = claims.get("name") or email

    if not user_id or not email:
        return jsonify(error="invalid_oidc_claims"), 400

    # Tenant mapping: by email domain or a fixed pilot tenant
    tenant_id = PILOT_TENANT_ID
    if not tenant_id:
        domain = email.split("@")[-1].lower()
        t = Tenant.query.filter(Tenant.company_domain == domain).first()  # add `company_domain` column if you want
        if not t:
            return jsonify(error="no_tenant_for_domain", domain=domain), 403
        tenant_id = t.tenant_id

    # Upsert user (id from oid)
    u = db.session.get(User, user_id)
    if not u:
        u = User(user_id=user_id, tenant_id=tenant_id, email=email, name=name)
        db.session.add(u)
    else:
        # keep basic fields fresh
        u.email = email
        u.name  = name
        u.tenant_id = tenant_id
    db.session.commit()

    # Set secure session
    session.clear()
    session.permanent = True
    session["uid"] = user_id
    session["email"] = email
    session["name"] = name
    session["tenant_id"] = tenant_id

    # small cap on concurrent sessions could be added via a server‑side session store

    # bounce back
    dest = session.pop("post_login_redirect", "/")
    # basic safety
    if url_parse(dest).netloc:
        dest = "/"
    return redirect(dest)

@bp.post("/logout")
def logout():
    session.clear()
    return jsonify(ok=True)

@bp.get("/me")
def me():
    if not session.get("uid"):
        return jsonify(authenticated=False), 200
    return jsonify(
        authenticated=True,
        user_id=session.get("uid"),
        email=session.get("email"),
        name=session.get("name"),
        tenant_id=session.get("tenant_id"),
    )
