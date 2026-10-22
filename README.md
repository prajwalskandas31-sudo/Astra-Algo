# 🚀 Astra Algo - Automated Intraday Trading System

Astra Algo is an institutional-grade automated trading signal engine and execution framework built for Indian equity markets (NSE). It implements the **1-Minute Open Range Breakout (ORB) Strategy** on the 09:15 1-minute candle, featuring real-time broker feeds, sub-millisecond strategy evaluation, and automated dual-channel broadcasts to Telegram and WhatsApp.

---

## ⚡ Core Strategy Specification: 1-Minute Open Range Breakout (ORB) Strategy

Based on the **1-Minute Open Range Breakout (ORB) Strategy** with sub-50ms institutional execution:
1. **Setup & Universe**:
   - **Asset Class**: **Nifty 50 stocks exclusively** (all 50 constituent leaders: RELIANCE, TCS, HDFCBANK, ICICIBANK, BHARTIARTL, INFY, ITC, SBIN, LT, etc.).
   - **Timeframe**: **1-minute chart**.
   - **Qualifying Condition**: At market open (9:15 AM), the 9:15 AM candle must open below the Previous Day High (PDH) and close above the PDH (`open < PDH` and `close > PDH`).
2. **Execution Rules**:
   - **Entry**: Place a buy order at the high of the 9:15 AM candle (triggers on a break above the high).
   - **Stop Loss (SL)**: Set the stop loss at the low of the 9:15 AM candle.
3. **Target Calculation**:
   - **Risk Range (R)**: $\text{Candle High} - \text{Candle Low}$ (the exact height of the 9:15 AM candle).
   - **Profit Target**: Set target at $2 \times R$ above the entry level (a strict **1:2 Risk-to-Reward ratio**).
4. **Two-Stage Execution Engine**:
   - **Phase 1: Market Open PDH Filter (09:15:00 AM IST)**: Evaluates `open < prev_day_high`. Stocks opening above or at PDH (gap-up exhaustion) are immediately disqualified. Only qualifying stocks advance to Phase 2.
   - **Phase 2: 09:15 Candle Close Breakout (09:16:00 AM IST)**: Evaluates tracked candidates for `close > prev_day_high`. Triggers buy orders at Candle High, sets SL at Candle Low, and sets Target at $\text{Entry} + 2 \times R$.
   - **Execution Routing**: Instant order placement via Upstox V2 API gateway and recorded in `order_audit_logs`.

---

## 🕒 Automated Market Hours Lifecycle

| Time (IST) | Action | Channel Broadcast |
| :--- | :--- | :--- |
| **09:00:00 AM** | **Morning RAM Warmup**: Pre-cache Previous Day Highs for all 50 Nifty constituent stocks concurrently. | Telegram Group + WhatsApp |
| **09:15:00 AM** | **Phase 1 Market Open Filter**: Evaluates `open < prev_day_high`. Disqualifies gap-ups and arms tracked Nifty 50 candidates. | Telegram Group + WhatsApp |
| **09:16:00 AM** | **Phase 2 Candle Close Execution**: Evaluates tracked Nifty 50 candidates for `close > prev_day_high`. Executes Buy orders at 9:15 High, SL at 9:15 Low, Target at 2x Risk ($R$). | Telegram Group + WhatsApp + Broker Orders |
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
