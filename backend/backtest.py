"""
Backtesting engine for every strategy the desk knows how to evaluate.

Principles (same as the live engine):
  * Real historical 1-minute candles only (Upstox when the token is valid, otherwise Yahoo). Nothing is synthesised.
  * Indicators use CLOSED bars only; entries fill at the OPEN of the next 1-minute bar (no look-ahead).
  * Conservative exits on 1-minute bars: if a bar touches both stop and target, the stop is assumed first;
    stops fill at min(stop, bar open), targets at max(target, bar open); everything is squared off at 15:15.
  * Indian intraday (MIS) equity charges and optional slippage are deducted from every trade.
  * Long-only, one open position per symbol at a time (all seeded strategies are long setups).

The 1-minute ORB strategy reuses strategy.is_orb_setup / compute_levels / simulate_trade, so the backtest
and the live desk apply byte-for-byte the same rules.
"""
import math
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, time as dtime

try:
    from . import market_data, strategy, upstox_client
except ImportError:
    import market_data
    import strategy
    import upstox_client

IST = market_data.IST
SESSION_OPEN = dtime(9, 15)
SQUARE_OFF = dtime(15, 15)
LAST_ENTRY = dtime(14, 45)
YAHOO_MAX_SESSIONS = 20      # Yahoo only serves ~30 calendar days of 1-minute bars
UPSTOX_MAX_SESSIONS = 120


# ===========================================================================
# Strategy catalogue (keys match the `strategies` table)
# ===========================================================================
STRATEGIES = {
    "open_range_breakout": {
        "name": "1-Minute Open Range Breakout (ORB)",
        "rules": "09:15 candle opens below previous-day high and closes above it. Buy on a break of its high, "
                 "stop at its low, target entry + 2R. Square off 15:15.",
    },
    "orb_15min": {
        "name": "Opening Range Breakout (ORB-15)",
        "rules": "Range = 09:15-09:29 high/low. First 5-min close above the range high with volume > 1.5x its "
                 "20-bar average. Stop at the range midpoint, target entry + 1.5x range. One trade a day.",
    },
    "ema_crossover_9_21": {
        "name": "EMA 9/21 Trend Crossover",
        "rules": "5-min EMA9 crosses above EMA21, close above session VWAP, ADX(14) > 22. Stop at the lowest low "
                 "of the last 3 bars, target 2R, or exit when a 5-min bar closes below EMA21.",
    },
    "vwap_mean_reversion": {
        "name": "VWAP Mean Reversion & Bounce",
        "rules": "3-min bar touches VWAP - 2 sigma, RSI(14) < 30, lower wick > 50% of the bar. Stop 0.3% below the "
                 "wick low, target the VWAP at signal time.",
    },
    "cpr_directional": {
        "name": "Central Pivot Range (CPR) Breakout",
        "rules": "CPR from the previous day; width < 0.25% of pivot. First 5-min bar closes above TC while the "
                 "Nifty 50 index's first 5-min bar is green. Stop at BC, target R1 (R2 if R1 is below entry).",
    },
    "supertrend_mtf": {
        "name": "Supertrend Multi-Timeframe",
        "rules": "15-min Supertrend(10,2) bullish and 5-min Supertrend(7,3) flips to bullish with volume above its "
                 "20-bar average. Trailing stop on the 5-min Supertrend line; exit on a bearish flip.",
    },
}
ALIASES = {"opening_high_breakout": "open_range_breakout"}


def resolve_key(key: str):
    key = ALIASES.get(key, key)
    return key if key in STRATEGIES else None


# ===========================================================================
# Time helpers
# ===========================================================================
def _ts(d: date, t: dtime) -> int:
    return int(IST.localize(datetime(d.year, d.month, d.day, t.hour, t.minute)).timestamp())


def _clock(ts: int) -> dtime:
    return datetime.fromtimestamp(ts, IST).time()


def _hhmm(ts):
    return datetime.fromtimestamp(ts, IST).strftime("%H:%M") if ts else None


# ===========================================================================
# Indicators (pure, unit tested)
# ===========================================================================
def resample(bars: list, minutes: int) -> list:
    """Aggregate 1-minute bars (one or many sessions) into N-minute bars anchored at 09:15 IST.
    Each output bar carries `t` (start) and `tc` (close time = start + N minutes)."""
    out, cur = [], None
    for b in bars:
        d = market_data.ist_date(b["t"])
        open_ts = _ts(d, SESSION_OPEN)
        if b["t"] < open_ts:
            continue
        start = open_ts + ((b["t"] - open_ts) // (60 * minutes)) * 60 * minutes
        if cur is None or cur["t"] != start:
            cur = {"t": start, "tc": start + 60 * minutes, "o": b["o"], "h": b["h"], "l": b["l"], "c": b["c"], "v": b.get("v") or 0}
            out.append(cur)
        else:
            cur["h"] = max(cur["h"], b["h"])
            cur["l"] = min(cur["l"], b["l"])
            cur["c"] = b["c"]
            cur["v"] += b.get("v") or 0
    return out


def ema(values: list, n: int) -> list:
    k, out, prev = 2 / (n + 1), [], None
    for v in values:
        prev = v if prev is None else v * k + prev * (1 - k)
        out.append(prev)
    return out


def sma(values: list, n: int) -> list:
    out, s = [], 0.0
    for i, v in enumerate(values):
        s += v
        if i >= n:
            s -= values[i - n]
        out.append(s / n if i >= n - 1 else None)
    return out


def _rma(values: list, n: int) -> list:
    """Wilder smoothing; None until n values are available."""
    out, prev = [], None
    for i, v in enumerate(values):
        if i < n - 1:
            out.append(None)
        elif i == n - 1:
            prev = sum(values[:n]) / n
            out.append(prev)
        else:
            prev = (prev * (n - 1) + v) / n
            out.append(prev)
    return out


def rsi(closes: list, n: int = 14) -> list:
    gains = [0.0] + [max(closes[i] - closes[i - 1], 0) for i in range(1, len(closes))]
    losses = [0.0] + [max(closes[i - 1] - closes[i], 0) for i in range(1, len(closes))]
    ag, al = _rma(gains[1:], n), _rma(losses[1:], n)
    out = [None]
    for g, l in zip(ag, al):
        out.append(None if g is None else (100.0 if l == 0 else 100 - 100 / (1 + g / l)))
    return out


def true_range(bars: list) -> list:
    tr = []
    for i, b in enumerate(bars):
        if i == 0:
            tr.append(b["h"] - b["l"])
        else:
            pc = bars[i - 1]["c"]
            tr.append(max(b["h"] - b["l"], abs(b["h"] - pc), abs(b["l"] - pc)))
    return tr


def adx(bars: list, n: int = 14) -> list:
    if len(bars) < 2 * n + 1:
        return [None] * len(bars)
    pdm, ndm = [0.0], [0.0]
    for i in range(1, len(bars)):
        up = bars[i]["h"] - bars[i - 1]["h"]
        dn = bars[i - 1]["l"] - bars[i]["l"]
        pdm.append(up if up > dn and up > 0 else 0.0)
        ndm.append(dn if dn > up and dn > 0 else 0.0)
    atr_, sp, sn = _rma(true_range(bars)[1:], n), _rma(pdm[1:], n), _rma(ndm[1:], n)
    dx = []
    for a, p, m in zip(atr_, sp, sn):
        if a is None or a == 0:
            dx.append(None)
            continue
        pdi, ndi = 100 * p / a, 100 * m / a
        dx.append(0.0 if pdi + ndi == 0 else 100 * abs(pdi - ndi) / (pdi + ndi))
    first = next((i for i, v in enumerate(dx) if v is not None), None)
    out = [None] * len(dx)
    if first is not None:
        sm = _rma(dx[first:], n)
        out[first:] = sm
    return [None] + out


def supertrend(bars: list, period: int, mult: float) -> list:
    """Returns [(line, direction)] with direction 1 = bullish, -1 = bearish; (None, 0) during warm-up."""
    atr_ = _rma(true_range(bars), period)
    out, fu, fl, direction = [], None, None, 1
    for i, b in enumerate(bars):
        a = atr_[i]
        if a is None:
            out.append((None, 0))
            continue
        mid = (b["h"] + b["l"]) / 2
        bu, bl = mid + mult * a, mid - mult * a
        pc = bars[i - 1]["c"] if i else b["c"]
        fu = bu if fu is None or bu < fu or pc > fu else fu
        fl = bl if fl is None or bl > fl or pc < fl else fl
        if direction == 1 and b["c"] < fl:
            direction = -1
        elif direction == -1 and b["c"] > fu:
            direction = 1
        out.append((fl if direction == 1 else fu, direction))
    return out


def session_vwap(bars: list):
    """Cumulative VWAP and volume-weighted standard deviation, reset each session."""
    vw, sd, day, cv, cpv, cp2v = [], [], None, 0.0, 0.0, 0.0
    for b in bars:
        d = market_data.ist_date(b["t"])
        if d != day:
            day, cv, cpv, cp2v = d, 0.0, 0.0, 0.0
        tp = (b["h"] + b["l"] + b["c"]) / 3
        v = b.get("v") or 0
        if v <= 0:
            v = 1e-9  # keep VWAP defined for zero-volume bars (index data) without weighting them
        cv += v
        cpv += tp * v
        cp2v += tp * tp * v
        m = cpv / cv
        vw.append(m)
        sd.append(math.sqrt(max(cp2v / cv - m * m, 0.0)))
    return vw, sd


# ===========================================================================
# Costs (Indian intraday equity, per order)
# ===========================================================================
def intraday_charges(price: float, qty: int, side: str, brokerage_pct: float = 0.001, brokerage_cap: float = 20.0) -> float:
    turnover = price * qty
    brokerage = min(turnover * brokerage_pct, brokerage_cap)
    stt = turnover * 0.00025 if side == "sell" else 0.0          # 0.025% on the sell side
    exchange = turnover * 0.0000297                               # NSE transaction charge
    sebi = turnover * 0.000001                                    # Rs 10 per crore
    gst = 0.18 * (brokerage + exchange + sebi)
    stamp = turnover * 0.00003 if side == "buy" else 0.0          # 0.003% on the buy side
    return brokerage + stt + exchange + sebi + gst + stamp


# ===========================================================================
# Trade management on 1-minute bars
# ===========================================================================
def _bar_at_or_after(bars: list, ts: int):
    for i, b in enumerate(bars):
        if b["t"] >= ts:
            return i
    return None


def manage_long(bars: list, i0: int, entry: float, stop: float, target, eod_ts: int,
                stop_updates: list = None, exit_signals: list = None) -> dict:
    """Walk 1-minute bars from index i0 (the entry bar, already filled at `entry`).
    stop_updates: [(effective_ts, new_stop)] ascending - stop only ratchets up.
    exit_signals: ascending timestamps at which to exit at the bar open."""
    stop_updates, exit_signals = stop_updates or [], exit_signals or []
    su, xs, prev = 0, 0, None
    for b in bars[i0:]:
        if b["t"] >= eod_ts:
            if prev is not None and b["t"] > eod_ts + 60:
                # vendor gap over 15:15: square off at the last traded price before it
                return {"exit": prev["c"], "exit_t": eod_ts, "reason": "EOD"}
            return {"exit": b["o"], "exit_t": b["t"], "reason": "EOD"}
        prev = b
        while su < len(stop_updates) and stop_updates[su][0] <= b["t"]:
            stop = max(stop, stop_updates[su][1])
            su += 1
        while xs < len(exit_signals) and exit_signals[xs] <= bars[i0]["t"]:
            xs += 1
        if xs < len(exit_signals) and exit_signals[xs] <= b["t"]:
            return {"exit": b["o"], "exit_t": b["t"], "reason": "SIGNAL"}
        if b["l"] <= stop:
            return {"exit": min(stop, b["o"]), "exit_t": b["t"], "reason": "STOP"}
        if target is not None and b["h"] >= target:
            return {"exit": max(target, b["o"]), "exit_t": b["t"], "reason": "TARGET"}
    last = bars[-1]
    return {"exit": last["c"], "exit_t": last["t"], "reason": "EOD"}


# ===========================================================================
# Per-strategy signal generators. Each returns a list of raw trades for ONE symbol:
#   {"date", "entry_t", "entry", "stop", "target", "exit_t", "exit", "reason"}
# plus a count of setups that never filled (ORB pending orders).
# ===========================================================================
def _by_session(bars: list) -> dict:
    out = {}
    for b in bars:
        out.setdefault(market_data.ist_date(b["t"]), []).append(b)
    return out


def _trade(d, entry_t, entry, stop, target, ex):
    return {"date": d.isoformat(), "entry_t": entry_t, "entry": round(entry, 2), "stop": round(stop, 2),
            "target": round(target, 2) if target is not None else None,
            "exit_t": ex["exit_t"], "exit": round(ex["exit"], 2), "reason": ex["reason"]}


def _fill_next(day_bars: list, signal_close_ts: int):
    i = _bar_at_or_after(day_bars, signal_close_ts)
    if i is None or day_bars[i]["t"] >= _ts(market_data.ist_date(day_bars[i]["t"]), SQUARE_OFF):
        return None
    return i


def run_orb_1min(symbol, sessions, bars, daily, ctx):
    trades, unfilled, setups = [], 0, 0
    key = market_data.instrument_key_for(symbol)
    for d in sessions:
        day = bars.get(d) or []
        pdh, _ = market_data.previous_session_high_from_daily(daily, d)
        bar = market_data.candle_at(day, d, 9, 15)
        if not bar or not strategy.is_orb_setup(bar["o"], bar["c"], pdh):
            continue
        setups += 1
        lv = strategy.compute_levels(bar["h"], bar["l"], upstox_client.tick_size(key, bar["h"]) if key else 0.05)
        if lv["risk"] <= 0:
            continue
        sim = strategy.simulate_trade(lv, day, d, now_ts=_ts(d, dtime(23, 59)))
        if sim["status"] in ("ENTRY_NOT_TRIGGERED", "PENDING_ENTRY") or not sim["entry_fill_price"]:
            unfilled += 1
            continue
        reason = {"TARGET_HIT": "TARGET", "STOP_LOSS_HIT": "STOP", "EXITED_EOD": "EOD"}.get(sim["status"], sim["status"])
        trades.append(_trade(d, sim["entry_time"], sim["entry_fill_price"], lv["stop_loss"], lv["target"],
                             {"exit": sim["exit_price"], "exit_t": sim["exit_time"], "reason": reason}))
    return trades, setups, unfilled


def run_orb_15(symbol, sessions, bars, daily, ctx):
    trades, setups = [], 0
    all5 = resample([b for d in sorted(bars) for b in bars[d]], 5)
    vavg = sma([b["v"] for b in all5], 20)
    idx = {b["t"]: i for i, b in enumerate(all5)}
    for d in sessions:
        day = bars.get(d) or []
        rng = [b for b in day if _ts(d, SESSION_OPEN) <= b["t"] < _ts(d, dtime(9, 30))]
        if len(rng) < 10:
            continue
        rh, rl = max(b["h"] for b in rng), min(b["l"] for b in rng)
        if rh <= rl:
            continue
        for b5 in (b for b in all5 if market_data.ist_date(b["t"]) == d and _ts(d, dtime(9, 30)) <= b["t"] and _clock(b["t"]) <= LAST_ENTRY):
            i = idx[b5["t"]]
            va = vavg[i - 1] if i > 0 else None
            if b5["c"] > rh and va and b5["v"] > 1.5 * va:
                setups += 1
                fi = _fill_next(day, b5["tc"])
                if fi is not None:
                    entry, stop = day[fi]["o"], (rh + rl) / 2
                    if entry > stop:
                        ex = manage_long(day, fi, entry, stop, entry + 1.5 * (rh - rl), _ts(d, SQUARE_OFF))
                        trades.append(_trade(d, day[fi]["t"], entry, stop, entry + 1.5 * (rh - rl), ex))
                break
    return trades, setups, 0


def run_ema_cross(symbol, sessions, bars, daily, ctx):
    trades, setups = [], 0
    all5 = resample([b for d in sorted(bars) for b in bars[d]], 5)
    closes = [b["c"] for b in all5]
    e9, e21, ax = ema(closes, 9), ema(closes, 21), adx(all5, 14)
    vw, _ = session_vwap(all5)
    wanted = set(sessions)
    busy_until = 0
    for i in range(1, len(all5)):
        b = all5[i]
        d = market_data.ist_date(b["t"])
        if d not in wanted or i < 30 or b["t"] < busy_until or not (dtime(9, 30) <= _clock(b["t"]) <= LAST_ENTRY):
            continue
        if not (e9[i - 1] <= e21[i - 1] and e9[i] > e21[i] and b["c"] > vw[i] and ax[i] is not None and ax[i] > 22):
            continue
        setups += 1
        day = bars[d]
        fi = _fill_next(day, b["tc"])
        if fi is None:
            continue
        entry, stop = day[fi]["o"], min(x["l"] for x in all5[max(0, i - 2):i + 1])
        if entry <= stop:
            continue
        target = entry + 2 * (entry - stop)
        exits = [all5[j]["tc"] for j in range(i + 1, len(all5))
                 if market_data.ist_date(all5[j]["t"]) == d and all5[j]["c"] < e21[j]]
        ex = manage_long(day, fi, entry, stop, target, _ts(d, SQUARE_OFF), exit_signals=exits)
        trades.append(_trade(d, day[fi]["t"], entry, stop, target, ex))
        busy_until = ex["exit_t"] + 60
    return trades, setups, 0


def run_vwap_mr(symbol, sessions, bars, daily, ctx):
    trades, setups = [], 0
    all3 = resample([b for d in sorted(bars) for b in bars[d]], 3)
    r = rsi([b["c"] for b in all3], 14)
    vw, sd = session_vwap(all3)
    wanted = set(sessions)
    busy_until = 0
    for i, b in enumerate(all3):
        d = market_data.ist_date(b["t"])
        if d not in wanted or b["t"] < busy_until or r[i] is None or not (dtime(9, 30) <= _clock(b["t"]) <= LAST_ENTRY):
            continue
        size = b["h"] - b["l"]
        lower_wick = min(b["o"], b["c"]) - b["l"]
        if not (sd[i] > 0 and b["l"] <= vw[i] - 2 * sd[i] and r[i] < 30 and size > 0 and lower_wick > 0.5 * size):
            continue
        setups += 1
        day = bars[d]
        fi = _fill_next(day, b["tc"])
        if fi is None:
            continue
        entry, stop, target = day[fi]["o"], b["l"] * (1 - 0.003), vw[i]
        if not (stop < entry < target):
            continue
        ex = manage_long(day, fi, entry, stop, target, _ts(d, SQUARE_OFF))
        trades.append(_trade(d, day[fi]["t"], entry, stop, target, ex))
        busy_until = ex["exit_t"] + 60
    return trades, setups, 0


def cpr_levels(h: float, l: float, c: float) -> dict:
    p = (h + l + c) / 3
    bc = (h + l) / 2
    tc = 2 * p - bc
    bc, tc = min(bc, tc), max(bc, tc)
    return {"p": p, "bc": bc, "tc": tc, "r1": 2 * p - l, "r2": p + (h - l), "width_pct": (tc - bc) / p * 100 if p else None}


def run_cpr(symbol, sessions, bars, daily, ctx):
    trades, setups = [], 0
    nifty_green = ctx.get("nifty_first5_green") or {}
    for d in sessions:
        day = bars.get(d) or []
        prior = [c for c in daily if market_data.ist_date(c["t"]) < d]
        if not prior or not day:
            continue
        pd_ = max(prior, key=lambda c: c["t"])
        lv = cpr_levels(pd_["h"], pd_["l"], pd_["c"])
        if lv["width_pct"] is None or lv["width_pct"] >= 0.25:
            continue
        first = [b for b in day if _ts(d, SESSION_OPEN) <= b["t"] < _ts(d, dtime(9, 20))]
        if len(first) < 4 or first[-1]["c"] <= lv["tc"]:
            continue
        if nifty_green and nifty_green.get(d) is False:
            continue
        setups += 1
        fi = _fill_next(day, _ts(d, dtime(9, 20)))
        if fi is None:
            continue
        entry, stop = day[fi]["o"], lv["bc"]
        target = lv["r1"] if lv["r1"] > entry else lv["r2"]
        if not (stop < entry < target):
            continue
        ex = manage_long(day, fi, entry, stop, target, _ts(d, SQUARE_OFF))
        trades.append(_trade(d, day[fi]["t"], entry, stop, target, ex))
    return trades, setups, 0


def run_supertrend(symbol, sessions, bars, daily, ctx):
    trades, setups = [], 0
    flat = [b for d in sorted(bars) for b in bars[d]]
    all5, all15 = resample(flat, 5), resample(flat, 15)
    st5, st15 = supertrend(all5, 7, 3), supertrend(all15, 10, 2)
    vavg = sma([b["v"] for b in all5], 20)
    wanted = set(sessions)
    busy_until, j15 = 0, -1
    for i in range(1, len(all5)):
        b = all5[i]
        while j15 + 1 < len(all15) and all15[j15 + 1]["tc"] <= b["tc"]:
            j15 += 1
        d = market_data.ist_date(b["t"])
        if d not in wanted or b["t"] < busy_until or not (dtime(9, 30) <= _clock(b["t"]) <= LAST_ENTRY):
            continue
        htf_bull = j15 >= 0 and st15[j15][1] == 1
        if not (st5[i - 1][1] == -1 and st5[i][1] == 1 and htf_bull and vavg[i] and b["v"] > vavg[i]):
            continue
        setups += 1
        day = bars[d]
        fi = _fill_next(day, b["tc"])
        if fi is None:
            continue
        entry, stop = day[fi]["o"], st5[i][0]
        if stop is None or entry <= stop:
            continue
        updates, exits = [], []
        for k in range(i + 1, len(all5)):
            if market_data.ist_date(all5[k]["t"]) != d:
                break
            line, dirn = st5[k]
            if dirn == 1 and line is not None:
                updates.append((all5[k]["tc"], line))
            elif dirn == -1:
                exits.append(all5[k]["tc"])
                break
        ex = manage_long(day, fi, entry, stop, None, _ts(d, SQUARE_OFF), stop_updates=updates, exit_signals=exits)
        trades.append(_trade(d, day[fi]["t"], entry, stop, None, ex))
        busy_until = ex["exit_t"] + 60
    return trades, setups, 0


RUNNERS = {
    "open_range_breakout": run_orb_1min,
    "orb_15min": run_orb_15,
    "ema_crossover_9_21": run_ema_cross,
    "vwap_mean_reversion": run_vwap_mr,
    "cpr_directional": run_cpr,
    "supertrend_mtf": run_supertrend,
}


# ===========================================================================
# Historical data
# ===========================================================================
_hist_cache, _hist_lock = {}, threading.Lock()


def _upstox_history(key: str, days: int) -> list:
    out, end = [], market_data.now_ist().date()
    start = end - timedelta(days=days)
    cur = end
    while cur > start:
        frm = max(start, cur - timedelta(days=27))
        k = market_data.urllib.parse.quote(key, safe="")
        data = market_data._upstox_get(f"/historical-candle/{k}/1minute/{cur.isoformat()}/{frm.isoformat()}", timeout=8) or {}
        out += market_data._upstox_parse(data.get("candles"))
        cur = frm - timedelta(days=1)
    today = market_data._upstox_get(f"/historical-candle/intraday/{market_data.urllib.parse.quote(key, safe='')}/1minute", timeout=5) or {}
    return market_data.normalize_minutes(out + market_data._upstox_parse(today.get("candles")))


def _yahoo_history(ysym: str, days: int) -> list:
    now = int(time.time())
    start = now - min(days, 29) * 86400
    out, p1 = [], start
    while p1 < now:
        p2 = min(p1 + 7 * 86400, now)
        _, c = market_data.yahoo_chart_query(ysym, f"interval=1m&period1={p1}&period2={p2}", timeout=10)
        out += c
        p1 = p2
    return market_data.normalize_minutes(out)


def load_history(symbol: str, sessions: int, use_upstox: bool) -> dict:
    """1-minute bars covering at least `sessions` sessions plus daily bars for PDH / CPR."""
    cal_days = int(sessions * 1.6) + 6
    ck = (symbol, cal_days, use_upstox, market_data.now_ist().strftime("%Y-%m-%d %H"))
    with _hist_lock:
        if ck in _hist_cache:
            return _hist_cache[ck]
    key = market_data.instrument_key_for(symbol)
    source, minutes, daily = None, [], []
    if use_upstox and key:
        try:
            minutes = _upstox_history(key, cal_days)
            daily = market_data._upstox_daily(key, cal_days + 15)
            source = market_data.SOURCE_UPSTOX if minutes else None
        except Exception as e:
            print(f"[backtest] Upstox history failed for {symbol}: {e}")
            minutes = []
    if not minutes:
        try:
            minutes = _yahoo_history(market_data.yahoo_symbol(symbol), cal_days)
            _, daily = market_data.yahoo_chart_query(market_data.yahoo_symbol(symbol), "interval=1d&range=6mo")
            source = market_data.SOURCE_YAHOO if minutes else None
        except Exception as e:
            print(f"[backtest] Yahoo history failed for {symbol}: {e}")
    res = {"symbol": symbol, "source": source, "minutes": minutes, "daily": daily}
    if minutes:
        with _hist_lock:
            if len(_hist_cache) > 400:
                _hist_cache.clear()
            _hist_cache[ck] = res
    return res


def _nifty_first5_green(sessions_days: int) -> dict:
    """{date: True/False} - was the Nifty 50 index's 09:15-09:19 bar green? Empty dict if unavailable."""
    try:
        bars = _yahoo_history("%5ENSEI", sessions_days)
    except Exception:
        return {}
    out = {}
    for d, day in _by_session(bars).items():
        first = [b for b in day if _ts(d, SESSION_OPEN) <= b["t"] < _ts(d, dtime(9, 20))]
        if first:
            out[d] = first[-1]["c"] > first[0]["o"]
    return out


# ===========================================================================
# Metrics
# ===========================================================================
def compute_metrics(trades: list, session_list: list, starting_capital: float) -> dict:
    n = len(trades)
    wins = [t for t in trades if t["net_pnl"] > 0]
    losses = [t for t in trades if t["net_pnl"] <= 0]
    gross_win = sum(t["net_pnl"] for t in wins)
    gross_loss = -sum(t["net_pnl"] for t in losses)
    net = sum(t["net_pnl"] for t in trades)

    daily = {d: 0.0 for d in session_list}
    for t in trades:
        daily[t["date"]] = daily.get(t["date"], 0.0) + t["net_pnl"]
    equity, peak, max_dd, curve = starting_capital, starting_capital, 0.0, []
    for d in sorted(daily):
        equity += daily[d]
        peak = max(peak, equity)
        max_dd = max(max_dd, peak - equity)
        curve.append({"date": d, "pnl": round(daily[d], 2), "equity": round(equity, 2), "drawdown": round(peak - equity, 2)})

    rets = [daily[d] / starting_capital for d in sorted(daily)] if starting_capital > 0 else []
    sharpe = sortino = None
    if len(rets) >= 2:
        mean = sum(rets) / len(rets)
        sd = math.sqrt(sum((r - mean) ** 2 for r in rets) / (len(rets) - 1))
        dn = [min(r, 0) for r in rets]
        dsd = math.sqrt(sum(x * x for x in dn) / (len(rets) - 1))
        sharpe = round(mean / sd * math.sqrt(252), 2) if sd > 0 else None
        sortino = round(mean / dsd * math.sqrt(252), 2) if dsd > 0 else None

    max_w = max_l = cw = cl = 0
    for t in sorted(trades, key=lambda x: x["entry_t"]):
        if t["net_pnl"] > 0:
            cw, cl = cw + 1, 0
        else:
            cl, cw = cl + 1, 0
        max_w, max_l = max(max_w, cw), max(max_l, cl)

    avg_win = gross_win / len(wins) if wins else None
    avg_loss = gross_loss / len(losses) if losses else None
    rs = [t["r_multiple"] for t in trades if t["r_multiple"] is not None]
    max_dd_pct = max_dd / starting_capital * 100 if starting_capital > 0 else None
    total_ret_pct = net / starting_capital * 100 if starting_capital > 0 else None
    calmar = None
    if max_dd_pct and session_list:
        annual = total_ret_pct * 252 / len(session_list)
        calmar = round(annual / max_dd_pct, 2)

    by_symbol = {}
    for t in trades:
        s = by_symbol.setdefault(t["symbol"], {"symbol": t["symbol"], "trades": 0, "wins": 0, "net_pnl": 0.0})
        s["trades"] += 1
        s["wins"] += 1 if t["net_pnl"] > 0 else 0
        s["net_pnl"] += t["net_pnl"]
    sym_rows = sorted(({**s, "net_pnl": round(s["net_pnl"], 2), "win_rate": round(s["wins"] / s["trades"] * 100, 1)}
                       for s in by_symbol.values()), key=lambda s: -s["net_pnl"])
    reasons = {}
    for t in trades:
        reasons[t["reason"]] = reasons.get(t["reason"], 0) + 1

    return {
        "trades": n, "wins": len(wins), "losses": len(losses),
        "win_rate": round(len(wins) / n * 100, 1) if n else None,
        "net_pnl": round(net, 2), "gross_pnl": round(sum(t["gross_pnl"] for t in trades), 2),
        "charges": round(sum(t["charges"] for t in trades), 2),
        "profit_factor": round(gross_win / gross_loss, 2) if gross_loss > 0 else None,
        "avg_win": round(avg_win, 2) if avg_win is not None else None,
        "avg_loss": round(avg_loss, 2) if avg_loss is not None else None,
        "win_loss_ratio": round(avg_win / avg_loss, 2) if avg_win and avg_loss else None,
        "expectancy": round(net / n, 2) if n else None,
        "avg_r": round(sum(rs) / len(rs), 2) if rs else None,
        "avg_return_pct": round(sum(t["return_pct"] for t in trades) / n, 3) if n else None,
        "total_return_pct": round(total_ret_pct, 2) if total_ret_pct is not None else None,
        "max_drawdown": round(max_dd, 2), "max_drawdown_pct": round(max_dd_pct, 2) if max_dd_pct is not None else None,
        "sharpe": sharpe, "sortino": sortino, "calmar": calmar,
        "max_consecutive_wins": max_w, "max_consecutive_losses": max_l,
        "best_symbol": sym_rows[0]["symbol"] if sym_rows and sym_rows[0]["net_pnl"] > 0 else None,
        "worst_symbol": sym_rows[-1]["symbol"] if sym_rows and sym_rows[-1]["net_pnl"] < 0 else None,
        "exit_reasons": reasons, "equity_curve": curve, "by_symbol": sym_rows,
    }


# ===========================================================================
# Orchestration
# ===========================================================================
def price_trade(raw: dict, symbol: str, p: dict):
    """Size the trade, apply slippage and charges. Returns None if the size works out to zero."""
    slip = p["slippage_bps"] / 10_000
    entry = raw["entry"] * (1 + slip)
    exit_ = raw["exit"] * (1 - slip)
    risk = raw["entry"] - raw["stop"]
    qty = math.floor(p["capital_per_trade"] / entry) if entry > 0 else 0
    if p["risk_per_trade"] > 0 and risk > 0:
        qty = min(qty, math.floor(p["risk_per_trade"] / risk))
    if qty <= 0:
        return None
    gross = (exit_ - entry) * qty
    charges = (intraday_charges(entry, qty, "buy") + intraday_charges(exit_, qty, "sell")) if p["include_costs"] else 0.0
    net = gross - charges
    return {
        "symbol": symbol, "date": raw["date"], "entry_time": _hhmm(raw["entry_t"]), "exit_time": _hhmm(raw["exit_t"]),
        "entry_t": raw["entry_t"], "qty": qty, "entry": round(entry, 2), "stop": raw["stop"], "target": raw["target"],
        "exit": round(exit_, 2), "reason": raw["reason"], "gross_pnl": round(gross, 2), "charges": round(charges, 2),
        "net_pnl": round(net, 2), "r_multiple": round((exit_ - entry) / risk, 2) if risk > 0 else None,
        "return_pct": round((exit_ - entry) / entry * 100, 3),
    }


def default_params() -> dict:
    return {"sessions": 20, "capital_per_trade": 100000.0, "risk_per_trade": 0.0, "starting_capital": 500000.0,
            "include_costs": True, "slippage_bps": 2.0, "symbols": None}


def max_sessions() -> dict:
    up = upstox_client.is_token_active()
    return {"upstox": up, "max_sessions": UPSTOX_MAX_SESSIONS if up else YAHOO_MAX_SESSIONS}


def run_backtest(strategy_key: str, params: dict, progress=None) -> dict:
    key = resolve_key(strategy_key)
    if not key:
        raise ValueError(f"No backtest implementation for strategy '{strategy_key}'.")
    p = {**default_params(), **{k: v for k, v in (params or {}).items() if v is not None}}
    use_upstox = upstox_client.is_token_active()
    cap = UPSTOX_MAX_SESSIONS if use_upstox else YAHOO_MAX_SESSIONS
    p["sessions"] = max(1, min(int(p["sessions"]), cap))
    universe = [u["symbol"] for u in market_data.UNIVERSE]
    symbols = [s for s in (p.get("symbols") or universe) if s in universe] or universe
    t0 = time.time()

    ctx = {}
    if key == "cpr_directional":
        ctx["nifty_first5_green"] = _nifty_first5_green(int(p["sessions"] * 1.6) + 6)

    done = [0]
    lock = threading.Lock()

    def one(sym):
        h = load_history(sym, p["sessions"], use_upstox)
        with lock:
            done[0] += 1
            if progress:
                progress(done[0], len(symbols))
        return h

    with ThreadPoolExecutor(max_workers=6) as ex:
        hist = list(ex.map(one, symbols))

    all_dates = sorted({d for h in hist for d in market_data.session_dates(h["minutes"])})
    today = market_data.now_ist()
    # Exclude today's session while it is still running (incomplete bars would bias exits).
    if all_dates and all_dates[-1] == today.date() and today.time() < dtime(15, 30):
        all_dates = all_dates[:-1]
    session_list = all_dates[-p["sessions"]:]
    sessions_set = set(session_list)

    trades, setups, unfilled, skipped, missing, sources = [], 0, 0, 0, [], {}
    for h in hist:
        sym = h["symbol"]
        if not h["minutes"]:
            missing.append(sym)
            continue
        sources[h["source"]] = sources.get(h["source"], 0) + 1
        by_day = _by_session(h["minutes"])
        sym_sessions = [d for d in session_list if d in by_day]
        bars = {d: v for d, v in by_day.items() if d in sessions_set or d < (session_list[0] if session_list else d)}
        raw, s, u = RUNNERS[key](sym, sym_sessions, bars, h["daily"], ctx)
        setups += s
        unfilled += u
        for r in raw:
            pt = price_trade(r, sym, p)
            if pt:
                trades.append(pt)
            else:
                skipped += 1

    trades.sort(key=lambda t: (t["date"], t["entry_t"], t["symbol"]))
    metrics = compute_metrics(trades, [d.isoformat() for d in session_list], p["starting_capital"])
    notes = []
    if not use_upstox:
        notes.append(f"Upstox is not connected, so Yahoo 1-minute data was used (limited to the last {YAHOO_MAX_SESSIONS} sessions).")
    if key == "cpr_directional" and not ctx.get("nifty_first5_green"):
        notes.append("Nifty 50 index data was unavailable, so the index-direction filter was not applied.")
    if key == "orb_15min":
        notes.append("Relative volume uses the 20-bar average of 5-minute volume.")
    if len(session_list) < 30:
        notes.append("Fewer than 30 sessions: treat Sharpe / Sortino / Calmar as indicative only.")
    if skipped:
        notes.append(f"{skipped} signal(s) skipped because capital per trade could not buy one share.")
    if missing:
        notes.append(f"No data for: {', '.join(missing)}.")

    return {
        "strategy_key": key, "strategy_name": STRATEGIES[key]["name"], "rules": STRATEGIES[key]["rules"],
        "params": {**p, "symbols": symbols if p.get("symbols") else None},
        "period": {"from": session_list[0].isoformat() if session_list else None,
                   "to": session_list[-1].isoformat() if session_list else None, "sessions": len(session_list)},
        "symbols_tested": len(symbols) - len(missing), "data_sources": sources,
        "setups": setups, "unfilled_setups": unfilled, "metrics": metrics, "trades": trades, "notes": notes,
        "runtime_s": round(time.time() - t0, 1),
    }


# ===========================================================================
# Background jobs (one backtest at a time keeps the free Render instance responsive)
# ===========================================================================
_JOBS = {}
_JOB_POOL = ThreadPoolExecutor(max_workers=1, thread_name_prefix="Backtest")


def submit(strategy_key: str, params: dict, on_done=None) -> str:
    job_id = uuid.uuid4().hex[:12]
    _JOBS[job_id] = {"id": job_id, "status": "QUEUED", "strategy_key": strategy_key, "progress": 0, "total": 0,
                     "result": None, "error": None, "created": time.time()}

    def work():
        job = _JOBS[job_id]
        job["status"] = "RUNNING"

        def prog(d, t):
            job["progress"], job["total"] = d, t
        try:
            res = run_backtest(strategy_key, params, prog)
            job["result"] = res
            if on_done:
                try:
                    job["run_id"] = on_done(res)
                except Exception as e:
                    print(f"[backtest] could not save run: {e}")
            job["status"] = "DONE"
        except Exception as e:
            job["status"], job["error"] = "FAILED", str(e)

    # drop finished jobs older than an hour
    for jid in [j for j, v in _JOBS.items() if time.time() - v["created"] > 3600 and v["status"] in ("DONE", "FAILED")]:
        _JOBS.pop(jid, None)
    _JOB_POOL.submit(work)
    return job_id


def get_job(job_id: str):
    return _JOBS.get(job_id)
