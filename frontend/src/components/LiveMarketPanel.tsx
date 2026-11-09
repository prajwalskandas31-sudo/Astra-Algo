// Client component by inheritance: only imported from the 'use client' page.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type SeriesMarker,
  type UTCTimestamp,
} from 'lightweight-charts';

// Chart axis shows IST: lightweight-charts renders UTC, so shift epoch seconds by +5:30.
const IST_OFFSET = 19800;
const CHART_POLL_MS = 3000;
const WATCHLIST_POLL_MS = 10000;

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

type Trade = {
  symbol: string;
  mode: string;
  status: string;
  quantity: number;
  entry: number;
  stop_loss: number;
  target: number;
  risk: number;
  entry_fill_price: number | null;
  entry_time: string | null;
  exit_price: number | null;
  exit_time: string | null;
  pnl: number | null;
  r_multiple: number | null;
  unrealized_pnl: number | null;
  ltp: number | null;
  session_date: string;
};

type CandlesResponse = {
  symbol: string;
  source: string | null;
  candles: Candle[];
  last_price: number | null;
  last_bar_time: number | null;
  server_time: number;
  overlays: {
    pdh: number | null;
    pdh_date: string | null;
    orb_candle: Candle | null;
    trade: Trade | null;
    session_date: string | null;
  };
};

type WatchRow = {
  symbol: string;
  sector: string;
  ltp: number | null;
  change_pct: number | null;
  prev_high: number | null;
  pct_from_pdh: number | null;
  above_pdh: boolean;
  phase1_status: string | null;
  trade_status: string | null;
  source: string | null;
};

type TradesResponse = {
  session_date: string | null;
  trading_mode: string;
  trades: Trade[];
  realized_pnl: number;
  unrealized_pnl: number;
  wins: number;
  losses: number;
};

const C = {
  up: '#10b981',
  down: '#f43f5e',
  pdh: '#f59e0b',
  entry: '#4facfe',
  stop: '#f43f5e',
  target: '#10b981',
  fill: '#e2e8f0',
  grid: 'rgba(255,255,255,0.04)',
  text: '#94a3b8',
};

const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? '–' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

const statusColor = (s?: string | null) => {
  if (!s) return 'var(--text-dim)';
  if (s === 'TARGET_HIT') return 'var(--accent-green)';
  if (s === 'STOP_LOSS_HIT' || s === 'ENTRY_REJECTED') return 'var(--accent-red)';
  if (s === 'OPEN') return 'var(--accent-cyan)';
  if (s === 'PENDING_ENTRY') return 'var(--accent-amber)';
  return 'var(--text-muted)';
};

function hhmmToTs(sessionDate: string, hhmm: string | null): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [y, m, d] = sessionDate.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) / 1000 - IST_OFFSET;
}

function marketIsOpen(): boolean {
  const now = new Date(Date.now() + IST_OFFSET * 1000);
  const day = now.getUTCDay();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return day >= 1 && day <= 5 && mins >= 555 && mins <= 930;
}

function usePageVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------
export function LiveChart({
  apiBase,
  token,
  symbol,
  height = 460,
  onUnauthorized,
}: {
  apiBase: string;
  token: string;
  symbol: string;
  height?: number;
  onUnauthorized?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const lastKeyRef = useRef<string>('');
  const lastTRef = useRef<number>(0);
  const [sessions, setSessions] = useState<1 | 5>(1);
  const [data, setData] = useState<CandlesResponse | null>(null);
  const [err, setErr] = useState<string>('');
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const visible = usePageVisible();

  // Create the chart once
  useEffect(() => {
    if (!boxRef.current) return;
    const chart = createChart(boxRef.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: C.text, fontFamily: 'JetBrains Mono, monospace' },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true, secondsVisible: false, rightOffset: 4 },
    });
    const candles = chart.addCandlestickSeries({
      upColor: C.up, downColor: C.down, borderUpColor: C.up, borderDownColor: C.down, wickUpColor: C.up, wickDownColor: C.down,
    });
    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chartRef.current = chart;
    candleRef.current = candles;
    volRef.current = vol;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/market/candles?symbol=${encodeURIComponent(symbol)}&sessions=${sessions}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
      const body: CandlesResponse = await res.json();
      setData(body);
      setErr('');
      setUpdatedAt(Date.now());
    } catch (e: any) {
      setErr(e?.message || 'Failed to load candles');
    }
  }, [apiBase, token, symbol, sessions, onUnauthorized]);

  // Poll (paused while the tab is hidden or the market is closed after the first load)
  useEffect(() => {
    lastKeyRef.current = '';
    load();
    if (!visible) return;
    const id = setInterval(() => {
      if (marketIsOpen()) load();
    }, CHART_POLL_MS);
    return () => clearInterval(id);
  }, [load, visible]);

  // Push data into the chart: full reset on symbol/range change, incremental updates otherwise
  useEffect(() => {
    const cs = candleRef.current, vs = volRef.current, chart = chartRef.current;
    if (!cs || !vs || !chart || !data) return;
    const key = `${data.symbol}|${sessions}`;
    const toBar = (c: Candle) => ({ time: (c.t + IST_OFFSET) as UTCTimestamp, open: c.o, high: c.h, low: c.l, close: c.c });
    const toVol = (c: Candle) => ({
      time: (c.t + IST_OFFSET) as UTCTimestamp, value: c.v,
      color: c.c >= c.o ? 'rgba(16,185,129,0.35)' : 'rgba(244,63,94,0.35)',
    });
    if (key !== lastKeyRef.current) {
      cs.setData(data.candles.map(toBar));
      vs.setData(data.candles.map(toVol));
      chart.timeScale().fitContent();
      lastKeyRef.current = key;
    } else {
      for (const c of data.candles) {
        if (c.t >= lastTRef.current) {
          cs.update(toBar(c));
          vs.update(toVol(c));
        }
      }
    }
    lastTRef.current = data.candles.length ? data.candles[data.candles.length - 1].t : 0;

    // Strategy levels
    linesRef.current.forEach((l) => cs.removePriceLine(l));
    linesRef.current = [];
    const add = (price: number | null | undefined, color: string, title: string, style = LineStyle.Dashed) => {
      if (price === null || price === undefined) return;
      linesRef.current.push(cs.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
    };
    const ov = data.overlays;
    add(ov.pdh, C.pdh, 'PDH');
    const t = ov.trade;
    if (t) {
      add(t.entry, C.entry, 'ENTRY', LineStyle.Solid);
      add(t.stop_loss, C.stop, 'SL', LineStyle.Solid);
      add(t.target, C.target, 'TARGET (2R)', LineStyle.Solid);
    } else if (ov.orb_candle) {
      add(ov.orb_candle.h, C.entry, '09:15 H', LineStyle.Dotted);
      add(ov.orb_candle.l, C.stop, '09:15 L', LineStyle.Dotted);
    }

    // Markers: the 09:15 ORB candle + trade entry / exit
    const markers: SeriesMarker<UTCTimestamp>[] = [];
    if (ov.orb_candle) {
      markers.push({ time: (ov.orb_candle.t + IST_OFFSET) as UTCTimestamp, position: 'aboveBar', color: C.pdh, shape: 'circle', text: 'ORB' });
    }
    if (t && ov.session_date) {
      const et = hhmmToTs(ov.session_date, t.entry_time);
      if (et && t.entry_fill_price) markers.push({ time: (et + IST_OFFSET) as UTCTimestamp, position: 'belowBar', color: C.entry, shape: 'arrowUp', text: `BUY ${fmt(t.entry_fill_price)}` });
      const xt = hhmmToTs(ov.session_date, t.exit_time);
      if (xt && t.exit_price) {
        const win = (t.pnl ?? 0) >= 0;
        markers.push({ time: (xt + IST_OFFSET) as UTCTimestamp, position: 'aboveBar', color: win ? C.target : C.stop, shape: 'arrowDown', text: `${t.status.replace(/_/g, ' ')} ${fmt(t.exit_price)}` });
      }
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    cs.setMarkers(markers);
  }, [data, sessions]);

  const last = data?.candles?.[data.candles.length - 1];
  const first = data?.candles?.[0];
  const barAgeSec = data?.last_bar_time ? Math.max(0, Math.round(Date.now() / 1000 - data.last_bar_time)) : null;
  const live = marketIsOpen() && barAgeSec !== null && barAgeSec < 150;
  const ov = data?.overlays;
  const tr = ov?.trade;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.7rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>{symbol}</span>
          <span className="mono" style={{ fontSize: '1.15rem', fontWeight: 700, color: last && first && last.c >= first.o ? C.up : C.down }}>
            ₹{fmt(data?.last_price)}
          </span>
          <span
            title={data?.source === 'YAHOO' ? 'Upstox token not active: public Yahoo Finance feed (real-time NSE bars)' : 'Upstox broker feed'}
            style={{
              fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.5px', padding: '0.15rem 0.45rem', borderRadius: '4px',
              background: data?.source === 'UPSTOX' ? 'var(--accent-green-bg)' : 'var(--accent-amber-bg)',
              color: data?.source === 'UPSTOX' ? 'var(--accent-green)' : 'var(--accent-amber)',
            }}
          >
            {data?.source ?? 'NO DATA'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: live ? 'var(--accent-green)' : 'var(--text-dim)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: live ? 'var(--accent-green)' : 'var(--text-dim)', animation: live ? 'pulseGlow 1.6s infinite' : undefined }} />
            {live ? 'LIVE' : marketIsOpen() ? 'DELAYED' : 'MARKET CLOSED'}
            {barAgeSec !== null && <span className="mono" style={{ color: 'var(--text-dim)' }}>· last bar {barAgeSec < 120 ? `${barAgeSec}s` : `${Math.round(barAgeSec / 60)}m`} ago</span>}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {([1, 5] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSessions(s)}
              style={{
                fontSize: '0.72rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: '6px', cursor: 'pointer',
                border: '1px solid var(--border-subtle)',
                background: sessions === s ? 'rgba(0,242,254,0.12)' : 'transparent',
                color: sessions === s ? 'var(--accent-cyan)' : 'var(--text-muted)',
              }}
            >
              {s === 1 ? '1D · 1m' : '5D · 1m'}
            </button>
          ))}
        </div>
      </div>

      <div ref={boxRef} style={{ height, width: '100%', position: 'relative' }}>
        {err && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-red)', fontSize: '0.8rem', zIndex: 2 }}>
            {err}
          </div>
        )}
        {!err && data && data.candles.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '0.8rem', zIndex: 2 }}>
            No candles available for {symbol}
          </div>
        )}
      </div>

      {/* Level legend: everything the strategy used, so a signal can be verified by eye */}
      <div className="mono" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        <span><b style={{ color: C.pdh }}>PDH</b> {fmt(ov?.pdh)} {ov?.pdh_date && <span style={{ color: 'var(--text-dim)' }}>({ov.pdh_date})</span>}</span>
        {ov?.orb_candle && (
          <span>
            <b style={{ color: C.pdh }}>09:15</b> O {fmt(ov.orb_candle.o)} H {fmt(ov.orb_candle.h)} L {fmt(ov.orb_candle.l)} C {fmt(ov.orb_candle.c)}{' '}
            {ov.pdh !== null && (
              <b style={{ color: ov.orb_candle.o < ov.pdh && ov.orb_candle.c > ov.pdh ? C.up : 'var(--text-dim)' }}>
                {ov.orb_candle.o < ov.pdh && ov.orb_candle.c > ov.pdh ? '✓ SETUP (O<PDH<C)' : '✗ no setup'}
              </b>
            )}
          </span>
        )}
        {tr && (
          <>
            <span><b style={{ color: C.entry }}>ENTRY</b> {fmt(tr.entry)}</span>
            <span><b style={{ color: C.stop }}>SL</b> {fmt(tr.stop_loss)}</span>
            <span><b style={{ color: C.target }}>TGT</b> {fmt(tr.target)}</span>
            <span>
              <b style={{ color: statusColor(tr.status) }}>{tr.status.replace(/_/g, ' ')}</b> ({tr.mode}, qty {tr.quantity})
              {tr.pnl !== null && <b style={{ color: tr.pnl >= 0 ? C.up : C.down }}> P&L ₹{fmt(tr.pnl)} ({tr.r_multiple}R)</b>}
              {tr.pnl === null && tr.unrealized_pnl !== null && <b style={{ color: tr.unrealized_pnl >= 0 ? C.up : C.down }}> MTM ₹{fmt(tr.unrealized_pnl)}</b>}
            </span>
          </>
        )}
        {updatedAt > 0 && <span style={{ marginLeft: 'auto', color: 'var(--text-dim)' }}>updated {new Date(updatedAt).toLocaleTimeString('en-IN', { hour12: false })}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Watchlist + trades + chart, side by side
// ---------------------------------------------------------------------------
export default function LiveMarketPanel({
  apiBase,
  token,
  symbol,
  onSymbolChange,
  chartHeight = 460,
  onUnauthorized,
}: {
  apiBase: string;
  token: string;
  symbol: string;
  onSymbolChange: (s: string) => void;
  chartHeight?: number;
  onUnauthorized?: () => void;
}) {
  const [rows, setRows] = useState<WatchRow[]>([]);
  const [session, setSession] = useState<string>('');
  const [trades, setTrades] = useState<TradesResponse | null>(null);
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<'pct_from_pdh' | 'change_pct' | 'symbol'>('pct_from_pdh');
  const visible = usePageVisible();

  const load = useCallback(async () => {
    const h = { Authorization: `Bearer ${token}` };
    try {
      const [w, t] = await Promise.all([fetch(`${apiBase}/market/watchlist`, { headers: h }), fetch(`${apiBase}/strategy/trades`, { headers: h })]);
      if (w.status === 401 || t.status === 401) return onUnauthorized?.();
      if (w.ok) {
        const body = await w.json();
        setRows(body.rows);
        setSession(body.session_date);
      }
      if (t.ok) setTrades(await t.json());
    } catch {
      /* transient network errors: keep last good data */
    }
  }, [apiBase, token, onUnauthorized]);

  useEffect(() => {
    load();
    if (!visible) return;
    const id = setInterval(() => {
      if (marketIsOpen()) load();
    }, WATCHLIST_POLL_MS);
    return () => clearInterval(id);
  }, [load, visible]);

  const shown = useMemo(() => {
    const f = filter.trim().toUpperCase();
    const list = rows.filter((r) => !f || r.symbol.includes(f));
    return [...list].sort((a, b) => {
      if (sortKey === 'symbol') return a.symbol.localeCompare(b.symbol);
      return (b[sortKey] ?? -999) - (a[sortKey] ?? -999);
    });
  }, [rows, filter, sortKey]);

  const th: React.CSSProperties = { padding: '0.45rem 0.5rem', cursor: 'pointer', whiteSpace: 'nowrap' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: '1rem', alignItems: 'start' }} className="live-market-grid">
      {/* Left: watchlist */}
      <div className="glass-panel" style={{ padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: chartHeight + 260, minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>Nifty 50 · Live vs PDH</h3>
          <span className="mono" style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>session {session || '–'}</span>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter symbol…"
          style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '0.4rem 0.6rem', color: '#fff', fontSize: '0.8rem' }}
        />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'rgba(12,16,26,0.98)', zIndex: 1 }}>
              <tr style={{ color: 'var(--text-dim)', textAlign: 'left', fontSize: '0.66rem', textTransform: 'uppercase' }}>
                <th style={th} onClick={() => setSortKey('symbol')}>Symbol</th>
                <th style={{ ...th, textAlign: 'right' }}>LTP</th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => setSortKey('change_pct')}>Chg%{sortKey === 'change_pct' ? ' ▾' : ''}</th>
                <th style={{ ...th, textAlign: 'right' }} onClick={() => setSortKey('pct_from_pdh')}>vs PDH{sortKey === 'pct_from_pdh' ? ' ▾' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.symbol}
                  onClick={() => onSymbolChange(r.symbol)}
                  style={{
                    cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)',
                    background: r.symbol === symbol ? 'rgba(0,242,254,0.08)' : undefined,
                  }}
                >
                  <td style={{ padding: '0.4rem 0.5rem', fontWeight: 700, color: '#fff' }}>
                    {r.symbol}
                    {r.trade_status && (
                      <span style={{ marginLeft: 6, fontSize: '0.6rem', fontWeight: 800, color: statusColor(r.trade_status) }}>● {r.trade_status.replace(/_/g, ' ')}</span>
                    )}
                  </td>
                  <td className="mono" style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#e2e8f0' }}>{fmt(r.ltp)}</td>
                  <td className="mono" style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: (r.change_pct ?? 0) >= 0 ? C.up : C.down }}>
                    {r.change_pct === null ? '–' : `${r.change_pct > 0 ? '+' : ''}${r.change_pct.toFixed(2)}`}
                  </td>
                  <td className="mono" style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: r.above_pdh ? C.pdh : 'var(--text-muted)', fontWeight: r.above_pdh ? 700 : 400 }}>
                    {r.pct_from_pdh === null ? '–' : `${r.pct_from_pdh > 0 ? '+' : ''}${r.pct_from_pdh.toFixed(2)}%`}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-dim)' }}>Loading live quotes…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right: chart + session trades */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
        <div className="glass-panel" style={{ padding: '1rem' }}>
          <LiveChart apiBase={apiBase} token={token} symbol={symbol} height={chartHeight} onUnauthorized={onUnauthorized} />
        </div>

        <div className="glass-panel" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
              Session trades {trades?.session_date ? `· ${trades.session_date}` : ''}
              <span style={{ marginLeft: 8, fontSize: '0.65rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: 4, background: trades?.trading_mode === 'live' ? 'var(--accent-red-bg)' : 'var(--accent-amber-bg)', color: trades?.trading_mode === 'live' ? 'var(--accent-red)' : 'var(--accent-amber)' }}>
                {(trades?.trading_mode || 'paper').toUpperCase()} MODE
              </span>
            </h3>
            {trades && (
              <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Realized <b style={{ color: trades.realized_pnl >= 0 ? C.up : C.down }}>₹{fmt(trades.realized_pnl)}</b> · MTM{' '}
                <b style={{ color: trades.unrealized_pnl >= 0 ? C.up : C.down }}>₹{fmt(trades.unrealized_pnl)}</b> · W/L {trades.wins}/{trades.losses}
                <span style={{ color: 'var(--text-dim)' }}> (before charges)</span>
              </span>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-dim)', textAlign: 'left', fontSize: '0.66rem', textTransform: 'uppercase', borderBottom: '1px solid var(--border-subtle)' }}>
                  {['Symbol', 'Mode', 'Qty', 'Entry', 'SL', 'Target', 'Fill', 'Exit', 'Status', 'P&L'].map((h) => (
                    <th key={h} style={{ padding: '0.45rem 0.5rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(trades?.trades || []).map((t) => (
                  <tr key={`${t.session_date}-${t.symbol}`} onClick={() => onSymbolChange(t.symbol)} style={{ cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '0.45rem 0.5rem', fontWeight: 800, color: '#fff' }}>{t.symbol}</td>
                    <td style={{ padding: '0.45rem 0.5rem', color: t.mode === 'LIVE' ? 'var(--accent-red)' : 'var(--text-muted)', fontWeight: 700 }}>{t.mode}</td>
                    <td className="mono" style={{ padding: '0.45rem 0.5rem' }}>{t.quantity}</td>
                    <td className="mono" style={{ padding: '0.45rem 0.5rem', color: C.entry }}>{fmt(t.entry)}</td>
                    <td className="mono" style={{ padding: '0.45rem 0.5rem', color: C.stop }}>{fmt(t.stop_loss)}</td>
                    <td className="mono" style={{ padding: '0.45rem 0.5rem', color: C.target }}>{fmt(t.target)}</td>
                    <td className="mono" style={{ padding: '0.45rem 0.5rem' }}>{t.entry_fill_price ? `${fmt(t.entry_fill_price)} @${t.entry_time}` : '–'}</td>
                    <td className="mono" style={{ padding: '0.45rem 0.5rem' }}>{t.exit_price ? `${fmt(t.exit_price)} @${t.exit_time}` : '–'}</td>
                    <td style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: statusColor(t.status) }}>{t.status.replace(/_/g, ' ')}</td>
                    <td className="mono" style={{ padding: '0.45rem 0.5rem', fontWeight: 700, color: ((t.pnl ?? t.unrealized_pnl) ?? 0) >= 0 ? C.up : C.down }}>
                      {t.pnl !== null ? `₹${fmt(t.pnl)} (${t.r_multiple}R)` : t.unrealized_pnl !== null ? `MTM ₹${fmt(t.unrealized_pnl)}` : '–'}
                    </td>
                  </tr>
                ))}
                {(!trades || trades.trades.length === 0) && (
                  <tr><td colSpan={10} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-dim)' }}>No ORB setups recorded for this session yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
