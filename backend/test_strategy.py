import os
import sys
import time

# Ensure backend imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import strategy

if __name__ == "__main__":
    print("=" * 70)
    print("ASTRA ALGO: VERIFYING 1-MINUTE OPEN RANGE BREAKOUT (ORB) STRATEGY")
    print("=" * 70)
    
    # Stub alert dispatches to prevent network calls during testing
    strategy.send_telegram_alert = lambda msg, triggered_by="system": {"status": "TEST_MOCKED"}
    strategy.send_whatsapp_alert = lambda msg, to_phone=None, triggered_by="system": {"status": "TEST_MOCKED"}
    
    # 0. Verify Universe: Nifty 50 stocks exclusively
    print("\n[STEP 0] Verifying Universe: Nifty 50 stocks exclusively...")
    assert len(strategy.NIFTY_50_UNIVERSE) == 50, f"Universe must be exactly 50 stocks (got {len(strategy.NIFTY_50_UNIVERSE)})"
    assert len(strategy.FO_UNIVERSE) == 50, f"FO_UNIVERSE must be aliased to all 50 Nifty stocks"
    print(f"  -> Total Nifty 50 Instruments: {len(strategy.NIFTY_50_UNIVERSE)}")
    print(f"  -> First 5: {[s['symbol'] for s in strategy.NIFTY_50_UNIVERSE[:5]]}")
    print(f"  -> Last 5: {[s['symbol'] for s in strategy.NIFTY_50_UNIVERSE[-5:]]}")
    
    # 1. Test Phase 1 Market Open Filter (09:15:00 AM IST)
    print("\n[STEP 1] Running Phase 1 Filter at 09:15 AM (Open < Previous Day High)...")
    t0 = time.perf_counter()
    p1_res = strategy.run_phase1_market_open_filter(force_refresh_pdh=False)
    p1_latency = (time.perf_counter() - t0) * 1000
    
    print(f"  -> Execution Latency: {p1_latency:.2f} ms")
    print(f"  -> Total Universe Scanned: {p1_res['total_universe_scanned']}")
    print(f"  -> Tracked Stocks (Open < PDH): {p1_res['tracked_stocks_count']}")
    print(f"  -> Disqualified Stocks (Open >= PDH): {p1_res['disqualified_stocks_count']}")
    
    assert p1_res["total_universe_scanned"] == 50, "All 50 Nifty stocks must be scanned!"
    assert p1_res["tracked_stocks_count"] > 0, "Phase 1 must qualify stocks opening below PDH!"
    assert p1_res["disqualified_stocks_count"] > 0, "Phase 1 must disqualify stocks opening >= PDH!"
    
    for s in p1_res["tracked_stocks"]:
        assert s["open_price"] < s["prev_day_high"], f"Stock {s['symbol']} open ({s['open_price']}) must be < PDH ({s['prev_day_high']})"

    for s in p1_res["disqualified_stocks"]:
        assert s["open_price"] >= s["prev_day_high"], f"Stock {s['symbol']} must have open >= PDH"

    print("  -> Phase 1 Qualification: PASSED (Strict open < PDH condition enforced across Nifty 50)")

    # 2. Test Phase 2 Candle Close Execution (09:16:00 AM IST)
    print("\n[STEP 2] Running Phase 2 at 09:16 AM Candle Close (Tracking ONLY Phase 1 Stocks)...")
    t0 = time.perf_counter()
    p2_res = strategy.run_phase2_candle_close_check()
    p2_latency = (time.perf_counter() - t0) * 1000
    
    print(f"  -> Execution Latency: {p2_latency:.2f} ms")
    print(f"  -> Total Tracked Candidates Scanned: {p2_res['total_tracked_stocks_evaluated']}")
    print(f"  -> Breakouts Confirmed: {p2_res['breakouts_confirmed']}")
    print(f"  -> Orders Executed: {p2_res['orders_executed']}")
    
    # Assert Phase 2 ONLY evaluated stocks that passed Phase 1
    assert p2_res["total_tracked_stocks_evaluated"] == p1_res["tracked_stocks_count"], \
        "Phase 2 must ONLY track candidate stocks that satisfied Phase 1!"

    # 3. Verify Order Parameters for Confirmed Breakouts
    print("\n[STEP 3] Verifying 1-Minute ORB Strategy Rules & Target Calculation...")
    assert len(p2_res["breakout_stocks"]) > 0, "Should detect confirmed breakouts in test simulation"
    for bk in p2_res["breakout_stocks"]:
        c = bk.get("candle") or bk.get("candle_915") or {}
        sym = bk["symbol"]
        high = c["high"]
        low = c["low"]
        expected_risk_R = round(high - low, 2)
        expected_target = round(high + (2 * expected_risk_R), 2)
        
        print(f"  -> Checking {sym}:")
        print(f"     - 09:15 Candle: Open Rs.{c['open']} | High Rs.{high} | Low Rs.{low} | Close Rs.{c['close']} (PDH Rs.{bk['prev_day_high']})")
        print(f"     - Entry Order Level: Rs.{bk['entry_order_level']} (Expected 9:15 High: Rs.{high})")
        print(f"     - Stop Loss (SL) Level: Rs.{bk['stop_loss_level']} (Expected 9:15 Low: Rs.{low})")
        print(f"     - Risk Range (R = High - Low): Rs.{expected_risk_R}")
        print(f"     - Profit Target (Entry + 2xR [1:2 R:R]): Rs.{bk['take_profit_level']} (Expected: Rs.{expected_target})")
        
        # Verify exact mathematical rules:
        # Qualifying Condition: open < PDH and close > PDH
        assert c['open'] < bk['prev_day_high'], f"Open must be < PDH for breakout stock {sym}"
        assert c['close'] > bk['prev_day_high'], f"Close must be > PDH for breakout stock {sym}"
        # Entry: Buy order at High of 9:15 candle (triggers on break above high)
        assert bk["entry_order_level"] == high, f"Entry must be at High of 9:15 candle ({high})"
        # Stop Loss: Low of 9:15 candle
        assert bk["stop_loss_level"] == low, f"Stop Loss must be at Low of 9:15 candle ({low})"
        # Risk Range R: High - Low
        assert round(bk.get("risk_range_R") or bk["risk_per_share"], 2) == expected_risk_R, f"Risk Range R must be High - Low ({expected_risk_R})"
        # Profit Target: 2xR above entry (1:2 R:R)
        assert bk["take_profit_level"] == expected_target, f"Target must be Entry + 2 * R ({expected_target})"
        assert bk["order_execution"] is not None, "Order execution record must exist"
        ord_status = bk["order_execution"].get("status") or bk["order_execution"].get("broker_status")
        print(f"     [ORDER CONFIRMED] Status: {ord_status} | Order ID: {bk['order_execution']['order_id']}")

    # 4. Benchmark Full Pipeline Speed Across All 50 Stocks
    print("\n[STEP 4] Benchmarking Full Pipeline Execution Speed (50 Stocks)...")
    t0 = time.perf_counter()
    pipeline_res = strategy.run_strategy_pipeline()
    total_speed_ms = (time.perf_counter() - t0) * 1000
    print(f"  -> Total Two-Stage Pipeline Speed (50 Nifty Stocks): {total_speed_ms:.2f} ms")
    assert total_speed_ms < 50.0, f"Execution speed must be sub-50ms (got {total_speed_ms:.2f}ms)"
    print("  -> Speed Benchmark: PASSED (< 50ms institutional execution speed!)")
    
    print("\n" + "=" * 70)
    print("ALL TESTS PASSED SUCCESSFULLY! 1-MINUTE ORB STRATEGY VERIFIED!")
    print("=" * 70)


