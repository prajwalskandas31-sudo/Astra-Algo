"""
Single market-data layer for the engine, the dashboard and the live charts.

Primary source: Upstox V2 (only when the access token is valid).
Fallback source: Yahoo Finance chart API (real-time NSE bars, public, no key).

Every payload is tagged with `source` ("UPSTOX" or "YAHOO") so callers can refuse
non-broker data where it matters (live order placement requires broker data).

Candles are dicts: {"t": epoch_seconds_utc, "o", "h", "l", "c", "v"}, ascending by time.
"""
import csv
import os
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

import pytz
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    from . import upstox_client
except ImportError:
    import upstox_client

IST = pytz.timezone("Asia/Kolkata")
SOURCE_UPSTOX = "UPSTOX"
SOURCE_YAHOO = "YAHOO"

# ---------------------------------------------------------------------------
# Universe: official NSE Nifty 50 list (data/nifty50.csv). Single source of truth.
# Refresh the CSV from https://archives.nseindia.com/content/indices/ind_nifty50list.csv
# whenever the index is rebalanced.
# ---------------------------------------------------------------------------
_UNIVERSE_CSV = os.path.join(os.path.dirname(__file__), "data", "nifty50.csv")


def load_universe(path: str = _UNIVERSE_CSV) -> list:
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            sym = (r.get("Symbol") or "").strip()
            isin = (r.get("ISIN Code") or "").strip()
            if not sym or not isin:
                continue
            rows.append({
                "symbol": sym,
                "instrument_key": f"NSE_EQ|{isin}",
                "sector": (r.get("Industry") or "").strip(),
                "name": (r.get("Company Name") or "").strip(),
            })
    return rows


UNIVERSE = load_universe()
_BY_SYMBOL = {u["symbol"]: u for u in UNIVERSE}


def instrument_key_for(symbol: str):
    item = _BY_SYMBOL.get(symbol)
    return item["instrument_key"] if item else None


# ---------------------------------------------------------------------------
# HTTP + tiny TTL cache
# ---------------------------------------------------------------------------
_http = requests.Session()
_http.mount("https://", HTTPAdapter(pool_connections=20, pool_maxsize=20,
                                    max_retries=Retry(total=2, backoff_factor=0.2, status_forcelist=[429, 502, 503, 504])))
_http.headers.update({"User-Agent": "Mozilla/5.0 (AstraAlgo market data)"})

_cache = {}
_cache_lock = threading.Lock()


def _cached(key, ttl, fn):
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < ttl:
            return hit[1]
    val = fn()
    if val is not None:
        with _cache_lock:
            _cache[key] = (now, val)
    return val


def clear_cache():
    with _cache_lock:
        _cache.clear()


def now_ist() -> datetime:
    return datetime.now(IST)


def ist_date(epoch: int) -> date:
    return datetime.fromtimestamp(epoch, IST).date()


# ---------------------------------------------------------------------------
# Candle helpers (pure functions, unit tested)
# ---------------------------------------------------------------------------
def normalize_minutes(candles: list) -> list:
    """Floor timestamps to the minute and merge duplicates (Yahoo's live bar has an odd timestamp)."""
    merged = {}
    for c in sorted(candles, key=lambda x: x["t"]):
        t = (int(c["t"]) // 60) * 60
        m = merged.get(t)
        if m is None:
            merged[t] = {"t": t, "o": c["o"], "h": c["h"], "l": c["l"], "c": c["c"], "v": c.get("v") or 0}
        else:
            m["h"] = max(m["h"], c["h"])
            m["l"] = min(m["l"], c["l"])
            m["c"] = c["c"]
            m["v"] += c.get("v") or 0
    return [merged[k] for k in sorted(merged)]


def candle_at(candles: list, session_date: date, hh: int, mm: int):
    target = IST.localize(datetime(session_date.year, session_date.month, session_date.day, hh, mm)).timestamp()
    for c in candles:
        if int(c["t"]) == int(target):
            return c
    return None


def session_candles(candles: list, session_date: date) -> list:
    return [c for c in candles if ist_date(c["t"]) == session_date]


def session_dates(candles: list) -> list:
    return sorted({ist_date(c["t"]) for c in candles})


def previous_session_high_from_daily(daily: list, session_date: date):
    """High of the last daily candle strictly before session_date. Returns (high, date) or (None, None)."""
    prior = [c for c in daily if ist_date(c["t"]) < session_date]
    if not prior:
        return None, None
    last = max(prior, key=lambda c: c["t"])
    return float(last["h"]), ist_date(last["t"])


# ---------------------------------------------------------------------------
# Upstox fetchers
# ---------------------------------------------------------------------------
def _upstox_parse(raw: list) -> list:
    out = []
    for row in raw or []:
        try:
            ts = datetime.fromisoformat(row[0]).timestamp()
            out.append({"t": int(ts), "o": float(row[1]), "h": float(row[2]), "l": float(row[3]),
                        "c": float(row[4]), "v": float(row[5] or 0)})
        except Exception:
            continue
    return normalize_minutes(out) if out else []


def _upstox_get(path: str, timeout: float = 3.0):
    url = f"{upstox_client.BASE_URL}{path}"
    resp = upstox_client.session.get(url, headers=upstox_client.get_headers(), timeout=timeout)
    if resp.status_code != 200:
        return None
    body = resp.json()
    return body.get("data") if body.get("status") == "success" else None


def _upstox_intraday(key: str, sessions: int) -> list:
    k = urllib.parse.quote(key, safe="")
    today = _upstox_get(f"/historical-candle/intraday/{k}/1minute") or {}
    candles = _upstox_parse(today.get("candles"))
    if sessions > 1:
        to_d = (now_ist().date() - timedelta(days=1)).isoformat()
        from_d = (now_ist().date() - timedelta(days=sessions * 2 + 5)).isoformat()
        hist = _upstox_get(f"/historical-candle/{k}/1minute/{to_d}/{from_d}") or {}
        candles = normalize_minutes(_upstox_parse(hist.get("candles")) + candles)
    return candles


def _upstox_daily(key: str, lookback_days: int) -> list:
    k = urllib.parse.quote(key, safe="")
    to_d = now_ist().date().isoformat()
    from_d = (now_ist().date() - timedelta(days=lookback_days)).isoformat()
    data = _upstox_get(f"/historical-candle/{k}/day/{to_d}/{from_d}") or {}
    out = []
    for row in data.get("candles") or []:
        try:
            out.append({"t": int(datetime.fromisoformat(row[0]).timestamp()), "o": float(row[1]),
                        "h": float(row[2]), "l": float(row[3]), "c": float(row[4]), "v": float(row[5] or 0)})
        except Exception:
            continue
    return sorted(out, key=lambda c: c["t"])


# ---------------------------------------------------------------------------
# Yahoo fetchers
# ---------------------------------------------------------------------------
def yahoo_symbol(symbol: str) -> str:
    return urllib.parse.quote(f"{symbol}.NS", safe="")


def _yahoo_chart(symbol: str, interval: str, rng: str):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_symbol(symbol)}?interval={interval}&range={rng}"
    resp = _http.get(url, timeout=6)
    if resp.status_code != 200:
        return None, []
    res = (resp.json().get("chart") or {}).get("result") or []
    if not res:
        return None, []
    r = res[0]
    ts = r.get("timestamp") or []
    q = ((r.get("indicators") or {}).get("quote") or [{}])[0]
    out = []
    for i, t in enumerate(ts):
        o, h, l, c = (q.get(k, [None] * len(ts))[i] for k in ("open", "high", "low", "close"))
        if None in (o, h, l, c):
            continue
        out.append({"t": int(t), "o": round(float(o), 2), "h": round(float(h), 2), "l": round(float(l), 2),
                    "c": round(float(c), 2), "v": float((q.get("volume") or [0] * len(ts))[i] or 0)})
    return r.get("meta") or {}, out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def intraday_candles(symbol: str, sessions: int = 1, broker_only: bool = False, ttl: float = 2.0) -> dict:
    """1-minute candles for the last `sessions` trading sessions (ascending)."""
    key = instrument_key_for(symbol)

    def load():
        if key and upstox_client.is_token_active():
            try:
                c = _upstox_intraday(key, sessions)
                if c:
                    return {"symbol": symbol, "source": SOURCE_UPSTOX, "candles": c}
            except Exception as e:
                print(f"[market_data] Upstox intraday failed for {symbol}: {e}")
        if broker_only:
            return {"symbol": symbol, "source": None, "candles": []}
        try:
            _, c = _yahoo_chart(symbol, "1m", "1d" if sessions <= 1 else ("5d" if sessions <= 5 else "7d"))
            c = normalize_minutes(c)
            if sessions >= 1 and c:
                keep = set(session_dates(c)[-sessions:])
                c = [x for x in c if ist_date(x["t"]) in keep]
            return {"symbol": symbol, "source": SOURCE_YAHOO, "candles": c}
        except Exception as e:
            print(f"[market_data] Yahoo intraday failed for {symbol}: {e}")
            return {"symbol": symbol, "source": None, "candles": []}

    return _cached(("intraday", symbol, sessions, broker_only), ttl, load)


def daily_candles(symbol: str, lookback_days: int = 20, broker_only: bool = False) -> dict:
    key = instrument_key_for(symbol)

    def load():
        if key and upstox_client.is_token_active():
            try:
                c = _upstox_daily(key, lookback_days)
                if c:
                    return {"symbol": symbol, "source": SOURCE_UPSTOX, "candles": c}
            except Exception as e:
                print(f"[market_data] Upstox daily failed for {symbol}: {e}")
        if broker_only:
            return {"symbol": symbol, "source": None, "candles": []}
        try:
            _, c = _yahoo_chart(symbol, "1d", "1mo")
            return {"symbol": symbol, "source": SOURCE_YAHOO, "candles": c}
        except Exception as e:
            print(f"[market_data] Yahoo daily failed for {symbol}: {e}")
            return {"symbol": symbol, "source": None, "candles": []}

    # Only *completed* prior sessions are used (PDH), so cache for the calendar day (keyed by IST date).
    # A source switch (Yahoo -> Upstox after re-auth) is handled by clear_cache() in the OAuth callback.
    return _cached(("daily", symbol, lookback_days, broker_only, now_ist().date()), 6 * 3600, load)


def warm_daily_cache():
    """Prefetch daily bars for the whole universe (startup / 09:00) so PDH lookups are instant."""
    with ThreadPoolExecutor(max_workers=10) as ex:
        list(ex.map(lambda u: daily_candles(u["symbol"]), UNIVERSE))


def previous_day_high(symbol: str, session_date: date, broker_only: bool = False) -> dict:
    d = daily_candles(symbol, broker_only=broker_only)
    pdh, pdh_date = previous_session_high_from_daily(d["candles"], session_date)
    return {"symbol": symbol, "pdh": pdh, "pdh_date": pdh_date.isoformat() if pdh_date else None, "source": d["source"]}


def latest_session_date(reference_symbol: str = "RELIANCE"):
    """Most recent session date that has 1-minute data (today during market hours)."""
    c = intraday_candles(reference_symbol, sessions=1)["candles"]
    if c:
        return ist_date(c[-1]["t"])
    c = intraday_candles(reference_symbol, sessions=5)["candles"]
    return ist_date(c[-1]["t"]) if c else None


def _upstox_quotes(keys: list) -> dict:
    data = _upstox_get("/market-quote/quotes?instrument_key=" + urllib.parse.quote(",".join(keys), safe=","), timeout=3) or {}
    out = {}
    for q in data.values():
        tok = q.get("instrument_token")
        if not tok:
            continue
        ltp = float(q.get("last_price") or 0)
        net = float(q.get("net_change") or 0)
        ohlc = q.get("ohlc") or {}
        out[tok] = {"ltp": ltp, "open": float(ohlc.get("open") or 0), "high": float(ohlc.get("high") or 0),
                    "low": float(ohlc.get("low") or 0), "prev_close": round(ltp - net, 2) if ltp else None,
                    "volume": float(q.get("volume") or 0)}
    return out


def quotes(symbols: list = None) -> dict:
    """Live quote snapshot for the given symbols (default: whole universe)."""
    symbols = symbols or [u["symbol"] for u in UNIVERSE]

    def load():
        result = {}
        if upstox_client.is_token_active():
            try:
                keys = [instrument_key_for(s) for s in symbols if instrument_key_for(s)]
                raw = _upstox_quotes(keys)
                for s in symbols:
                    q = raw.get(instrument_key_for(s))
                    if q and q["ltp"]:
                        result[s] = {**q, "symbol": s, "source": SOURCE_UPSTOX}
            except Exception as e:
                print(f"[market_data] Upstox quotes failed: {e}")
        missing = [s for s in symbols if s not in result]
        if missing:
            # Yahoo "spark" batches 20 symbols per call (~0.3s) instead of one request per symbol.
            def batch(chunk):
                out = {}
                try:
                    url = ("https://query1.finance.yahoo.com/v7/finance/spark?range=1d&interval=1d&symbols="
                           + ",".join(yahoo_symbol(s) for s in chunk))
                    resp = _http.get(url, timeout=6)
                    if resp.status_code != 200:
                        return out
                    for item in (resp.json().get("spark") or {}).get("result") or []:
                        sym = (item.get("symbol") or "")[:-3]  # strip ".NS"
                        meta = ((item.get("response") or [{}])[0] or {}).get("meta") or {}
                        ltp = meta.get("regularMarketPrice")
                        if sym in chunk and ltp:
                            out[sym] = {
                                "symbol": sym, "ltp": float(ltp), "open": None,  # spark has no open; Phase 1 reads the 09:15 bar
                                "high": meta.get("regularMarketDayHigh"), "low": meta.get("regularMarketDayLow"),
                                "prev_close": float(meta.get("chartPreviousClose") or meta.get("previousClose") or 0) or None,
                                "volume": float(meta.get("regularMarketVolume") or 0), "source": SOURCE_YAHOO,
                            }
                except Exception as e:
                    print(f"[market_data] Yahoo spark failed: {e}")
                return out
            chunks = [missing[i:i + 20] for i in range(0, len(missing), 20)]
            with ThreadPoolExecutor(max_workers=len(chunks)) as ex:
                for part in ex.map(batch, chunks):
                    result.update(part)
        for q in result.values():
            pc = q.get("prev_close")
            q["change_pct"] = round((q["ltp"] - pc) / pc * 100, 2) if pc else None
        return result

    return _cached(("quotes", tuple(sorted(symbols))), 3.0, load)
