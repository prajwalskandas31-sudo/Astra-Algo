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
    # Performance metrics come ONLY from the backtest engine (backend/backtest.py); NULL until a backtest runs.
    win_rate = Column(Float, nullable=True)
    total_checks = Column(Integer, nullable=True)
    correct_hits = Column(Integer, nullable=True)
    false_signals = Column(Integer, nullable=True)
    profit_factor = Column(Float, nullable=True)
    max_drawdown = Column(Float, nullable=True)
    avg_return_per_trade = Column(Float, nullable=True)
    sharpe_ratio = Column(Float, nullable=True)
    sortino_ratio = Column(Float, nullable=True)
    calmar_ratio = Column(Float, nullable=True)
    profit_expectancy = Column(Float, nullable=True)
    win_loss_ratio = Column(Float, nullable=True)
    max_consecutive_wins = Column(Integer, nullable=True)
    max_consecutive_losses = Column(Integer, nullable=True)
    best_symbol = Column(String, nullable=True)
    metrics_source = Column(String, nullable=True)      # "backtest" when metrics are real
    metrics_updated_at = Column(String, nullable=True)
    metrics_period = Column(String, nullable=True)      # e.g. "2026-10-13 to 2026-11-07 · 20 sessions · Nifty 50"
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
    # Trade lifecycle (added with the live-chart / trade-manager upgrade; migrated in main.startup_event)
    session_date = Column(String, index=True, nullable=True)
    quantity = Column(Integer, nullable=True)
    sl_order_id = Column(String, nullable=True)
    exit_order_id = Column(String, nullable=True)
    entry_fill_price = Column(Float, nullable=True)
    entry_time = Column(String, nullable=True)
    exit_price = Column(Float, nullable=True)
    exit_time = Column(String, nullable=True)
    pnl = Column(Float, nullable=True)
    r_multiple = Column(Float, nullable=True)
    data_source = Column(String, nullable=True)


class BacktestRun(Base):
    __tablename__ = "backtest_runs"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(String, index=True)
    created_by = Column(String)
    strategy_key = Column(String, index=True)
    strategy_name = Column(String)
    period_from = Column(String, nullable=True)
    period_to = Column(String, nullable=True)
    sessions = Column(Integer, nullable=True)
    symbols_tested = Column(Integer, nullable=True)
    trades = Column(Integer, nullable=True)
    win_rate = Column(Float, nullable=True)
    net_pnl = Column(Float, nullable=True)
    profit_factor = Column(Float, nullable=True)
    max_drawdown_pct = Column(Float, nullable=True)
    result_json = Column(Text)


METRIC_FIELDS = ["win_rate", "total_checks", "correct_hits", "false_signals", "profit_factor", "max_drawdown",
                 "avg_return_per_trade", "sharpe_ratio", "sortino_ratio", "calmar_ratio", "profit_expectancy",
                 "win_loss_ratio", "max_consecutive_wins", "max_consecutive_losses", "best_symbol"]

STRATEGY_MIGRATIONS = {
    "sharpe_ratio": "FLOAT", "sortino_ratio": "FLOAT", "calmar_ratio": "FLOAT", "profit_expectancy": "FLOAT",
    "win_loss_ratio": "FLOAT", "max_consecutive_wins": "INTEGER", "max_consecutive_losses": "INTEGER",
    "best_symbol": "VARCHAR", "is_enabled_for_execution": "BOOLEAN", "created_by": "VARCHAR", "ai_prompt": "TEXT",
    "metrics_source": "VARCHAR", "metrics_updated_at": "VARCHAR", "metrics_period": "VARCHAR",
}

# Columns added after the first release; existing databases need ALTER TABLE.
ORDER_AUDIT_MIGRATIONS = {
    "session_date": "VARCHAR",
    "quantity": "INTEGER",
    "sl_order_id": "VARCHAR",
    "exit_order_id": "VARCHAR",
    "entry_fill_price": "FLOAT",
    "entry_time": "VARCHAR",
    "exit_price": "FLOAT",
    "exit_time": "VARCHAR",
    "pnl": "FLOAT",
    "r_multiple": "FLOAT",
    "data_source": "VARCHAR",
}

