from sqlalchemy import Boolean, Column, Integer, Float, String, Text, Enum
from .database import Base
import enum

class RoleEnum(str, enum.Enum):
    super_admin = "super_admin"
    admin = "admin"
    user = "user"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(Enum(RoleEnum), default=RoleEnum.user)
    is_active = Column(Boolean, default=True)

class NotificationAuditLog(Base):
    __tablename__ = "notification_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(String, index=True)
    channel = Column(String, index=True)  # whatsapp, telegram, upstox_auth, scheduler
    recipient = Column(String, index=True)
    message_type = Column(String, default="text")  # alert, cta_button, briefing, test
    message_preview = Column(Text)
    status = Column(String, index=True)  # SENT, FAILED, ERROR, EXPIRED, CONFIG_MISSING
    response_details = Column(Text, nullable=True)
    triggered_by = Column(String, default="system")

class Strategy(Base):
    __tablename__ = "strategies"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    name = Column(String, index=True)
    category = Column(String)
    timeframe = Column(String)
    description = Column(Text)
    entry_rules = Column(Text)
    exit_rules = Column(Text)
    risk_reward = Column(String, default="1:2")
    win_rate = Column(Float, default=72.5)
    total_checks = Column(Integer, default=1240)
    correct_hits = Column(Integer, default=899)
    false_signals = Column(Integer, default=341)
    profit_factor = Column(Float, default=2.45)
    max_drawdown = Column(Float, default=6.8)
    avg_return_per_trade = Column(Float, default=1.85)
    is_active = Column(Boolean, default=True)
    rank = Column(Integer, default=1)
