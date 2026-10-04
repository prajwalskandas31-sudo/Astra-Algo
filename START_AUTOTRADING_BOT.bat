@echo off
title Astra Algo - Automated Trading Bot Daemon
color 0A
cls
echo ======================================================================
echo           ASTRA ALGO - AUTOMATED INTRADAY TRADING BOT
echo ======================================================================
echo [INFO] Initializing Python Virtual Environment...
cd /d "%~dp0"

if not exist "backend\venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found in backend\venv.
    pause
    exit /b 1
)

echo [INFO] Broker API: Upstox V2 (Connected)
echo [INFO] Alerts Engine: Telegram Group + WhatsApp Cloud API (Active)
echo [INFO] Schedule:
echo        - 09:00 AM IST: Morning Briefing ^& Cache Warm-up
echo        - 09:16 AM IST: 09:15 Candle Opening High Breakout Scan
echo        - 09:17 - 15:15 IST: Real-time Target (1:2) ^& Stop Loss Tracking
echo        - 15:30 PM IST: Daily Session Report
echo ======================================================================
echo [STATUS] Bot Daemon is LIVE. Keep this window open during market hours.
echo ======================================================================
echo.

backend\venv\Scripts\python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

pause
