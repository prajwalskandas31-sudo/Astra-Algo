# 🚀 Astra Algo - Automated Intraday Trading System

Astra Algo is an institutional-grade automated trading signal engine and execution framework built for Indian equity markets (NSE). It implements the **Opening High Breakout/Reversal** strategy on the 09:15 1-minute candle, featuring real-time broker feeds, sub-millisecond strategy evaluation, and automated dual-channel broadcasts to Telegram and WhatsApp.

---

## ⚡ Core Strategy Specification: Two-Stage Execution Engine

Based on the **Opening High Breakout/Reversal** specification with sub-50ms institutional execution:
1. **Universe**: Actively traded Futures & Options (F&O) equity instruments (Top 15 liquid leaders: RELIANCE, HDFCBANK, ICICIBANK, INFY, TCS, SBIN, LT, ITC, MARUTI, etc.).
2. **Key Levels**: Previous Day High (PDH) dynamically pre-cached in-memory for `0.001 ms` zero-latency lookup.
3. **Phase 1: Market Open PDH Filter (09:15:00 AM IST)**:
   - Evaluated at market open: `09:15:00 AM IST`.
   - **Condition**: `"opening of the stock must be below previous day high"` (`open < prev_day_high`).
   - Stocks opening above or at PDH (gap-up exhaustion) are immediately disqualified.
   - **Strict Tracking Gate**: Only stocks that pass Condition 1 are tracked for Phase 2.
4. **Phase 2: 09:15 Candle Close Breakout & Order Execution (09:16:00 AM IST)**:
   - Evaluated strictly at close of the 09:15 candle: `09:16:00 AM IST`.
   - Evaluates **ONLY** the stocks tracked from Phase 1.
   - **Condition**: `"close of 9:15 candle above previous day high"` (`close > prev_day_high`).
5. **Precise Order Execution Rules**:
   - **Buy Order Entry**: Executed at the **"High"** of the 09:15 candle.
   - **Stop Loss (SL)**: Clamped at the **"Low"** of the 09:15 candle.
   - **Risk per Share**: `High - Low` of the 09:15 candle.
   - **Profit Target (TP)**: `Entry + 2 x (High - Low)` with strict **1:2 Risk-Reward Ratio**.
   - **Execution Routing**: Instant order placement via Upstox V2 API gateway and recorded in `order_audit_logs`.

---

## 🕒 Automated Market Hours Lifecycle

| Time (IST) | Action | Channel Broadcast |
| :--- | :--- | :--- |
| **09:00:00 AM** | **Morning RAM Warmup**: Pre-cache Previous Day Highs for all 15 F&O stocks concurrently. | Telegram Group + WhatsApp |
| **09:15:00 AM** | **Phase 1 Market Open Filter**: Evaluates `open < prev_day_high`. Disqualifies gap-ups and arms tracked candidates. | Telegram Group + WhatsApp |
| **09:16:00 AM** | **Phase 2 Candle Close Execution**: Evaluates only Phase 1 candidates for `close > prev_day_high`. Executes Buy orders at 9:15 High, SL at 9:15 Low, Target at 2x Risk. | Telegram Group + WhatsApp + Broker Orders |
| **09:17 – 15:15** | **Intraday Target/SL Tracker**: High-frequency monitoring of active positions for 1:2 Target hit or Stop Loss exit. | Telegram Group + WhatsApp |
| **15:30:00 PM** | **Session Close Report**: Summary of daily setups triggered and performance metrics. | Telegram Group + WhatsApp |

---

## 🏗️ Architecture

```
Astra Algo/
├── backend/
│   ├── main.py                 # FastAPI backend, RBAC auth & APScheduler lifecycle
│   ├── strategy.py             # Core trading strategy, parallel scanner & notification engine
│   ├── upstox_client.py        # Authenticated Upstox V2 API gateway & candle feeds
│   ├── database.py             # SQLite persistence for users & logs
│   ├── models.py & schemas.py  # Pydantic schemas & SQLAlchemy ORM models
│   └── security_middleware.py  # Static IP Guard & whitelisting
├── frontend/                   # Next.js (TypeScript, React 19, Tailwind) Institutional Terminal
├── START_AUTOTRADING_BOT.bat   # 1-Click daemon launcher
├── .env.example                # Configuration template
└── README.md                   # System documentation
```

---

## ⚙️ Quick Start

### 1. Prerequisites
- Python 3.10+
- Node.js 18+ (for frontend terminal)
- Upstox Developer Account (V2 API)
- Telegram Bot Token & Chat ID
- Meta WhatsApp Cloud API credentials

### 2. Configuration
Copy `.env.example` to `.env` and fill in your keys:
```env
# Upstox API
UPSTOX_API_KEY=your_key
UPSTOX_API_SECRET=your_secret
UPSTOX_ACCESS_TOKEN=your_token

# Telegram Alerts
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=-100xxxxxxxxxx,your_personal_id

# WhatsApp Cloud API
WHATSAPP_TOKEN=your_meta_token
WHATSAPP_PHONE_ID=your_phone_id
WHATSAPP_RECIPIENT_PHONE=91xxxxxxxxxx,91yyyyyyyyyy
```

### 3. Running the Bot
Simply double-click:
```bash
START_AUTOTRADING_BOT.bat
```
The daemon runs in the background all day and dispatches signals automatically during market hours.

---

## 🛡️ License
Private & Proprietary. All rights reserved.
