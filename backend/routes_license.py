# routes_license.py
from __future__ import annotations
from datetime import datetime, timezone
from dataclasses import dataclass
import json
from flask import Blueprint, request, jsonify, session
from models_license import db, License, Activation


bp = Blueprint("license", __name__, url_prefix="/license")

def _month_bucket(dt: datetime) -> datetime:
    return datetime(dt.year, dt.month, 1, tzinfo=timezone.utc)

@dataclass
class LicenseResult:
    allowed: bool
    reason: str | None
    valid_until: str | None
    seats: int | None
    active_seats: int | None
    features: dict

def _parse_features(text: str | None) -> dict:
    if not text:
        return {}
    try:
        return json.loads(text)
    except Exception:
        return {}

def check_license_internal(tenant_id: str, user_id: str, email: str | None) -> LicenseResult:
    now = datetime.now(timezone.utc)
    month = _month_bucket(now)

    lic: License | None = License.query.filter_by(tenant_id=tenant_id).first()
    if not lic:
        return LicenseResult(False, "no_license", None, None, None, {})

    # status/date checks
    if lic.status not in ("active", "trial"):
        return LicenseResult(False, "license_inactive", lic.end_date.isoformat() if lic.end_date else None,
                             lic.seats, None, _parse_features(lic.features))

    if lic.start_date and now.date() < lic.start_date:
        return LicenseResult(False, "not_started", lic.end_date.isoformat() if lic.end_date else None,
                             lic.seats, None, _parse_features(lic.features))

    if lic.end_date and now.date() > lic.end_date:
        return LicenseResult(False, "expired", lic.end_date.isoformat(), lic.seats, None,
                             _parse_features(lic.features))

    # optional domain enforcement
    if getattr(lic, "allowed_domain", None) and email:
        domain = email.split("@")[-1].lower()
        if domain != lic.allowed_domain.lower():
            return LicenseResult(False, "email_domain_not_allowed", lic.end_date.isoformat() if lic.end_date else None,
                                 lic.seats, None, _parse_features(lic.features))

    # seat accounting
    seats_cap = lic.seats or 1

    # count distinct active users this month
    active_seats = (db.session.query(Activation)
                    .filter_by(tenant_id=tenant_id, month_bucket=month)
                    .count())

    # upsert activation for this user/month
    act: Activation | None = (Activation.query
                              .filter_by(tenant_id=tenant_id, user_id=user_id, month_bucket=month)
                              .first())
    if not act:
        # consuming a seat *if* we still have room
        if active_seats >= seats_cap:
            return LicenseResult(False, "seat_limit_reached",
                                 lic.end_date.isoformat() if lic.end_date else None,
                                 seats_cap, active_seats, _parse_features(lic.features))
        act = Activation(
            tenant_id=tenant_id, user_id=user_id,
            month_bucket=month, first_seen_at=now, last_seen_at=now
        )
        db.session.add(act)
        active_seats += 1
    else:
        act.last_seen_at = now

    db.session.commit()

    return LicenseResult(True, None,
                         lic.end_date.isoformat() if lic.end_date else None,
                         seats_cap, active_seats, _parse_features(lic.features))

@bp.post("/check")
def check():
    payload = request.get_json(silent=True) or {}
    tenant_id = payload.get("tenant_id") or session.get("tenant_id")
    user_id   = payload.get("user_id")   or session.get("uid")
    email     = payload.get("email")     or session.get("email")

    if not tenant_id or not user_id:
        return jsonify(error="tenant_id_and_user_id_required"), 400

    res = check_license_internal(tenant_id, user_id, email)
    body = dict(
        allowed=res.allowed,
        valid_until=res.valid_until,
        seats=res.seats,
        active_seats=res.active_seats,
        features=res.features,
    )
    if res.reason:
        body["reason"] = res.reason
    return jsonify(body), (200 if res.allowed else 403)
