"""Deterministic backtest-engine tests (no network). Run: backend\\venv\\Scripts\\python -m pytest backend/tests -q"""
import os
import sys
from datetime import date, datetime

import pytest
import pytz

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite://")

import backtest  # noqa: E402
import market_data  # noqa: E402
import upstox_client  # noqa: E402

IST = pytz.timezone("Asia/Kolkata")
D0, D1 = date(2026, 11, 5), date(2026, 11, 6)


def ts(d, hh, mm):
    return int(IST.localize(datetime(d.year, d.month, d.day, hh, mm)).timestamp())


def bar(d, hh, mm, o, h, l, c, v=1000):
    return {"t": ts(d, hh, mm), "o": o, "h": h, "l": l, "c": c, "v": v}


def flat_day(d, price=100.0, until=(15, 29)):
    out, hh, mm = [], 9, 15
    while (hh, mm) <= until:
        out.append(bar(d, hh, mm, price, price + 0.05, price - 0.05, price))
        mm += 1
        if mm == 60:
            hh, mm = hh + 1, 0
    return out


# ---------------------------------------------------------------- indicators
def test_resample_anchors_at_0915_and_aggregates():
    bars = [bar(D1, 9, 15, 10, 11, 9, 10.5, 100), bar(D1, 9, 16, 10.5, 12, 10, 11, 50),
            bar(D1, 9, 19, 11, 11.5, 8, 9, 10), bar(D1, 9, 20, 9, 9.5, 8.5, 9.2, 5)]
    r = backtest.resample(bars, 5)
    assert len(r) == 2
    assert r[0] == {"t": ts(D1, 9, 15), "tc": ts(D1, 9, 20), "o": 10, "h": 12, "l": 8, "c": 9, "v": 160}
    assert r[1]["t"] == ts(D1, 9, 20) and r[1]["c"] == 9.2


def test_ema_and_sma():
    assert backtest.ema([1, 1, 1], 3) == [1, 1, 1]
    e = backtest.ema([10, 20], 3)              # k = 0.5
    assert e == [10, 15]
    assert backtest.sma([1, 2, 3, 4], 2) == [None, 1.5, 2.5, 3.5]


def test_rsi_extremes():
    up = backtest.rsi([float(i) for i in range(30)], 14)
    dn = backtest.rsi([float(30 - i) for i in range(30)], 14)
    assert up[-1] == 100.0 and dn[-1] == pytest.approx(0.0)
    assert up[13] is None and up[14] is not None


def test_supertrend_flips_with_trend():
    bars = []
    p = 100.0
    for i in range(40):                       # strong up-trend then strong down-trend
        p += 1 if i < 20 else -2
        bars.append({"t": i, "o": p, "h": p + 0.5, "l": p - 0.5, "c": p, "v": 1})
    st = backtest.supertrend(bars, 7, 3)
    assert st[19][1] == 1 and st[-1][1] == -1


def test_cpr_levels():
    lv = backtest.cpr_levels(110, 90, 100)
    assert lv["p"] == pytest.approx(100) and lv["bc"] == pytest.approx(100) and lv["tc"] == pytest.approx(100)
    assert lv["r1"] == pytest.approx(110) and lv["r2"] == pytest.approx(120) and lv["width_pct"] == pytest.approx(0)


# ---------------------------------------------------------------- costs / fills
def test_intraday_charges_round_trip():
    buy = backtest.intraday_charges(1000, 100, "buy")      # turnover 1,00,000
    sell = backtest.intraday_charges(1000, 100, "sell")
    # brokerage capped at 20; STT only on sell (25); stamp only on buy (3)
    assert buy == pytest.approx(20 + 2.97 + 0.1 + 0.18 * (20 + 2.97 + 0.1) + 3, abs=0.01)
    assert sell - buy == pytest.approx(25 - 3, abs=0.01)


def test_manage_long_stop_first_when_bar_hits_both():
    bars = [bar(D1, 10, 0, 100, 100.5, 99.5, 100), bar(D1, 10, 1, 100, 106, 94, 100)]
    ex = backtest.manage_long(bars, 0, 100, 95, 105, ts(D1, 15, 15))
    assert ex["reason"] == "STOP" and ex["exit"] == 95


def test_manage_long_gap_fills_and_signal_exit():
    bars = [bar(D1, 10, 0, 100, 100.5, 99.5, 100), bar(D1, 10, 1, 108, 109, 107, 108)]
    ex = backtest.manage_long(bars, 0, 100, 95, 105, ts(D1, 15, 15))
    assert ex["reason"] == "TARGET" and ex["exit"] == 108          # gap through target fills at the open
    ex = backtest.manage_long(bars, 0, 100, 95, None, ts(D1, 15, 15), exit_signals=[ts(D1, 10, 1)])
    assert ex["reason"] == "SIGNAL" and ex["exit"] == 108


def test_manage_long_trailing_stop_and_eod():
    bars = [bar(D1, 15, 10, 100, 101, 99.9, 100), bar(D1, 15, 11, 100, 100, 98.9, 99), bar(D1, 15, 15, 99, 99, 99, 99)]
    ex = backtest.manage_long(bars, 0, 100, 90, None, ts(D1, 15, 15), stop_updates=[(ts(D1, 15, 11), 99.0)])
    assert ex["reason"] == "STOP" and ex["exit"] == 99.0
    ex = backtest.manage_long(bars, 0, 100, 90, None, ts(D1, 15, 15))
    assert ex["reason"] == "EOD" and ex["exit_t"] == ts(D1, 15, 15)


# ---------------------------------------------------------------- full run (ORB on synthetic history)
def _orb_history():
    d0 = flat_day(D0, 100.0)
    d1 = flat_day(D1, 100.0)
    # 09:15 opens below PDH (100.05) and closes above it; high 101, low 99.5 -> entry 101, stop 99.5, target 104
    d1[0] = bar(D1, 9, 15, 99.8, 101.0, 99.5, 100.6)
    d1[1] = bar(D1, 9, 16, 100.6, 101.2, 100.5, 101.1)      # entry fills at 101
    d1[2] = bar(D1, 9, 17, 101.1, 104.5, 101.0, 104.2)      # target 104
    daily = [{"t": ts(D0, 9, 15), "o": 100, "h": 100.05, "l": 99.95, "c": 100, "v": 1}]
    return d0 + d1, daily


def test_full_orb_backtest_matches_live_rules(monkeypatch):
    minutes, daily = _orb_history()
    monkeypatch.setattr(upstox_client, "is_token_active", lambda: False)
    monkeypatch.setattr(upstox_client, "tick_size", lambda key, price: 0.05)
    monkeypatch.setattr(backtest, "load_history",
                        lambda sym, n, up: {"symbol": sym, "source": "YAHOO", "minutes": minutes if sym == "RELIANCE" else [], "daily": daily})
    res = backtest.run_backtest("open_range_breakout", {"sessions": 2, "symbols": ["RELIANCE"], "capital_per_trade": 10100,
                                                         "include_costs": False, "slippage_bps": 0, "starting_capital": 100000})
    assert res["period"] == {"from": "2026-11-05", "to": "2026-11-06", "sessions": 2}
    assert res["setups"] == 1 and res["metrics"]["trades"] == 1
    t = res["trades"][0]
    assert (t["entry"], t["stop"], t["target"], t["exit"], t["reason"], t["qty"]) == (101.0, 99.5, 104.0, 104.0, "TARGET", 100)
    assert t["net_pnl"] == 300.0 and t["r_multiple"] == 2.0
    m = res["metrics"]
    assert m["win_rate"] == 100.0 and m["net_pnl"] == 300.0 and m["max_drawdown"] == 0
    assert [p["pnl"] for p in m["equity_curve"]] == [0.0, 300.0]


def test_costs_and_slippage_reduce_pnl(monkeypatch):
    minutes, daily = _orb_history()
    monkeypatch.setattr(upstox_client, "is_token_active", lambda: False)
    monkeypatch.setattr(upstox_client, "tick_size", lambda key, price: 0.05)
    monkeypatch.setattr(backtest, "load_history", lambda sym, n, up: {"symbol": sym, "source": "YAHOO", "minutes": minutes, "daily": daily})
    res = backtest.run_backtest("open_range_breakout", {"sessions": 2, "symbols": ["RELIANCE"], "capital_per_trade": 10200,
                                                         "include_costs": True, "slippage_bps": 5, "starting_capital": 100000})
    t = res["trades"][0]
    assert t["charges"] > 0 and t["net_pnl"] < t["gross_pnl"] < 300


def test_unknown_strategy_rejected():
    with pytest.raises(ValueError):
        backtest.run_backtest("my_free_text_strategy", {})
    assert backtest.resolve_key("opening_high_breakout") == "open_range_breakout"


def test_metrics_drawdown_and_streaks():
    trades = [{"date": "2026-11-05", "entry_t": 1, "net_pnl": 100, "gross_pnl": 100, "charges": 0, "r_multiple": 1, "return_pct": 1, "symbol": "A", "reason": "TARGET"},
              {"date": "2026-11-06", "entry_t": 2, "net_pnl": -300, "gross_pnl": -300, "charges": 0, "r_multiple": -1, "return_pct": -3, "symbol": "B", "reason": "STOP"},
              {"date": "2026-11-06", "entry_t": 3, "net_pnl": -100, "gross_pnl": -100, "charges": 0, "r_multiple": -1, "return_pct": -1, "symbol": "B", "reason": "STOP"}]
    m = backtest.compute_metrics(trades, ["2026-11-05", "2026-11-06"], 10000)
    assert m["trades"] == 3 and m["wins"] == 1 and m["win_rate"] == pytest.approx(33.3)
    assert m["profit_factor"] == 0.25 and m["max_drawdown"] == 400 and m["max_drawdown_pct"] == 4.0
    assert m["max_consecutive_losses"] == 2 and m["best_symbol"] == "A" and m["worst_symbol"] == "B"


def test_square_off_uses_last_price_when_vendor_skips_1515():
    bars = [bar(D1, 15, 13, 100, 100.2, 99.9, 100.1), bar(D1, 15, 14, 100.1, 100.4, 100, 100.3),
            bar(D1, 15, 29, 101, 101, 101, 101)]
    ex = backtest.manage_long(bars, 0, 100, 90, None, ts(D1, 15, 15))
    assert ex == {"exit": 100.3, "exit_t": ts(D1, 15, 15), "reason": "EOD"}
