import os
import sys
import time

# Ensure backend imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import strategy

if __name__ == "__main__":
    print("=" * 70)
    print("ASTRA ALGO: VERIFYING TWO-STAGE STRATEGY & HIGH-SPEED ENGINE")
    print("=" * 70)
    
    # 1. Test Phase 1 Market Open Filter (09:15:00 AM IST)
    print("\n[STEP 1] Running Phase 1 Filter at 09:15 AM (Open < Previous Day High)...")
    t0 = time.perf_counter()
    p1_res = strategy.run_phase1_market_open_filter(force_refresh_pdh=False)
    p1_latency = (time.perf_counter() - t0) * 1000
    
    print(f"  -> Execution Latency: {p1_latency:.2f} ms")
    print(f"  -> Tracked Stocks (Open < PDH): {p1_res['tracked_stocks_count']}")
    print(f"  -> Disqualified Stocks (Open >= PDH): {p1_res['disqualified_stocks_count']}")
    
    assert p1_res["tracked_stocks_count"] > 0, "Phase 1 must qualify stocks opening below PDH!"
    for s in p1_res["tracked_stocks"]:
        assert s["open_price"] < s["prev_day_high"], f"Stock {s['symbol']} open ({s['open_price']}) must be < PDH ({s['prev_day_high']})"
        print(f"     [QUALIFIED] {s['symbol']}: Open Rs.{s['open_price']} < PDH Rs.{s['prev_day_high']}")

    for s in p1_res["disqualified_stocks"]:
        assert s["open_price"] >= s["prev_day_high"], f"Stock {s['symbol']} must have open >= PDH"
        print(f"     [DISQUALIFIED] {s['symbol']}: Open Rs.{s['open_price']} >= PDH Rs.{s['prev_day_high']}")

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
    print("\n[STEP 3] Verifying Order Execution Parameters...")
    assert len(p2_res["breakout_stocks"]) > 0, "Should detect confirmed breakouts in test simulation"
    for bk in p2_res["breakout_stocks"]:
        c = bk.get("candle") or bk.get("candle_915") or {}
        sym = bk["symbol"]
        high = c["high"]
        low = c["low"]
        expected_risk = round(high - low, 2)
        expected_target = round(high + (2 * expected_risk), 2)

        
        print(f"  -> Checking {sym}:")
        print(f"     - 09:15 Candle: Open Rs.{c['open']} | High Rs.{high} | Low Rs.{low} | Close Rs.{c['close']} (PDH Rs.{bk['prev_day_high']})")
        print(f"     - Entry Order Level: Rs.{bk['entry_order_level']} (Expected High: Rs.{high})")
        print(f"     - Stop Loss Level: Rs.{bk['stop_loss_level']} (Expected Low: Rs.{low})")
        print(f"     - Risk per share: Rs.{bk['risk_per_share']} (High - Low = Rs.{expected_risk})")
        print(f"     - Target Level (2x Risk): Rs.{bk['take_profit_level']} (Expected: Rs.{expected_target})")
        
        # Verify exact mathematical rules
        assert bk["entry_order_level"] == high, f"Entry must be at High of 9:15 candle ({high})"
        assert bk["stop_loss_level"] == low, f"Stop Loss must be at Low of 9:15 candle ({low})"
        assert bk["risk_per_share"] == expected_risk, f"Risk must be High - Low ({expected_risk})"
        assert bk["take_profit_level"] == expected_target, f"Target must be Entry + 2 * (High - Low) ({expected_target})"
        assert bk["order_execution"] is not None, "Order execution record must exist"
        ord_status = bk["order_execution"].get("status") or bk["order_execution"].get("broker_status")
        print(f"     [ORDER CONFIRMED] Status: {ord_status} | Order ID: {bk['order_execution']['order_id']}")

    # 4. Benchmark Full Pipeline Speed
    print("\n[STEP 4] Benchmarking Full Pipeline Execution Speed...")
    t0 = time.perf_counter()
    pipeline_res = strategy.run_strategy_pipeline()
    total_speed_ms = (time.perf_counter() - t0) * 1000
    print(f"  -> Total Two-Stage Pipeline Speed: {total_speed_ms:.2f} ms")
    assert total_speed_ms < 50.0, f"Execution speed must be sub-50ms (got {total_speed_ms:.2f}ms)"
    print("  -> Speed Benchmark: PASSED (< 50ms institutional execution speed!)")
    
    print("\n" + "=" * 70)
    print("ALL TESTS PASSED SUCCESSFULLY! STRATEGY LOGIC & SPEED VERIFIED!")
    print("=" * 70)


