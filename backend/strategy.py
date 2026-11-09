"""
1-Minute Open Range Breakout (ORB) engine - Nifty 50.

Rules (unchanged from the spec):
  Qualify : 09:15 candle open < previous day high (PDH) AND close > PDH
  Entry   : buy stop at the 09:15 high (fills only on a break above the high)
  Stop    : 09:15 low
  Target  : entry + 2 x (high - low)            -> 1:2 risk:reward
  Exit    : target, stop, or square-off at 15:15 IST

Modes:
  TRADING_MODE=paper (default) - no broker orders; trades are simulated candle-by-candle on real 1-min data.
  TRADING_MODE=live            - real Upstox orders, ONLY when: token valid, data came from Upstox,
                                 and we are inside the entry window (09:15-09:45 IST on the same session).
  Manual triggers outside the entry window run as REPLAY (simulated, no alerts, never live).
"""
import json
import math
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time as dtime

import pytz
import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    from . import market_data, upstox_client
except ImportError:
    import market_data
    import upstox_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

IST = pytz.timezone("Asia/Kolkata")

# ---------------------------------------------------------------------------
# Configuration (.env)
# ---------------------------------------------------------------------------
TRADING_MODE = (os.getenv("TRADING_MODE") or "paper").strip().lower()
ORDER_QUANTITY = int(os.getenv("ORDER_QUANTITY", "1"))
RISK_PER_TRADE_INR = float(os.getenv("RISK_PER_TRADE_INR", "0"))           # >0: qty = floor(risk / R)
MAX_CAPITAL_PER_TRADE_INR = float(os.getenv("MAX_CAPITAL_PER_TRADE_INR", "0"))  # >0: caps qty by notional
MAX_LIVE_TRADES_PER_DAY = int(os.getenv("MAX_LIVE_TRADES_PER_DAY", "10"))
ENTRY_LIMIT_BUFFER_PCT = float(os.getenv("ENTRY_LIMIT_BUFFER_PCT", "0.10"))   # stop-limit slack above trigger

MARKET_OPEN = dtime(9, 15)
ENTRY_WINDOW_END = dtime(9, 45)
SQUARE_OFF = dtime(15, 15)

TERMINAL_STATUSES = {"TARGET_HIT", "STOP_LOSS_HIT", "EXITED_EOD", "ENTRY_NOT_TRIGGERED",
                     "ENTRY_REJECTED", "ENTRY_CANCELLED", "SKIPPED"}

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID")
WHATSAPP_RECIPIENT_PHONE = os.getenv("WHATSAPP_RECIPIENT_PHONE")
WHATSAPP_AUTH_PHONE = os.getenv("WHATSAPP_AUTH_PHONE", "917022463267")

NOTIF_SESSION = requests.Session()
NOTIF_SESSION.mount("https://", HTTPAdapter(pool_connections=25, pool_maxsize=25,
                                            max_retries=Retry(total=2, backoff_factor=0.1, status_forcelist=[502, 503, 504])))
_ALERT_WORKER_POOL = ThreadPoolExecutor(max_workers=8, thread_name_prefix="AlertWorker")

# ---------------------------------------------------------------------------
# Universe: official NSE Nifty 50 (backend/data/nifty50.csv)
# ---------------------------------------------------------------------------
NIFTY_50_UNIVERSE = market_data.UNIVERSE
FO_UNIVERSE = NIFTY_50_UNIVERSE  # backward-compatible alias

# ---------------------------------------------------------------------------
# Engine state (guarded by _lock)
# ---------------------------------------------------------------------------
_lock = threading.RLock()
STRATEGY_LOGS = []
ACTIVE_TRADES = []        # today's trades (all statuses) - the trade manager's working set
ORDER_HISTORY = []
PHASE1_TRACKED_STOCKS = []
PHASE1_DISQUALIFIED_STOCKS = []
LAST_PHASE1_RESULT = None
LAST_PHASE2_RESULT = None
CURRENT_SESSION_DATE = None


def _now() -> datetime:
    return market_data.now_ist()


def _stamp(dt: datetime = None) -> str:
    return (dt or _now()).strftime("%Y-%m-%d %H:%M:%S IST")


def _ts(session_date: date, t: dtime) -> int:
    return int(IST.localize(datetime(session_date.year, session_date.month, session_date.day, t.hour, t.minute)).timestamp())


# ===========================================================================
# Notifications (Telegram + WhatsApp) with audit trail
# ===========================================================================
def parse_recipient_list(raw_str: str) -> list:
    if not raw_str:
        return []
    return [item.strip() for item in str(raw_str).replace(";", ",").split(",") if item.strip()]


def format_whatsapp_phone(phone: str) -> str:
    if not phone:
        return ""
    clean = str(phone).replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "").strip()
    if len(clean) == 10 and clean[0] in ["6", "7", "8", "9"]:
        clean = "91" + clean
    return clean


def _plain_markdown(message: str) -> str:
    # Telegram legacy Markdown and WhatsApp both use *single* asterisks for bold.
    return message.replace("**", "*")


def record_audit_log(channel, recipient, message_type, message_preview, status, response_details=None, triggered_by="system"):
    try:
        try:
            from . import database, models
        except ImportError:
            import database
            import models
        db = database.SessionLocal()
        try:
            details_str = json.dumps(response_details) if isinstance(response_details, (dict, list)) else str(response_details or "")
            db.add(models.NotificationAuditLog(
                timestamp=_stamp(), channel=channel, recipient=str(recipient), message_type=message_type,
                message_preview=str(message_preview)[:500] if message_preview else "", status=status,
                response_details=details_str[:2000] if details_str else None, triggered_by=triggered_by))
            db.commit()
        finally:
            db.close()
    except Exception as e:
        print(f"Error persisting notification audit log: {e}")


def send_whatsapp_single(message: str, recipient: str, triggered_by: str = "system") -> dict:
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID or not recipient:
        res = {"timestamp": _now().isoformat(), "status": "CONFIG_MISSING", "recipient": recipient,
               "message": "WhatsApp Token, Phone ID or recipient phone missing."}
        record_audit_log("whatsapp", recipient, "text_alert", message, "CONFIG_MISSING", res, triggered_by)
        return res
    url = f"https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_ID}/messages"
    payload = {"messaging_product": "whatsapp", "to": recipient, "type": "text", "text": {"preview_url": False, "body": message}}
    try:
        resp = NOTIF_SESSION.post(url, json=payload, headers={"Authorization": f"Bearer {WHATSAPP_TOKEN}"}, timeout=6)
        status = "SENT" if resp.status_code == 200 else f"HTTP_{resp.status_code}"
        body = resp.json() if resp.status_code == 200 else resp.text
        record_audit_log("whatsapp", recipient, "text_alert", message, status, body, triggered_by)
        return {"timestamp": _now().isoformat(), "recipient": recipient, "status": status, "response": body}
    except Exception as e:
        record_audit_log("whatsapp", recipient, "text_alert", message, "ERROR", str(e), triggered_by)
        return {"timestamp": _now().isoformat(), "recipient": recipient, "status": "ERROR", "error": str(e)}


def send_whatsapp_alert(message: str, to_phone: str = None, triggered_by: str = "system") -> dict:
    message = _plain_markdown(message)
    target_str = to_phone or os.getenv("WHATSAPP_RECIPIENT_PHONE") or WHATSAPP_RECIPIENT_PHONE or ""
    recipients = [format_whatsapp_phone(p) for p in parse_recipient_list(target_str) if format_whatsapp_phone(p)]
    if not recipients:
        res = {"timestamp": _now().isoformat(), "status": "CONFIG_MISSING", "message": "No valid WhatsApp recipient phone numbers configured."}
        record_audit_log("whatsapp", "NONE", "text_alert", message, "CONFIG_MISSING", res, triggered_by)
        return res
    with ThreadPoolExecutor(max_workers=min(len(recipients), 5)) as ex:
        results = list(ex.map(lambda r: send_whatsapp_single(message, r, triggered_by), recipients))
    return {"status": "SENT" if all(r.get("status") == "SENT" for r in results) else "PARTIAL_OR_FAILED",
            "recipients_count": len(recipients), "results": results}


def send_whatsapp_cta_button(header_text, body_text, button_text, button_url, footer_text="Astra Algo Trading Engine",
                             to_phone=None, triggered_by="system") -> dict:
    target_str = to_phone or os.getenv("WHATSAPP_RECIPIENT_PHONE") or WHATSAPP_RECIPIENT_PHONE or ""
    recipients = [format_whatsapp_phone(p) for p in parse_recipient_list(target_str) if format_whatsapp_phone(p)]
    preview = f"[{header_text}] {body_text} -> {button_text} ({button_url})"
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID or not recipients:
        res = {"timestamp": _now().isoformat(), "status": "CONFIG_MISSING", "message": "WhatsApp Token, Phone ID or recipient phone missing."}
        record_audit_log("whatsapp", str(recipients or "NONE"), "cta_button", preview, "CONFIG_MISSING", res, triggered_by)
        return res
    url = f"https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_ID}/messages"

    def _one(r):
        payload = {"messaging_product": "whatsapp", "recipient_type": "individual", "to": r, "type": "interactive",
                   "interactive": {"type": "cta_url", "header": {"type": "text", "text": header_text},
                                   "body": {"text": body_text}, "footer": {"text": footer_text},
                                   "action": {"name": "cta_url", "parameters": {"display_text": button_text, "url": button_url}}}}
        try:
            resp = NOTIF_SESSION.post(url, json=payload, headers={"Authorization": f"Bearer {WHATSAPP_TOKEN}"}, timeout=6)
            status = "SENT" if resp.status_code == 200 else f"HTTP_{resp.status_code}"
            body = resp.json() if resp.status_code == 200 else resp.text
            record_audit_log("whatsapp", r, "cta_button", preview, status, body, triggered_by)
            return {"timestamp": _now().isoformat(), "recipient": r, "status": status, "response": body}
        except Exception as e:
            record_audit_log("whatsapp", r, "cta_button", preview, "ERROR", str(e), triggered_by)
            return {"timestamp": _now().isoformat(), "recipient": r, "status": "ERROR", "error": str(e)}

    with ThreadPoolExecutor(max_workers=min(len(recipients), 5)) as ex:
        results = list(ex.map(_one, recipients))
    return {"status": "SENT" if all(r.get("status") == "SENT" for r in results) else "PARTIAL_OR_FAILED",
            "recipients_count": len(recipients), "results": results}


def send_telegram_alert(message: str, triggered_by: str = "system") -> dict:
    message = _plain_markdown(message)
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID or "your_" in TELEGRAM_BOT_TOKEN:
        entry = {"timestamp": _now().isoformat(), "status": "CONFIG_MISSING", "payload": message,
                 "message": "Telegram token/chat_id not set. Dispatched to local console."}
        print("Telegram not configured. Alert:\n", message.encode("ascii", errors="backslashreplace").decode("ascii"))
        record_audit_log("telegram", "LOCAL_CONSOLE", "telegram_alert", message, "CONFIG_MISSING", entry, triggered_by)
        return entry
    chat_ids = parse_recipient_list(os.getenv("TELEGRAM_CHAT_ID") or TELEGRAM_CHAT_ID)
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"

    def _one(cid):
        try:
            resp = NOTIF_SESSION.post(url, json={"chat_id": cid, "text": message, "parse_mode": "Markdown"}, timeout=6)
            if resp.status_code == 400 and "parse" in resp.text.lower():
                # Unbalanced markdown (e.g. '_' in a symbol) must never drop a trade alert: resend as plain text.
                resp = NOTIF_SESSION.post(url, json={"chat_id": cid, "text": message}, timeout=6)
            status = "SENT" if resp.status_code == 200 else f"HTTP_{resp.status_code}"
            body = resp.json() if resp.status_code == 200 else resp.text
            record_audit_log("telegram", cid, "telegram_alert", message, status, body, triggered_by)
            return {"timestamp": _now().isoformat(), "chat_id": cid, "status": status, "response": body}
        except Exception as e:
            record_audit_log("telegram", cid, "telegram_alert", message, "ERROR", str(e), triggered_by)
            return {"timestamp": _now().isoformat(), "chat_id": cid, "status": "ERROR", "error": str(e)}

    with ThreadPoolExecutor(max_workers=min(len(chat_ids), 5) or 1) as ex:
        results = list(ex.map(_one, chat_ids))
    return {"status": "SENT" if results and all(r.get("status") == "SENT" for r in results) else "PARTIAL_OR_FAILED",
            "chat_ids_count": len(chat_ids), "results": results if len(results) > 1 else (results[0] if results else {})}


def _broadcast(msg: str):
    def _go():
        send_telegram_alert(msg)
        send_whatsapp_alert(msg)
    _ALERT_WORKER_POOL.submit(_go)


# ===========================================================================
# Pure strategy math (unit tested in tests/test_orb_engine.py)
# ===========================================================================
def is_orb_setup(candle_open: float, candle_close: float, pdh: float) -> bool:
    return pdh is not None and candle_open < pdh and candle_close > pdh


def compute_levels(high: float, low: float, tick: float) -> dict:
    """Entry at the 09:15 high (rounded up to tick), SL at the low (rounded down), target = entry + 2R."""
    entry = upstox_client.round_to_tick(high, tick, "up")
    stop = upstox_client.round_to_tick(low, tick, "down")
    risk = round(entry - stop, 2)
    target = upstox_client.round_to_tick(entry + 2 * risk, tick, "nearest")
    return {"entry": entry, "stop_loss": stop, "risk": risk, "target": target, "tick": tick}


def position_size(entry: float, risk: float, fixed_qty: int = None, risk_budget: float = None, capital_cap: float = None) -> int:
    fixed_qty = ORDER_QUANTITY if fixed_qty is None else fixed_qty
    risk_budget = RISK_PER_TRADE_INR if risk_budget is None else risk_budget
    capital_cap = MAX_CAPITAL_PER_TRADE_INR if capital_cap is None else capital_cap
    qty = math.floor(risk_budget / risk) if (risk_budget > 0 and risk > 0) else fixed_qty
    if capital_cap > 0 and entry > 0:
        qty = min(qty, math.floor(capital_cap / entry))
    return max(int(qty), 0)


def simulate_trade(levels: dict, candles: list, session_date: date, now_ts: int = None) -> dict:
    """
    Candle-by-candle simulation of one ORB trade on candles AFTER the 09:15 bar.
    Conservative fill rules (intra-minute order is unknown):
      * entry fills at max(entry, bar open) when bar high >= entry (gap-through fills at the open)
      * if a bar touches both stop and target, the stop is assumed first
      * on the entry bar itself, a touch of the stop counts as stopped out
      * stop fills at min(stop, bar open); target fills at max(target, bar open)
      * anything still open at 15:15 exits at the 15:15 bar open (or last close)
    """
    entry, stop, target = levels["entry"], levels["stop_loss"], levels["target"]
    t_start = _ts(session_date, dtime(9, 16))
    t_sq = _ts(session_date, SQUARE_OFF)
    bars = [c for c in candles if c["t"] >= t_start]
    res = {"status": "PENDING_ENTRY", "entry_fill_price": None, "entry_time": None,
           "exit_price": None, "exit_time": None, "ltp": bars[-1]["c"] if bars else None}

    def close(status, price, t):
        res.update(status=status, exit_price=round(price, 2), exit_time=t)

    for b in bars:
        if b["t"] >= t_sq:
            if res["status"] == "OPEN":
                close("EXITED_EOD", b["o"], b["t"])
            elif res["status"] == "PENDING_ENTRY":
                res["status"] = "ENTRY_NOT_TRIGGERED"
            return res
        if res["status"] == "PENDING_ENTRY":
            if b["h"] >= entry:
                res.update(status="OPEN", entry_fill_price=round(max(entry, b["o"]), 2), entry_time=b["t"])
                if b["l"] <= stop:
                    close("STOP_LOSS_HIT", min(stop, b["c"]), b["t"])
                    return res
                if b["h"] >= target:
                    close("TARGET_HIT", target, b["t"])
                    return res
            continue
        if b["l"] <= stop:
            close("STOP_LOSS_HIT", min(stop, b["o"]), b["t"])
            return res
        if b["h"] >= target:
            close("TARGET_HIT", max(target, b["o"]), b["t"])
            return res

    session_over = (now_ts or int(time.time())) >= t_sq + 60
    if session_over and bars:
        if res["status"] == "OPEN":
            close("EXITED_EOD", bars[-1]["c"], bars[-1]["t"])
        elif res["status"] == "PENDING_ENTRY":
            res["status"] = "ENTRY_NOT_TRIGGERED"
    return res


def trade_pnl(trade: dict) -> dict:
    fill = trade.get("entry_fill_price")
    qty = trade.get("quantity") or 0
    risk = trade.get("risk") or 0
    if not fill:
        return {"pnl": None, "r_multiple": None, "unrealized_pnl": None}
    if trade.get("exit_price") is not None:
        pnl = round((trade["exit_price"] - fill) * qty, 2)
        return {"pnl": pnl, "r_multiple": round((trade["exit_price"] - fill) / risk, 2) if risk else None, "unrealized_pnl": None}
    ltp = trade.get("ltp")
    return {"pnl": None, "r_multiple": None, "unrealized_pnl": round((ltp - fill) * qty, 2) if ltp else None}


# ===========================================================================
# Sessions & persistence
# ===========================================================================
def resolve_session() -> date:
    """Today during/after market hours on a trading day, otherwise the most recent session with data."""
    now = _now()
    today = now.date()
    if now.weekday() < 5 and now.time() >= MARKET_OPEN:
        if now.time() < dtime(9, 17):
            return today  # first minute: bars may not be published yet
        latest = market_data.latest_session_date()
        return latest or today
    return market_data.latest_session_date() or today


def is_live_entry_window(session_date: date) -> bool:
    now = _now()
    return now.weekday() < 5 and session_date == now.date() and MARKET_OPEN <= now.time() < ENTRY_WINDOW_END


def _db():
    try:
        from . import database, models
    except ImportError:
        import database
        import models
    return database, models


def _persist_trade(trade: dict):
    """Insert or update the trade row in order_audit_logs."""
    try:
        database, models = _db()
        db = database.SessionLocal()
        try:
            row = db.get(models.OrderAuditLog, trade["db_id"]) if trade.get("db_id") else None
            if row is None:
                row = models.OrderAuditLog(timestamp=trade["created_at"], side="BUY")
                db.add(row)
            c = trade.get("candle") or {}
            row.symbol = trade["symbol"]
            row.instrument_key = trade["instrument_key"]
            row.order_id = trade.get("entry_order_id") or trade["trade_id"]
            row.order_type = trade.get("order_type", "SL")
            row.entry_price = trade["entry"]
            row.stop_loss = trade["stop_loss"]
            row.target_price = trade["target"]
            row.risk_per_share = trade["risk"]
            row.candle_open, row.candle_high, row.candle_low, row.candle_close = c.get("open"), c.get("high"), c.get("low"), c.get("close")
            row.prev_day_high = trade.get("pdh")
            row.status = trade["status"]
            row.execution_latency_ms = trade.get("latency_ms")
            row.broker_status = trade.get("broker_status")
            row.mode = trade["mode"]
            row.details = trade.get("notes")
            row.session_date = trade["session_date"]
            row.quantity = trade.get("quantity")
            row.sl_order_id = trade.get("sl_order_id")
            row.exit_order_id = trade.get("exit_order_id")
            row.entry_fill_price = trade.get("entry_fill_price")
            row.entry_time = trade.get("entry_time")
            row.exit_price = trade.get("exit_price")
            row.exit_time = trade.get("exit_time")
            row.pnl = trade.get("pnl")
            row.r_multiple = trade.get("r_multiple")
            row.data_source = trade.get("data_source")
            db.commit()
            trade["db_id"] = row.id
        finally:
            db.close()
    except Exception as e:
        print(f"Error persisting trade {trade.get('symbol')}: {str(e).encode('ascii', 'backslashreplace').decode()}")


def restore_session_trades():
    """Reload today's trades after a restart so open positions keep being managed."""
    global CURRENT_SESSION_DATE
    try:
        database, models = _db()
        today = _now().date().isoformat()
        db = database.SessionLocal()
        try:
            rows = db.query(models.OrderAuditLog).filter(models.OrderAuditLog.session_date == today).all()
        finally:
            db.close()
        with _lock:
            known = {t["db_id"] for t in ACTIVE_TRADES}
            for r in rows:
                if r.id in known:
                    continue
                ACTIVE_TRADES.append({
                    "db_id": r.id, "trade_id": r.order_id, "session_date": r.session_date, "symbol": r.symbol,
                    "instrument_key": r.instrument_key, "mode": r.mode, "quantity": r.quantity or 0,
                    "entry": r.entry_price, "stop_loss": r.stop_loss, "target": r.target_price, "risk": r.risk_per_share,
                    "pdh": r.prev_day_high, "status": r.status, "entry_order_id": r.order_id if r.mode == "LIVE" else None,
                    "sl_order_id": r.sl_order_id, "exit_order_id": r.exit_order_id, "entry_fill_price": r.entry_fill_price,
                    "entry_time": r.entry_time, "exit_price": r.exit_price, "exit_time": r.exit_time, "pnl": r.pnl,
                    "r_multiple": r.r_multiple, "data_source": r.data_source, "created_at": r.timestamp,
                    "candle": {"open": r.candle_open, "high": r.candle_high, "low": r.candle_low, "close": r.candle_close},
                    "order_type": r.order_type, "broker_status": r.broker_status, "notes": r.details,
                })
            if rows:
                CURRENT_SESSION_DATE = today
    except Exception as e:
        print(f"Trade restore skipped: {e}")


def _existing_trade(session_date: str, symbol: str):
    for t in ACTIVE_TRADES:
        if t["session_date"] == session_date and t["symbol"] == symbol:
            return t
    try:
        database, models = _db()
        db = database.SessionLocal()
        try:
            return db.query(models.OrderAuditLog).filter(models.OrderAuditLog.session_date == session_date,
                                                         models.OrderAuditLog.symbol == symbol).first()
        finally:
            db.close()
    except Exception:
        return None


def _start_session(session_date: date):
    """Reset per-session state when the session changes (e.g. first run of a new day)."""
    global CURRENT_SESSION_DATE, PHASE1_TRACKED_STOCKS, PHASE1_DISQUALIFIED_STOCKS, LAST_PHASE1_RESULT, LAST_PHASE2_RESULT
    sd = session_date.isoformat()
    with _lock:
        if CURRENT_SESSION_DATE == sd:
            return
        CURRENT_SESSION_DATE = sd
        PHASE1_TRACKED_STOCKS, PHASE1_DISQUALIFIED_STOCKS = [], []
        LAST_PHASE1_RESULT = LAST_PHASE2_RESULT = None
        ACTIVE_TRADES[:] = [t for t in ACTIVE_TRADES if t["session_date"] == sd]


# ===========================================================================
# Phase 1 - 09:15 open filter
# ===========================================================================
def fetch_and_cache_daily_highs(force_refresh: bool = False, session_date: date = None) -> dict:
    session_date = session_date or resolve_session()
    if force_refresh:
        market_data.clear_cache()
    with ThreadPoolExecutor(max_workers=10) as ex:
        res = list(ex.map(lambda u: market_data.previous_day_high(u["symbol"], session_date), NIFTY_50_UNIVERSE))
    return {r["symbol"]: r for r in res}


def run_phase1_market_open_filter(force_refresh_pdh: bool = False, session_date: date = None) -> dict:
    global PHASE1_TRACKED_STOCKS, PHASE1_DISQUALIFIED_STOCKS, LAST_PHASE1_RESULT
    t_start = time.perf_counter()
    session_date = session_date or resolve_session()
    _start_session(session_date)
    live_window = is_live_entry_window(session_date)
    is_today = session_date == _now().date()

    pdh_map = fetch_and_cache_daily_highs(force_refresh=force_refresh_pdh, session_date=session_date)
    opens = {}
    if is_today:
        for sym, q in market_data.quotes([u["symbol"] for u in NIFTY_50_UNIVERSE]).items():
            if q.get("open"):
                opens[sym] = (float(q["open"]), q["source"])

    def first_bar(u):
        c = market_data.intraday_candles(u["symbol"], sessions=1 if is_today else 5)
        bar = market_data.candle_at(c["candles"], session_date, 9, 15)
        return u["symbol"], ((bar["o"], c["source"]) if bar else None)

    # Opens not supplied by the quote feed (or a past session): read the 09:15 bar's open.
    need = [u for u in NIFTY_50_UNIVERSE if u["symbol"] not in opens]
    if need and (not is_today or _now().time() >= dtime(9, 16)):
        with ThreadPoolExecutor(max_workers=10) as ex:
            for sym, v in ex.map(first_bar, need):
                if v:
                    opens[sym] = v

    tracked, disqualified = [], []
    for u in NIFTY_50_UNIVERSE:
        sym = u["symbol"]
        p = pdh_map.get(sym) or {}
        pdh = p.get("pdh")
        open_price, open_src = opens.get(sym, (None, None))
        row = {"symbol": sym, "instrument_key": u["instrument_key"], "sector": u["sector"],
               "prev_day_high": pdh, "pdh_date": p.get("pdh_date"), "pdh_source": p.get("source"),
               "open_price": round(open_price, 2) if open_price else None, "source": open_src,
               "phase1_condition": "open < prev_day_high", "evaluated_at": _stamp()}
        if pdh is None:
            row.update(is_eligible=False, status="NO_DATA", reason="Previous day high unavailable", delta_from_pdh=None)
            disqualified.append(row)
        elif open_price is None:
            # Open not published yet: keep tracking, Phase 2 re-checks with the 09:15 candle's open.
            row.update(is_eligible=True, status="OPEN_PENDING", reason="Open not yet available - Phase 2 will verify", delta_from_pdh=None)
            tracked.append(row)
        elif open_price < pdh:
            row.update(is_eligible=True, status="QUALIFIED_FOR_0915_CANDLE_CLOSE_BREAKOUT",
                       reason=f"Open (Rs.{open_price:.2f}) < PDH (Rs.{pdh:.2f})", delta_from_pdh=round(open_price - pdh, 2))
            tracked.append(row)
        else:
            row.update(is_eligible=False, status="DISQUALIFIED_OPEN_AT_OR_ABOVE_PDH",
                       reason=f"Open (Rs.{open_price:.2f}) >= PDH (Rs.{pdh:.2f})", delta_from_pdh=round(open_price - pdh, 2))
            disqualified.append(row)

    latency = round((time.perf_counter() - t_start) * 1000, 2)
    summary = {
        "timestamp": _stamp(), "phase": "PHASE_1_MARKET_OPEN_FILTER", "session_date": session_date.isoformat(),
        "run_mode": ("LIVE" if TRADING_MODE == "live" else "PAPER") if live_window else "REPLAY",
        "condition": "open of the 09:15 candle below previous day high (open < PDH)",
        "scheduled_time": "09:15:00 AM IST", "execution_latency_ms": latency,
        "total_universe_scanned": len(NIFTY_50_UNIVERSE), "tracked_stocks_count": len(tracked),
        "disqualified_stocks_count": len(disqualified), "tracked_stocks": tracked, "disqualified_stocks": disqualified,
    }
    with _lock:
        PHASE1_TRACKED_STOCKS, PHASE1_DISQUALIFIED_STOCKS, LAST_PHASE1_RESULT = tracked, disqualified, summary

    if live_window:
        bullets = "\n".join(f"- {s['symbol']}: open {s['open_price']} < PDH {s['prev_day_high']}" for s in tracked[:10] if s["open_price"])
        _broadcast(f"*09:15 Phase 1 - {session_date}*\nTracked {len(tracked)} / {len(NIFTY_50_UNIVERSE)} (open < PDH)\n{bullets}\n"
                   f"Disqualified: {len(disqualified)}. Phase 2 runs at 09:16 candle close.")
    return summary


# ===========================================================================
# Phase 2 - 09:16 candle close, setup detection & order placement
# ===========================================================================
def _fetch_0915_bar(symbol: str, session_date: date, wait_seconds: float):
    deadline = time.time() + wait_seconds
    sessions = 1 if session_date == _now().date() else 5
    while True:
        c = market_data.intraday_candles(symbol, sessions=sessions, ttl=0.5 if wait_seconds else 2.0)
        bar = market_data.candle_at(c["candles"], session_date, 9, 15)
        if bar or time.time() >= deadline:
            return bar, c
        time.sleep(1.5)


def _evaluation_record(sym, pdh, bar, source, latency_ms, levels=None, trade=None, reason=None):
    setup = levels is not None
    return {
        "timestamp": _stamp(), "symbol": sym, "source": source, "latency_ms": latency_ms, "prev_day_high": pdh,
        "candle": {"open": bar["o"], "high": bar["h"], "low": bar["l"], "close": bar["c"]} if bar else None,
        "setup_detected": setup, "direction": "LONG (Breakout)" if setup else "NEUTRAL (No Setup)",
        "expected_entry": levels["entry"] if setup else None, "entry_order_level": levels["entry"] if setup else None,
        "stop_loss": levels["stop_loss"] if setup else None, "stop_loss_level": levels["stop_loss"] if setup else None,
        "risk_range_R": levels["risk"] if setup else None, "risk_per_share": levels["risk"] if setup else None,
        "take_profit": levels["target"] if setup else None, "take_profit_level": levels["target"] if setup else None,
        "risk_reward_ratio": "1:2" if setup else None, "reason": reason,
        "order_execution": ({"success": trade["status"] not in ("ENTRY_REJECTED", "SKIPPED"), "mode": trade["mode"],
                             "order_id": trade.get("entry_order_id") or trade["trade_id"], "broker_status": trade.get("broker_status"),
                             "quantity": trade.get("quantity"), "status": trade["status"], "detail": trade.get("notes")}
                            if trade else None),
    }


def _place_live_entry(trade: dict) -> dict:
    """Stop-limit BUY at the 09:15 high. If price already broke out, use a marketable limit within the buffer."""
    key = trade["instrument_key"]
    tick = trade["tick"]
    trigger = trade["entry"]
    limit = upstox_client.round_to_tick(trigger * (1 + ENTRY_LIMIT_BUFFER_PCT / 100), tick, "up")
    q = market_data.quotes([trade["symbol"]]).get(trade["symbol"]) or {}
    ltp = q.get("ltp") or 0
    if ltp and ltp > limit:
        trade.update(status="SKIPPED", broker_status="NOT_SENT",
                     notes=f"Price ran away: LTP {ltp} above entry limit {limit}; no chase.")
        return trade
    if ltp and ltp >= trigger:
        res = upstox_client.place_order(trade["symbol"], key, trade["quantity"], "BUY", "LIMIT", price=limit)
        trade["order_type"] = "LIMIT"
    else:
        res = upstox_client.place_order(trade["symbol"], key, trade["quantity"], "BUY", "SL", price=limit, trigger_price=trigger)
        trade["order_type"] = "SL"
    trade["latency_ms"] = res.get("latency_ms")
    if res["success"]:
        trade.update(entry_order_id=res["order_id"], broker_status="PLACED",
                     notes=f"{trade['order_type']} BUY trigger {trigger} limit {limit}")
    else:
        trade.update(status="ENTRY_REJECTED", broker_status=res.get("broker_status"), notes=str(res.get("detail"))[:500])
    return trade


def run_phase2_candle_close_check(session_date: date = None) -> dict:
    global LAST_PHASE2_RESULT
    t_start = time.perf_counter()
    session_date = session_date or resolve_session()
    now = _now()
    if session_date == now.date() and MARKET_OPEN <= now.time() < dtime(9, 16):
        # Never evaluate a still-forming 09:15 bar: wait for its close.
        close_at = IST.localize(datetime.combine(session_date, dtime(9, 16, 1)))
        time.sleep(max(0.0, (close_at - now).total_seconds()))
    if CURRENT_SESSION_DATE != session_date.isoformat() or not LAST_PHASE1_RESULT:
        run_phase1_market_open_filter(session_date=session_date)
    live_window = is_live_entry_window(session_date)
    go_live = live_window and TRADING_MODE == "live" and upstox_client.is_token_active()
    run_mode = ("LIVE" if go_live else "PAPER") if live_window else "REPLAY"
    candidates = list(PHASE1_TRACKED_STOCKS)
    wait = 45.0 if live_window else 0.0

    def process(stock):
        sym, pdh = stock["symbol"], stock["prev_day_high"]
        t0 = time.perf_counter()
        bar, payload = _fetch_0915_bar(sym, session_date, wait)
        lat = round((time.perf_counter() - t0) * 1000, 2)
        if not bar:
            return _evaluation_record(sym, pdh, None, payload["source"], lat, reason="09:15 candle unavailable"), None
        if not is_orb_setup(bar["o"], bar["c"], pdh):
            why = "open >= PDH" if bar["o"] >= pdh else "close <= PDH"
            return _evaluation_record(sym, pdh, bar, payload["source"], lat, reason=f"No setup ({why})"), None
        tick = upstox_client.tick_size(stock["instrument_key"], bar["h"])
        levels = compute_levels(bar["h"], bar["l"], tick)
        return _evaluation_record(sym, pdh, bar, payload["source"], lat, levels=levels), (stock, bar, payload, levels)

    with ThreadPoolExecutor(max_workers=min(len(candidates), 10) or 1) as ex:
        results = list(ex.map(process, candidates))

    breakouts, non_breakouts, orders = [], [], []
    live_count = sum(1 for t in ACTIVE_TRADES if t["mode"] == "LIVE" and t["session_date"] == session_date.isoformat())
    for ev, setup in results:
        if not setup:
            non_breakouts.append(ev)
            continue
        stock, bar, payload, levels = setup
        sym = stock["symbol"]
        existing = _existing_trade(session_date.isoformat(), sym)
        if existing is not None:
            ev["reason"] = "Trade already recorded for this session (duplicate protection)"
            breakouts.append(ev)
            continue
        qty = position_size(levels["entry"], levels["risk"])
        trade = {
            "trade_id": f"ORB-{session_date:%Y%m%d}-{sym}", "session_date": session_date.isoformat(), "symbol": sym,
            "instrument_key": stock["instrument_key"], "mode": run_mode, "quantity": qty, **levels,
            "pdh": stock["prev_day_high"], "status": "PENDING_ENTRY", "created_at": _stamp(), "order_type": "SL",
            "candle": {"open": bar["o"], "high": bar["h"], "low": bar["l"], "close": bar["c"]},
            "data_source": payload["source"], "broker_status": "PAPER" if run_mode != "LIVE" else None,
            "entry_order_id": None, "sl_order_id": None, "exit_order_id": None, "entry_fill_price": None,
            "entry_time": None, "exit_price": None, "exit_time": None, "pnl": None, "r_multiple": None, "notes": None,
        }
        if qty <= 0:
            trade.update(status="SKIPPED", notes="Position size is 0 (risk budget / capital cap too small)")
        elif run_mode == "LIVE":
            broker_data = payload["source"] == market_data.SOURCE_UPSTOX and stock.get("pdh_source") == market_data.SOURCE_UPSTOX
            if not broker_data:
                trade.update(mode="PAPER", broker_status="PAPER", notes="Live blocked: data not from Upstox; tracked as paper")
            elif live_count >= MAX_LIVE_TRADES_PER_DAY:
                trade.update(mode="PAPER", broker_status="PAPER", notes=f"Live blocked: MAX_LIVE_TRADES_PER_DAY={MAX_LIVE_TRADES_PER_DAY}")
            else:
                _place_live_entry(trade)
                live_count += 1
        if trade["mode"] != "LIVE" and trade["status"] == "PENDING_ENTRY":
            _refresh_simulated(trade, alert=False)
        trade.update(trade_pnl(trade))
        with _lock:
            ACTIVE_TRADES.append(trade)
            ORDER_HISTORY.insert(0, trade)
        _persist_trade(trade)
        ev["order_execution"] = _evaluation_record(sym, None, None, None, None, levels=levels, trade=trade)["order_execution"]
        breakouts.append(ev)
        orders.append(ev["order_execution"])
        if run_mode != "REPLAY":
            _broadcast(
                f"*ORB SETUP ({trade['mode']}) - {sym}*\n09:15 O {bar['o']} H {bar['h']} L {bar['l']} C {bar['c']} | PDH {stock['prev_day_high']}\n"
                f"BUY STOP {levels['entry']} | SL {levels['stop_loss']} | TARGET {levels['target']} (R {levels['risk']}) | Qty {qty}\n"
                f"Status: {trade['status']}{' - ' + trade['notes'] if trade.get('notes') else ''}")

    with _lock:
        for ev in breakouts + non_breakouts:
            STRATEGY_LOGS.insert(0, ev)
        del STRATEGY_LOGS[150:]

    summary = {
        "timestamp": _stamp(), "phase": "PHASE_2_CANDLE_CLOSE_EXECUTION", "session_date": session_date.isoformat(),
        "run_mode": run_mode, "trading_mode": TRADING_MODE,
        "condition": "close of 09:15 candle above previous day high (close > PDH)", "scheduled_time": "09:16:00 AM IST",
        "total_tracked_stocks_evaluated": len(candidates), "breakouts_confirmed": len(breakouts),
        "orders_executed": len(orders), "total_latency_ms": round((time.perf_counter() - t_start) * 1000, 2),
        "execution_latency_ms": round((time.perf_counter() - t_start) * 1000, 2),
        "breakout_stocks": breakouts, "non_breakout_stocks": non_breakouts, "orders": orders,
    }
    LAST_PHASE2_RESULT = summary
    if live_window and not breakouts:
        _broadcast(f"*09:16 Phase 2 - {session_date}*\nEvaluated {len(candidates)} tracked stocks. No 09:15 close above PDH. No trades.")
    return summary


def run_strategy_pipeline(force_refresh_pdh: bool = False) -> dict:
    session_date = resolve_session()
    p1 = run_phase1_market_open_filter(force_refresh_pdh=force_refresh_pdh, session_date=session_date)
    p2 = run_phase2_candle_close_check(session_date=session_date)
    return {
        "timestamp": p2["timestamp"], "pipeline_status": "COMPLETED", "session_date": session_date.isoformat(),
        "run_mode": p2["run_mode"], "phase1_market_open": p1, "phase2_candle_close": p2,
        "total_execution_speed_ms": round(p1["execution_latency_ms"] + p2["total_latency_ms"], 2),
        "breakouts_count": p2["breakouts_confirmed"], "orders_count": p2["orders_executed"],
        "evaluations": p2["breakout_stocks"] + p2["non_breakout_stocks"],
    }


def run_strategy_check():
    return run_strategy_pipeline()["evaluations"]


# ===========================================================================
# Trade manager
# ===========================================================================
def _fmt_time(t):
    return datetime.fromtimestamp(t, IST).strftime("%H:%M") if isinstance(t, (int, float)) else t


def _alert_transition(trade: dict, old_status: str):
    if trade["status"] == old_status or trade["mode"] == "REPLAY":
        return
    s, sym = trade["status"], trade["symbol"]
    pnl = trade.get("pnl")
    pnl_txt = f" | P&L Rs.{pnl:+.2f} ({trade.get('r_multiple')}R)" if pnl is not None else ""
    lines = {
        "OPEN": f"*ENTRY FILLED ({trade['mode']}) - {sym}* @ {trade.get('entry_fill_price')} | SL {trade['stop_loss']} | TGT {trade['target']}",
        "TARGET_HIT": f"*TARGET HIT ({trade['mode']}) - {sym}* exit {trade.get('exit_price')}{pnl_txt}",
        "STOP_LOSS_HIT": f"*STOP LOSS ({trade['mode']}) - {sym}* exit {trade.get('exit_price')}{pnl_txt}",
        "EXITED_EOD": f"*15:15 SQUARE-OFF ({trade['mode']}) - {sym}* exit {trade.get('exit_price')}{pnl_txt}",
        "ENTRY_NOT_TRIGGERED": f"*{sym}*: entry {trade['entry']} never triggered - cancelled at 15:15.",
        "ENTRY_REJECTED": f"*{sym}*: entry order REJECTED by broker - {trade.get('notes')}",
        "ENTRY_CANCELLED": f"*{sym}*: entry order cancelled - {trade.get('notes')}",
    }
    if s in lines:
        _broadcast(lines[s])


def _refresh_simulated(trade: dict, alert: bool = True):
    sd = date.fromisoformat(trade["session_date"])
    sessions = 1 if sd == _now().date() else 5
    candles = market_data.intraday_candles(trade["symbol"], sessions=sessions)["candles"]
    sim = simulate_trade(trade, market_data.session_candles(candles, sd), sd)
    old = trade["status"]
    trade.update({k: sim[k] for k in ("status", "entry_fill_price", "exit_price", "ltp")})
    trade["entry_time"] = _fmt_time(sim["entry_time"])
    trade["exit_time"] = _fmt_time(sim["exit_time"])
    trade.update(trade_pnl(trade))
    if alert:
        _alert_transition(trade, old)
    return old != trade["status"]


def _exit_live(trade: dict, reason: str, ltp: float):
    if trade.get("sl_order_id"):
        upstox_client.cancel_order(trade["sl_order_id"])
    res = upstox_client.place_order(trade["symbol"], trade["instrument_key"], trade["quantity"], "SELL", "MARKET")
    trade["exit_order_id"] = res.get("order_id")
    if not res["success"]:
        trade["notes"] = f"EXIT ORDER FAILED ({reason}) - CHECK BROKER NOW: {str(res.get('detail'))[:300]}"
        _broadcast(f"*URGENT {trade['symbol']}*: exit order failed - square off manually. {trade['notes']}")
        return
    det = upstox_client.get_order_details(res["order_id"])
    trade.update(status=reason, exit_price=det.get("average_price") or ltp, exit_time=_now().strftime("%H:%M"))


def _manage_live(trade: dict, ltp: float):
    now_t = _now().time()
    old = trade["status"]
    trade["ltp"] = ltp or trade.get("ltp")
    if trade["status"] == "PENDING_ENTRY" and trade.get("entry_order_id"):
        det = upstox_client.get_order_details(trade["entry_order_id"])
        st = det.get("status")
        if st == "complete":
            trade.update(status="OPEN", entry_fill_price=det["average_price"] or trade["entry"],
                         entry_time=_now().strftime("%H:%M"), quantity=det.get("filled_quantity") or trade["quantity"])
            # Protective stop lives at the broker, so a crash or network loss can't leave the position naked.
            if ltp and ltp <= trade["stop_loss"]:
                _exit_live(trade, "STOP_LOSS_HIT", ltp)
            else:
                sl = upstox_client.place_order(trade["symbol"], trade["instrument_key"], trade["quantity"], "SELL", "SL-M",
                                               trigger_price=trade["stop_loss"])
                if sl["success"]:
                    trade["sl_order_id"] = sl["order_id"]
                else:
                    trade["notes"] = f"Protective SL rejected ({str(sl.get('detail'))[:200]}); exiting for safety"
                    _exit_live(trade, "STOP_LOSS_HIT", ltp)
        elif st in ("rejected",):
            trade.update(status="ENTRY_REJECTED", notes=det.get("status_message"))
        elif st in ("cancelled",):
            trade.update(status="ENTRY_CANCELLED", notes=det.get("status_message") or "Cancelled at broker")
        elif now_t >= SQUARE_OFF:
            upstox_client.cancel_order(trade["entry_order_id"])
            trade["status"] = "ENTRY_NOT_TRIGGERED"
    elif trade["status"] == "OPEN":
        sl_det = upstox_client.get_order_details(trade["sl_order_id"]) if trade.get("sl_order_id") else {}
        if sl_det.get("status") == "complete":
            trade.update(status="STOP_LOSS_HIT", exit_price=sl_det["average_price"], exit_time=_now().strftime("%H:%M"))
        elif sl_det.get("status") in ("rejected", "cancelled") and now_t < SQUARE_OFF:
            _exit_live(trade, "STOP_LOSS_HIT", ltp)  # unprotected position: flatten
        elif ltp and ltp >= trade["target"]:
            _exit_live(trade, "TARGET_HIT", ltp)
        elif now_t >= SQUARE_OFF:
            _exit_live(trade, "EXITED_EOD", ltp)
    trade.update(trade_pnl(trade))
    _alert_transition(trade, old)
    return old != trade["status"]


def update_trades():
    with _lock:
        open_trades = [t for t in ACTIVE_TRADES if t["status"] not in TERMINAL_STATUSES]
    if not open_trades:
        return
    live = [t for t in open_trades if t["mode"] == "LIVE"]
    ltps = market_data.quotes([t["symbol"] for t in live]) if live else {}
    for t in open_trades:
        try:
            changed = _manage_live(t, (ltps.get(t["symbol"]) or {}).get("ltp")) if t["mode"] == "LIVE" else _refresh_simulated(t)
            if changed:
                _persist_trade(t)
        except Exception as e:
            print(f"Trade manager error on {t['symbol']}: {e}")


def get_trades(session_date: str = None) -> list:
    """Today's trades with refreshed simulated status (cheap: candles are cached)."""
    with _lock:
        trades = [t for t in ACTIVE_TRADES if not session_date or t["session_date"] == session_date]
    for t in trades:
        if t["mode"] != "LIVE" and t["status"] not in TERMINAL_STATUSES:
            try:
                if _refresh_simulated(t):
                    _persist_trade(t)
            except Exception:
                pass
    return trades


# ===========================================================================
# Placeholder multi-strategy runner (other strategies are not implemented on real indicators yet)
# ===========================================================================
def run_multi_strategy_check(strategy_keys: list = None, db_strategies: list = None):
    strategy_keys = strategy_keys or ["open_range_breakout"]
    t_start = time.perf_counter()
    orb_evals = run_strategy_check()
    meta = {s.key: s for s in (db_strategies or [])}
    results = {}
    for key in strategy_keys:
        if key in ("open_range_breakout", "opening_high_breakout"):
            results[key] = {"strategy_key": key, "strategy_name": "1-Minute Open Range Breakout (ORB) Strategy",
                            "timeframe": "1-Min (09:15-09:16)", "status": "EXECUTED",
                            "signals_detected": sum(1 for e in orb_evals if e.get("setup_detected")), "evaluations": orb_evals}
        else:
            m = meta.get(key)
            results[key] = {"strategy_key": key, "strategy_name": m.name if m else key, "timeframe": m.timeframe if m else "-",
                            "status": "NOT_IMPLEMENTED", "signals_detected": 0, "evaluations": [],
                            "note": "No real indicator implementation exists for this strategy yet; no signals are generated."}
    return {"timestamp": _stamp(), "total_strategies_executed": len(strategy_keys),
            "total_latency_ms": round((time.perf_counter() - t_start) * 1000, 2),
            "parallel_execution_engine": "ORB engine", "strategies_results": results}


# ===========================================================================
# Scheduled jobs
# ===========================================================================
def morning_market_briefing_job():
    today = _now().date()
    _start_session(today)
    conn = upstox_client.test_connection()
    upstox_client.tick_size("NSE_EQ|INE002A01018", 1000)  # warm the tick-size master
    if conn.get("status") != "CONNECTED":
        app_url = (os.getenv("REDIRECT_URI") or os.getenv("NEXT_PUBLIC_API_URL") or "https://astra-algo.onrender.com").rstrip("/")
        auth_link = f"{app_url}/auth/login"
        send_telegram_alert(f"*Astra Algo: Upstox token needs daily approval*\nMode: {TRADING_MODE.upper()}\nAuthorize: {auth_link}")
        send_whatsapp_cta_button(header_text="Broker Session Expired",
                                 body_text=f"Upstox session expired ({_stamp()}). Tap to authorize before 09:15.",
                                 button_text="Authorize Upstox", button_url=auth_link, to_phone=WHATSAPP_AUTH_PHONE)
    market_data.clear_cache()  # new day: drop yesterday's bars, reload from the (possibly re-authed) broker
    fetch_and_cache_daily_highs(session_date=today)
    _broadcast(f"*Astra Algo morning briefing - {today}*\nUniverse: {len(NIFTY_50_UNIVERSE)} Nifty 50 stocks\n"
               f"Mode: {TRADING_MODE.upper()} | Broker: {conn.get('status')}\nPhase 1 at 09:15:00, Phase 2 at 09:16 candle close.")


def phase1_market_open_job():
    return run_phase1_market_open_filter(session_date=_now().date())


def phase2_candle_close_job():
    return run_phase2_candle_close_check(session_date=_now().date())


def market_open_job():
    return run_strategy_pipeline()["evaluations"]


def intraday_trade_monitor_job():
    now = _now()
    if now.weekday() >= 5 or not (dtime(9, 16) <= now.time() <= dtime(15, 25)):
        return
    update_trades()


def market_close_job():
    update_trades()
    today = _now().date().isoformat()
    with _lock:
        trades = [t for t in ACTIVE_TRADES if t["session_date"] == today]
    pnl = sum(t.get("pnl") or 0 for t in trades)
    lines = "\n".join(f"- {t['symbol']} ({t['mode']}): {t['status']} {('Rs.%+.2f' % t['pnl']) if t.get('pnl') is not None else ''}" for t in trades)
    _broadcast(f"*Astra Algo daily report - {today}*\nTrades: {len(trades)} | Net P&L (before charges): Rs.{pnl:+.2f}\n{lines or 'No setups today.'}")
