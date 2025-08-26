# models_license.py (or extend your existing models.py)
from datetime import datetime, date
from sqlalchemy import Column, String, Integer, Date, DateTime, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from extensions import db

class Tenant(db.Model):
    __tablename__ = "tenants"
    id = Column(String, primary_key=True)
    company_name = Column(String, unique=True, nullable=False)
    allowed_domain = Column(String)
    status = Column(String, default="active")
    created_at = Column(DateTime, default=datetime.utcnow)

class User(db.Model):
    __tablename__ = "users"
    id = Column(String, primary_key=True)   # from Entra OID
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    email = Column(String, nullable=False)
    name = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class License(db.Model):
    __tablename__ = "licenses"
    id = Column(String, primary_key=True)
    tenant_id = Column(String, ForeignKey("tenants.id"), unique=True, nullable=False)
    company_name = Column(String)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    seats = Column(Integer, nullable=False)
    status = Column(String, default="active")
    features = Column(Text)

class Activation(db.Model):
    __tablename__ = "activations"
    id = Column(String, primary_key=True)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    month_bucket = Column(Date, nullable=False)
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    last_seen_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "user_id", "month_bucket", name="uq_act_month"),)
