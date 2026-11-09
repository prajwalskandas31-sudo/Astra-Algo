"""Deterministic tests for the ORB engine (no network). Run: backend\\venv\\Scripts\\python -m pytest backend/tests -q"""
import os
import sys
from datetime import date, datetime

import pytz
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")  # never touch the real trading.db

import market_data  # noqa: E402
import strategy  # noqa: E402
import upstox_client  # noqa: E402

IST = pytz.timezone("Asia/Kolkata")
D = date(2026, 11, 6)


def bar(hh, mm, o, h, l, c, d=D):
    t = int(IST.localize(datetime(d.year, d.month, d.day, hh, mm)).timestamp())
    return {"t": t, "o": o, "h": h, "l": l, "c": c, "v": 1000}


# ---------------------------------------------------------------- universe
def test_universe_is_official_nifty50():
    syms = [u["symbol"] for u in strategy.NIFTY_50_UNIVERSE]
    assert len(syms) == 50 and len(set(syms)) == 50
    assert all(u["instrument_key"].startswith("NSE_EQ|INE") for u in strategy.NIFTY_50_UNIVERSE)
    # ISINs that changed after corporate actions must be the current ones
    assert market_data.instrument_key_for("BAJFINANCE") == "NSE_EQ|INE296A01032"
    assert market_data.instrument_key_for("KOTAKBANK") == "NSE_EQ|INE237A01036"
    for gone in ("BPCL", "BRITANNIA", "HEROMOTOCO", "INDUSINDBK", "TATAMOTORS"):
        assert gone not in syms


# ---------------------------------------------------------------- rules
@pytest.mark.parametrize("o,c,pdh,expected", [
    (99, 101, 100, True),     # open below, close above
    (100, 101, 100, False),   # open == PDH is not below
    (101, 102, 100, False),   # gap-up open
    (99, 100, 100, False),    # close == PDH is not above
    (99, 101, None, False),   # missing PDH never qualifies
])
def test_setup_condition(o, c, pdh, expected):
    assert strategy.is_orb_setup(o, c, pdh) is expected


def test_levels_follow_spec_and_tick():
    lv = strategy.compute_levels(1324.4000244, 1317.0, 0.10)   # vendor float noise must not bump the entry a tick
    assert lv == {"entry": 1324.4, "stop_loss": 1317.0, "risk": 7.4, "target": 1339.2, "tick": 0.10}
    lv = strategy.compute_levels(16012.3, 15990.0, 1.0)          # MARUTI-style 1-rupee tick
    assert lv["entry"] == 16013.0 and lv["stop_loss"] == 15990.0 and lv["target"] == 16059.0


def test_round_to_tick():
    r = upstox_client.round_to_tick
    assert r(101.01, 0.05, "up") == 101.05
    assert r(101.04, 0.05, "down") == 101.0
    assert r(101.05, 0.05, "up") == 101.05
    assert r(240.123, 0.01, "nearest") == 240.12


def test_position_size():
    assert strategy.position_size(1000, 5, fixed_qty=1, risk_budget=0, capital_cap=0) == 1
    assert strategy.position_size(1000, 7.4, fixed_qty=1, risk_budget=1000, capital_cap=0) == 135
    assert strategy.position_size(1000, 7.4, fixed_qty=1, risk_budget=1000, capital_cap=50000) == 50
    assert strategy.position_size(1000, 7.4, fixed_qty=1, risk_budget=1, capital_cap=0) == 0


# ---------------------------------------------------------------- simulator
LV = {"entry": 101.0, "stop_loss": 99.0, "target": 105.0, "risk": 2.0}
AFTER_CLOSE = int(IST.localize(datetime(D.year, D.month, D.day, 16, 0)).timestamp())


def sim(bars, now=AFTER_CLOSE):
    return strategy.simulate_trade(LV, bars, D, now_ts=now)


def test_target_hit():
    r = sim([bar(9, 16, 100.5, 101.2, 100.4, 101.1), bar(9, 17, 101.1, 103, 101, 102.8), bar(9, 18, 102.8, 105.3, 102.7, 105)])
    assert r["status"] == "TARGET_HIT" and r["entry_fill_price"] == 101.0 and r["exit_price"] == 105.0


def test_stop_hit():
    r = sim([bar(9, 16, 100.5, 101.5, 100.4, 101.2), bar(9, 17, 101.2, 101.3, 98.8, 99.1)])
    assert r["status"] == "STOP_LOSS_HIT" and r["exit_price"] == 99.0


def test_entry_requires_break_of_high():
    r = sim([bar(9, 16, 100.5, 100.99, 99.5, 100.0), bar(15, 15, 100, 100.2, 99.8, 100)])
    assert r["status"] == "ENTRY_NOT_TRIGGERED" and r["entry_fill_price"] is None


def test_gap_through_entry_fills_at_open():
    r = sim([bar(9, 16, 102.0, 102.5, 101.8, 102.2)], now=None)
    assert r["entry_fill_price"] == 102.0


def test_same_bar_stop_and_target_assumes_stop():
    r = sim([bar(9, 16, 100.5, 101.2, 100.4, 101.1), bar(9, 17, 101.1, 105.5, 98.5, 100)])
    assert r["status"] == "STOP_LOSS_HIT"


def test_gap_down_stop_fills_at_open():
    r = sim([bar(9, 16, 100.5, 101.2, 100.4, 101.1), bar(9, 17, 97.0, 97.5, 96.5, 97.2)])
    assert r["status"] == "STOP_LOSS_HIT" and r["exit_price"] == 97.0


def test_square_off_at_1515():
    r = sim([bar(9, 16, 100.5, 101.2, 100.4, 101.1), bar(14, 0, 102, 103, 101.5, 102.5), bar(15, 15, 102.4, 102.6, 102.2, 102.3)])
    assert r["status"] == "EXITED_EOD" and r["exit_price"] == 102.4


def test_open_trade_mid_session_stays_open():
    mid = int(IST.localize(datetime(D.year, D.month, D.day, 11, 0)).timestamp())
    r = sim([bar(9, 16, 100.5, 101.2, 100.4, 101.1), bar(10, 59, 102, 103, 101.5, 102.5)], now=mid)
    assert r["status"] == "OPEN" and r["ltp"] == 102.5


def test_pnl_and_r_multiple():
    t = {"entry_fill_price": 101.0, "exit_price": 105.0, "quantity": 10, "risk": 2.0}
    assert strategy.trade_pnl(t) == {"pnl": 40.0, "r_multiple": 2.0, "unrealized_pnl": None}


# ---------------------------------------------------------------- data helpers
def test_normalize_minutes_merges_live_bar():
    base = bar(13, 28, 10, 11, 9, 10.5)
    live = {**bar(13, 28, 10.5, 11.5, 10.4, 11.2), "t": base["t"] + 5}
    m = market_data.normalize_minutes([base, live])
    assert len(m) == 1 and m[0]["h"] == 11.5 and m[0]["l"] == 9 and m[0]["c"] == 11.2 and m[0]["o"] == 10


def test_previous_session_high_skips_current_day():
    daily = [bar(9, 15, 0, 120, 0, 0, date(2026, 11, 4)), bar(9, 15, 0, 130, 0, 0, date(2026, 11, 5)), bar(9, 15, 0, 999, 0, 0, D)]
    assert market_data.previous_session_high_from_daily(daily, D) == (130.0, date(2026, 11, 5))
