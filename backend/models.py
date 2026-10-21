from sqlalchemy import Boolean, Column, Integer, Float, String, Text, Enum
import enum

try:
    from .database import Base
except ImportError:
    from database import Base



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
    win_rate = Column(Float, default=78.4)
    total_checks = Column(Integer, default=1480)
    correct_hits = Column(Integer, default=1160)
    false_signals = Column(Integer, default=320)
    profit_factor = Column(Float, default=2.74)
    max_drawdown = Column(Float, default=4.8)
    avg_return_per_trade = Column(Float, default=2.35)
    sharpe_ratio = Column(Float, default=2.45)
    sortino_ratio = Column(Float, default=3.12)
    calmar_ratio = Column(Float, default=4.88)
    profit_expectancy = Column(Float, default=3420.0)
    win_loss_ratio = Column(Float, default=2.1)
    max_consecutive_wins = Column(Integer, default=14)
    max_consecutive_losses = Column(Integer, default=3)
    best_symbol = Column(String, default="RELIANCE")
    is_active = Column(Boolean, default=True)
    is_enabled_for_execution = Column(Boolean, default=True)
    created_by = Column(String, default="system")  # system, user, ai_generated
    ai_prompt = Column(Text, nullable=True)
    rank = Column(Integer, default=1)

class OrderAuditLog(Base):
    __tablename__ = "order_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(String, index=True)
    symbol = Column(String, index=True)
    instrument_key = Column(String)
    order_id = Column(String, index=True)
    side = Column(String, default="BUY")
    order_type = Column(String, default="LIMIT")
    entry_price = Column(Float)  # High of 9:15 candle
    stop_loss = Column(Float)    # Low of 9:15 candle
    target_price = Column(Float) # Entry + 2 * (High - Low)
    risk_per_share = Column(Float)  # High - Low
    candle_open = Column(Float)
    candle_high = Column(Float)
    candle_low = Column(Float)
    candle_close = Column(Float)
    prev_day_high = Column(Float)
    status = Column(String, default="ORDER_PLACED")  # ORDER_PLACED, FILLED, TARGET_HIT, STOP_LOSS_HIT
    execution_latency_ms = Column(Float)
    broker_status = Column(String, default="FILLED")
    mode = Column(String, default="LIVE_ORB")
    details = Column(Text, nullable=True)

