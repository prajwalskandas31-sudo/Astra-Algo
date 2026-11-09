"""
Upstox V2 broker gateway: auth status, order placement / status / cancel, tick sizes.

Market data (candles, quotes) lives in market_data.py.
This module never fabricates fills: paper trading is handled by strategy.py.
"""
import gzip
import json
import math
import os
import threading
import time
import urllib.parse

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

UPSTOX_API_KEY = os.getenv("UPSTOX_API_KEY")
UPSTOX_API_SECRET = os.getenv("UPSTOX_API_SECRET")
# Fallback to ACCESS_TOKEN if UPSTOX_ACCESS_TOKEN is not populated
UPSTOX_ACCESS_TOKEN = os.getenv("UPSTOX_ACCESS_TOKEN") or os.getenv("ACCESS_TOKEN")

BASE_URL = "https://api.upstox.com/v2"
INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"

# Persistent HTTP session with keep-alive pooling.
# Only idempotent GETs are retried; order POST/DELETE must never be blindly retried (risk of duplicate orders).
session = requests.Session()
_adapter = HTTPAdapter(
    pool_connections=30,
    pool_maxsize=30,
    max_retries=Retry(total=2, backoff_factor=0.1, status_forcelist=[502, 503, 504], allowed_methods=frozenset({"GET"})),
)
session.mount("https://", _adapter)

_TOKEN_STATUS_CACHE = {"status": None, "checked_at": 0, "is_valid": False}


def set_access_token(token: str):
    """Swap the in-memory token (after OAuth callback) and invalidate the status cache."""
    global UPSTOX_ACCESS_TOKEN
    UPSTOX_ACCESS_TOKEN = token
    _TOKEN_STATUS_CACHE.update({"status": None, "checked_at": 0, "is_valid": False})


def get_headers():
    return {
        "accept": "application/json",
        "Api-Version": "2.0",
        "Authorization": f"Bearer {UPSTOX_ACCESS_TOKEN}",
    }


def _token_configured() -> bool:
    return bool(UPSTOX_ACCESS_TOKEN) and "your_" not in UPSTOX_ACCESS_TOKEN


def is_token_active() -> bool:
    """True when the token is configured and was verified within the last 60 seconds."""
    if not _token_configured():
        return False
    if time.time() - _TOKEN_STATUS_CACHE["checked_at"] < 60:
        return _TOKEN_STATUS_CACHE["is_valid"]
    test_connection()
    return _TOKEN_STATUS_CACHE.get("is_valid", False)


def test_connection():
    """Checks Upstox API connection and token status."""
    if not _token_configured():
        return {"status": "UNCONFIGURED", "detail": "Missing or placeholder Upstox access token."}
    try:
        response = session.get(f"{BASE_URL}/user/profile", headers=get_headers(), timeout=3)
        if response.status_code == 200:
            user_data = response.json().get("data", {})
            _TOKEN_STATUS_CACHE.update({"status": "CONNECTED", "checked_at": time.time(), "is_valid": True})
            return {
                "status": "CONNECTED",
                "user_id": user_data.get("user_id"),
                "user_name": user_data.get("user_name"),
                "broker": "Upstox V2 API",
                "authenticated": True,
            }
        if response.status_code == 401:
            _TOKEN_STATUS_CACHE.update({"status": "EXPIRED", "checked_at": time.time(), "is_valid": False})
            return {"status": "EXPIRED", "detail": "Upstox token expired or invalid."}
        # Any other status is NOT proof of a valid session; don't trade on it.
        _TOKEN_STATUS_CACHE.update({"status": "DEGRADED", "checked_at": time.time(), "is_valid": False})
        return {"status": "DEGRADED", "detail": f"Upstox returned HTTP {response.status_code}", "http_status": response.status_code}
    except Exception as e:
        _TOKEN_STATUS_CACHE.update({"status": "ERROR", "checked_at": time.time(), "is_valid": False})
        return {"status": "ERROR", "detail": str(e)}


# ---------------------------------------------------------------------------
# Tick sizes (NSE rejects prices that are not a multiple of the instrument's tick)
# ---------------------------------------------------------------------------
_TICK_CACHE_FILE = os.path.join(os.path.dirname(__file__), "data", "tick_sizes.json")
_tick_lock = threading.Lock()
_tick_map = {}
_tick_loaded_day = None


def _fallback_tick(price: float) -> float:
    # NSE price-band tick schedule (used only if the instrument master is unavailable)
    if price < 250:
        return 0.01
    if price < 1000:
        return 0.05
    if price < 5000:
        return 0.10
    if price < 10000:
        return 0.50
    if price < 20000:
        return 1.00
    return 5.00


def _load_tick_map():
    global _tick_map, _tick_loaded_day
    today = time.strftime("%Y-%m-%d")
    with _tick_lock:
        if _tick_loaded_day == today and _tick_map:
            return
        try:
            if os.path.exists(_TICK_CACHE_FILE):
                cached = json.load(open(_TICK_CACHE_FILE, encoding="utf-8"))
                if cached.get("day") == today:
                    _tick_map, _tick_loaded_day = cached["ticks"], today
                    return
            resp = requests.get(INSTRUMENTS_URL, timeout=20)
            resp.raise_for_status()
            rows = json.loads(gzip.decompress(resp.content))
            # Upstox publishes tick_size in paise
            ticks = {r["instrument_key"]: float(r["tick_size"]) / 100.0
                     for r in rows if r.get("segment") == "NSE_EQ" and r.get("tick_size")}
            os.makedirs(os.path.dirname(_TICK_CACHE_FILE), exist_ok=True)
            json.dump({"day": today, "ticks": ticks}, open(_TICK_CACHE_FILE, "w", encoding="utf-8"))
            _tick_map, _tick_loaded_day = ticks, today
        except Exception as e:
            print(f"[upstox_client] Tick size master unavailable, using NSE price bands: {e}")
            _tick_loaded_day = today


def tick_size(instrument_key: str, price: float) -> float:
    _load_tick_map()
    return _tick_map.get(instrument_key) or _fallback_tick(price)


def round_to_tick(price: float, tick: float, mode: str = "nearest") -> float:
    """mode: 'up' (buy triggers), 'down' (stops), 'nearest'."""
    price = round(float(price), 2)  # strip float noise from vendors (e.g. 1324.4000244)
    if tick <= 0:
        return price
    n = price / tick
    n = math.ceil(n - 1e-6) if mode == "up" else math.floor(n + 1e-6) if mode == "down" else round(n)
    return round(n * tick, 2)


# ---------------------------------------------------------------------------
# Orders (live broker only)
# ---------------------------------------------------------------------------
def place_order(
    symbol: str,
    instrument_key: str,
    quantity: int,
    transaction_type: str,
    order_type: str,
    price: float = 0.0,
    trigger_price: float = 0.0,
    product: str = "I",
    tag: str = "astra_orb",
) -> dict:
    """
    Places an order on Upstox. order_type: MARKET | LIMIT | SL (stop-limit) | SL-M (stop-market).
    Returns {"success", "order_id", "broker_status", "latency_ms", "detail"}. Never simulates.
    """
    t0 = time.perf_counter()
    payload = {
        "quantity": int(quantity),
        "product": product,
        "validity": "DAY",
        "price": float(price) if order_type in ("LIMIT", "SL") else 0.0,
        "tag": tag,
        "instrument_token": instrument_key,
        "order_type": order_type,
        "transaction_type": transaction_type,
        "disclosed_quantity": 0,
        "trigger_price": float(trigger_price) if order_type in ("SL", "SL-M") else 0.0,
        "is_amo": False,
    }
    try:
        resp = session.post(f"{BASE_URL}/order/place", json=payload, headers=get_headers(), timeout=4.0)
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        try:
            body = resp.json()
        except Exception:
            body = {"raw": resp.text[:500]}
        if not isinstance(body, dict):
            body = {"raw": body}
        if resp.status_code in (200, 201) and body.get("status") == "success":
            return {"success": True, "order_id": (body.get("data") or {}).get("order_id"),
                    "broker_status": "PLACED", "latency_ms": latency_ms, "detail": body, "payload": payload}
        return {"success": False, "order_id": None, "broker_status": f"HTTP_{resp.status_code}",
                "latency_ms": latency_ms, "detail": body, "payload": payload}
    except Exception as e:
        return {"success": False, "order_id": None, "broker_status": "NETWORK_ERROR",
                "latency_ms": round((time.perf_counter() - t0) * 1000, 2), "detail": str(e), "payload": payload}


def get_order_details(order_id: str) -> dict:
    """Latest broker state for an order: status ('complete', 'open', 'trigger pending', 'rejected', 'cancelled'...)."""
    try:
        resp = session.get(f"{BASE_URL}/order/details?order_id={urllib.parse.quote(str(order_id))}",
                           headers=get_headers(), timeout=3)
        if resp.status_code == 200:
            d = resp.json().get("data") or {}
            return {"ok": True, "status": (d.get("status") or "").lower(), "average_price": float(d.get("average_price") or 0),
                    "filled_quantity": int(d.get("filled_quantity") or 0), "status_message": d.get("status_message"), "raw": d}
        return {"ok": False, "status": None, "detail": resp.text[:300]}
    except Exception as e:
        return {"ok": False, "status": None, "detail": str(e)}


def cancel_order(order_id: str) -> dict:
    try:
        resp = session.delete(f"{BASE_URL}/order/cancel?order_id={urllib.parse.quote(str(order_id))}",
                              headers=get_headers(), timeout=4)
        return {"ok": resp.status_code == 200, "detail": resp.text[:300]}
    except Exception as e:
        return {"ok": False, "detail": str(e)}
