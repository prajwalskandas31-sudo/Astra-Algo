from pydantic import BaseModel
from typing import Optional, List, Dict, Any
try:
    from .models import RoleEnum
except ImportError:
    from models import RoleEnum

class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str
    role: Optional[RoleEnum] = RoleEnum.user

class UserOut(UserBase):
    id: int
    role: RoleEnum
    is_active: bool

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class NotificationAuditLogOut(BaseModel):
    id: int
    timestamp: str
    channel: str
    recipient: str
    message_type: str
    message_preview: str
    status: str
    response_details: Optional[str] = None
    triggered_by: str

    class Config:
        from_attributes = True

class StrategyOut(BaseModel):
    id: int
    key: str
    name: str
    category: str
    timeframe: str
    description: str
    entry_rules: str
    exit_rules: str
    risk_reward: str
    win_rate: Optional[float] = None
    total_checks: Optional[int] = None
    correct_hits: Optional[int] = None
    false_signals: Optional[int] = None
    profit_factor: Optional[float] = None
    max_drawdown: Optional[float] = None
    avg_return_per_trade: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    sortino_ratio: Optional[float] = None
    calmar_ratio: Optional[float] = None
    profit_expectancy: Optional[float] = None
    win_loss_ratio: Optional[float] = None
    max_consecutive_wins: Optional[int] = None
    max_consecutive_losses: Optional[int] = None
    best_symbol: Optional[str] = None
    metrics_source: Optional[str] = None
    metrics_updated_at: Optional[str] = None
    metrics_period: Optional[str] = None
    backtest_supported: bool = False
    is_active: bool
    is_enabled_for_execution: bool = True
    created_by: str = "system"
    ai_prompt: Optional[str] = None
    rank: int

    class Config:
        from_attributes = True

class StrategyCreate(BaseModel):
    key: str
    name: str
    category: str
    timeframe: str
    description: str
    entry_rules: str
    exit_rules: str
    risk_reward: str = "1:2"
    created_by: str = "user"
    ai_prompt: Optional[str] = None

class StrategyUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    timeframe: Optional[str] = None
    description: Optional[str] = None
    entry_rules: Optional[str] = None
    exit_rules: Optional[str] = None
    risk_reward: Optional[str] = None
    is_enabled_for_execution: Optional[bool] = None

class StrategyCompareRequest(BaseModel):
    strategy_keys: List[str]

class AIGenerateStrategyRequest(BaseModel):
    prompt: str
    preferred_timeframe: Optional[str] = "1-Min / 5-Min Intraday"
    risk_tolerance: Optional[str] = "Moderate (1:2 R:R)"

class AIGenerateStrategyResponse(BaseModel):
    key: str
    name: str
    category: str
    timeframe: str
    description: str
    entry_rules: str
    exit_rules: str
    risk_reward: str
    win_rate: Optional[float] = None
    profit_factor: Optional[float] = None
    max_drawdown: Optional[float] = None
    avg_return_per_trade: Optional[float] = None
    best_symbol: Optional[str] = None
    sharpe_ratio: Optional[float] = None
    sortino_ratio: Optional[float] = None
    profit_expectancy: Optional[float] = None
    deduced_reasoning: str

class BacktestRequest(BaseModel):
    strategy_key: str
    sessions: int = 20
    symbols: Optional[List[str]] = None
    capital_per_trade: float = 100000.0
    risk_per_trade: float = 0.0
    starting_capital: float = 500000.0
    include_costs: bool = True
    slippage_bps: float = 2.0

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class SetActiveExecutionRequest(BaseModel):
    strategy_keys: List[str]

class OrderAuditLogOut(BaseModel):
    id: int
    timestamp: str
    symbol: str
    instrument_key: str
    order_id: str
    side: str
    order_type: str
    entry_price: float
    stop_loss: float
    target_price: float
    risk_per_share: float
    candle_open: float
    candle_high: float
    candle_low: float
    candle_close: float
    prev_day_high: float
    status: str
    execution_latency_ms: float
    broker_status: str
    mode: str
    details: Optional[str] = None

    class Config:
        from_attributes = True

