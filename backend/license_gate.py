# license_gate.py
from functools import wraps
from flask import request, session, jsonify
from routes_license import check_license_internal

def license_gate(required_feature: str | None = None):
    """
    Wrap protected endpoints. Uses session (uid, email, tenant_id).
    Optionally require a feature flag (e.g., 'kb' or 'diag').
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            uid = session.get("uid")
            email = session.get("email")
            tenant_id = session.get("tenant_id")
            if not uid or not tenant_id:
                return jsonify(error="auth_required"), 401

            result = check_license_internal(tenant_id, uid, email)
            if not result.allowed:
                return jsonify(allowed=False, reason=result.reason), 403

            if required_feature:
                if not result.features or result.features.get(required_feature) != "on":
                    return jsonify(allowed=False, reason=f"feature_{required_feature}_disabled"), 403

            # Optionally surface license info to downstream handlers
            request.license = {
                "tenant_id": tenant_id,
                "user_id": uid,
                "features": result.features,
                "valid_until": result.valid_until,
            }
            return fn(*args, **kwargs)
        return wrapper
    return decorator
