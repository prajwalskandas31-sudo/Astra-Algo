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
    is_active: bool
    rank: int

    class Config:
        from_attributes = True

class StrategyCompareRequest(BaseModel):
    strategy_keys: List[str]
