from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from .models import RoleEnum

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
    win_rate: float
    total_checks: int
    correct_hits: int
    false_signals: int
    profit_factor: float
    max_drawdown: float
    avg_return_per_trade: float
    sharpe_ratio: float = 2.45
    sortino_ratio: float = 3.12
    calmar_ratio: float = 4.88
    profit_expectancy: float = 3420.0
    win_loss_ratio: float = 2.1
    max_consecutive_wins: int = 14
    max_consecutive_losses: int = 3
    best_symbol: str = "RELIANCE"
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
    win_rate: float = 75.0
    profit_factor: float = 2.4
    max_drawdown: float = 5.5
    avg_return_per_trade: float = 2.0
    best_symbol: str = "RELIANCE"
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
    win_rate: Optional[float] = None
    profit_factor: Optional[float] = None
    max_drawdown: Optional[float] = None
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
    win_rate: float
    profit_factor: float
    max_drawdown: float
    avg_return_per_trade: float
    best_symbol: str
    sharpe_ratio: float
    sortino_ratio: float
    profit_expectancy: float
    deduced_reasoning: str

class SetActiveExecutionRequest(BaseModel):
    strategy_keys: List[str]
