# 🚀 Astra Algo - Automated Intraday Trading System

Astra Algo is an institutional-grade automated trading signal engine and execution framework built for Indian equity markets (NSE). It implements the **Opening High Breakout/Reversal** strategy on the 09:15 1-minute candle, featuring real-time broker feeds, sub-millisecond strategy evaluation, and automated dual-channel broadcasts to Telegram and WhatsApp.

---

## ⚡ Core Strategy Specification

Based on the **Opening High Breakout/Reversal** blueprint:
1. **Universe**: Actively traded Futures & Options (F&O) equity instruments (Top 15 liquid leaders: RELIANCE, HDFCBANK, ICICIBANK, INFY, TCS, SBIN, etc.).
2. **Key Levels**: Previous Day's High (PDH) dynamically retrieved from the 1-Day Chart Candle.
3. **Core Trigger (09:16:00 AM IST)**:
   - Evaluated strictly at the close of the first 1-minute candle (`09:15:00` to `09:15:59`).
   - **Condition for Long Breakout**:
     - `09:15 Open < Previous Day High`
     - `09:15 Close > Previous Day High`
4. **Risk & Target Calculation**:
   - **Expected Entry**: Open of the 09:16 candle (Close of 09:15).
   - **Stop Loss (SL)**: Absolute Low of the 09:15 trigger candle.
   - **Risk per Share**: Candle Range ($\text{High} - \text{Low}$).
   - **Take Profit (TP)**: 1:2 Risk-Reward Ratio ($\text{Entry} + [2 \times \text{Risk}]$).

---

## 🕒 Automated Market Hours Lifecycle

| Time (IST) | Action | Channel Broadcast |
| :--- | :--- | :--- |
| **09:00:00 AM** | **Morning Market Briefing**: Warm up RAM cache & pre-fetch Previous Day Highs for all 15 F&O stocks concurrently. | Telegram Group + WhatsApp |
| **09:16:00 AM** | **Core Strategy Scan**: Pulls locked 09:15 candles in parallel, evaluates breakout conditions, and fires instant signals. | Telegram Group + WhatsApp |
| **09:17 – 15:15** | **Intraday Target/SL Tracker**: High-frequency monitoring of active setups for 1:2 Target hit or Stop Loss exit. | Telegram Group + WhatsApp |
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
