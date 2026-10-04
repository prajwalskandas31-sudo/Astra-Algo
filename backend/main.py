from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta, datetime
from apscheduler.schedulers.background import BackgroundScheduler
import pytz
from typing import List

from . import models, schemas, auth, database, security_middleware, strategy, upstox_client

# Create database tables
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(
    title="Alpha Capital Trading Engine API",
    version="1.0.0",
    description="Intraday Opening High Breakout/Reversal Strategy with RBAC & Static IP Guard"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:3001", "http://127.0.0.1:3001",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static IP Whitelist Guard
app.add_middleware(security_middleware.IPGuardMiddleware)

scheduler = BackgroundScheduler(timezone=pytz.timezone('Asia/Kolkata'))

@app.post("/login", response_model=schemas.Token)
def login_for_access_token(db: Session = Depends(database.get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username, "role": user.role}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=schemas.UserOut)
def read_users_me(current_user: models.User = Depends(auth.get_current_active_user)):
    return current_user

@app.get("/users", response_model=List[schemas.UserOut])
def list_users(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.require_role([models.RoleEnum.super_admin, models.RoleEnum.admin]))
):
    users = db.query(models.User).all()
    return users

@app.post("/users", response_model=schemas.UserOut)
def create_user(
    user_in: schemas.UserCreate, 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(auth.require_role([models.RoleEnum.super_admin, models.RoleEnum.admin]))
):
    # Admins can only create regular Users. Super Admins can create Admins and Users.
    if current_user.role == models.RoleEnum.admin and user_in.role in [models.RoleEnum.admin, models.RoleEnum.super_admin]:
        raise HTTPException(status_code=403, detail="Admins can only create regular users.")

    existing_user = db.query(models.User).filter(models.User.username == user_in.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = auth.get_password_hash(user_in.password)
    db_user = models.User(username=user_in.username, hashed_password=hashed_password, role=user_in.role)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.require_role([models.RoleEnum.super_admin]))
):
    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.username == current_user.username:
        raise HTTPException(status_code=400, detail="Cannot delete current active super admin")
    db.delete(target)
    db.commit()
    return {"status": "success", "detail": f"User {target.username} deleted"}

@app.get("/strategy/status")
def get_strategy_status(current_user: models.User = Depends(auth.get_current_active_user)):
    ist = pytz.timezone("Asia/Kolkata")
    now_ist = datetime.now(ist).strftime("%Y-%m-%d %H:%M:%S IST")
    broker_info = upstox_client.test_connection()
    
    return {
        "server_time_ist": now_ist,
        "strategy_name": "Opening High Breakout/Reversal",
        "timeframe": "1-minute (09:15 candle evaluated at 09:16:00 AM IST)",
        "scheduler": {
            "status": "ACTIVE" if scheduler.running else "STOPPED",
            "schedule": "09:16:00 AM IST (Mon-Fri)",
            "timezone": "Asia/Kolkata"
        },
        "broker": broker_info,
        "security": {
            "ip_guard": "ACTIVE",
            "rbac": current_user.role
        },
        "recent_logs_count": len(strategy.STRATEGY_LOGS)
    }

@app.post("/strategy/trigger")
def trigger_strategy_check(current_user: models.User = Depends(auth.get_current_active_user)):
    """
    Executes the Opening High Breakout scan across watchlists and returns evaluation.
    """
    results = strategy.run_strategy_check()
    return {
        "status": "COMPLETED",
        "executed_by": current_user.username,
        "role": current_user.role,
        "evaluations": results
    }

@app.get("/strategy/logs")
def get_strategy_logs(current_user: models.User = Depends(auth.get_current_active_user)):
    return {
        "logs": strategy.STRATEGY_LOGS
    }

@app.post("/notifications/test")
def test_notifications(
    channel: str = "both",
    custom_message: str = None,
    current_user: models.User = Depends(auth.get_current_active_user)
):
    msg = custom_message or (
        f"⚡ *Alpha Capital Test Alert* ⚡\n\n"
        f"Triggered by: `{current_user.username}` ({current_user.role})\n"
        f"Status: Trading notifications engine operational."
    )
    result = {}
    if channel in ["whatsapp", "both"]:
        result["whatsapp"] = strategy.send_whatsapp_alert(msg)
    if channel in ["telegram", "both"]:
        result["telegram"] = strategy.send_telegram_alert(msg)
    return {
        "status": "COMPLETED",
        "channel": channel,
        "dispatches": result
    }

@app.on_event("startup")
def startup_event():
    db = database.SessionLocal()
    
    # Auto-seed standard accounts for RBAC testing
    seed_accounts = [
        {"username": "superadmin", "password": "superadmin123", "role": models.RoleEnum.super_admin},
        {"username": "admin", "password": "admin123", "role": models.RoleEnum.admin},
        {"username": "trader1", "password": "trader123", "role": models.RoleEnum.user},
    ]
    for acc in seed_accounts:
        user = db.query(models.User).filter(models.User.username == acc["username"]).first()
        if not user:
            pw = auth.get_password_hash(acc["password"])
            db.add(models.User(username=acc["username"], hashed_password=pw, role=acc["role"]))
    db.commit()
    db.close()

    # Schedule automated market hours lifecycle jobs
    if not scheduler.running:
        # 1. 09:00 AM: Pre-market briefing & cache warm-up
        scheduler.add_job(
            strategy.morning_market_briefing_job,
            'cron',
            day_of_week='mon-fri',
            hour=9,
            minute=0,
            id='morning_briefing',
            replace_existing=True
        )
        # 2. 09:16 AM: Primary Opening High Breakout scan across all F&O stocks
        scheduler.add_job(
            strategy.market_open_job, 
            'cron', 
            day_of_week='mon-fri', 
            hour=9, 
            minute=16,
            id='market_open_scan',
            replace_existing=True
        )
        # 3. 09:17 - 15:15: Intraday 1-minute Target & Stop Loss monitor for active setups
        scheduler.add_job(
            strategy.intraday_trade_monitor_job,
            'cron',
            day_of_week='mon-fri',
            hour='9-15',
            minute='*',
            id='intraday_trade_monitor',
            replace_existing=True
        )
        # 4. 15:30 PM: Daily market close recap
        scheduler.add_job(
            strategy.market_close_job,
            'cron',
            day_of_week='mon-fri',
            hour=15,
            minute=30,
            id='market_close_report',
            replace_existing=True
        )
        scheduler.start()
