// Client component by inheritance: only imported from the 'use client' page.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, type IChartApi, type ISeriesApi } from 'lightweight-charts';

type StrategyMeta = { key: string; name: string; timeframe: string; supported: boolean; rules: string | null; reason: string | null };
type Meta = {
  strategies: StrategyMeta[];
  defaults: { sessions: number; capital_per_trade: number; risk_per_trade: number; starting_capital: number; include_costs: boolean; slippage_bps: number };
  upstox: boolean;
  max_sessions: number;
  universe: string[];
};
type Trade = {
  symbol: string; date: string; entry_time: string; exit_time: string; qty: number; entry: number; stop: number;
  target: number | null; exit: number; reason: string; gross_pnl: number; charges: number; net_pnl: number;
  r_multiple: number | null; return_pct: number;
};
type Metrics = {
  trades: number; wins: number; losses: number; win_rate: number | null; net_pnl: number; gross_pnl: number; charges: number;
  profit_factor: number | null; avg_win: number | null; avg_loss: number | null; win_loss_ratio: number | null;
  expectancy: number | null; avg_r: number | null; avg_return_pct: number | null; total_return_pct: number | null;
  max_drawdown: number; max_drawdown_pct: number | null; sharpe: number | null; sortino: number | null; calmar: number | null;
  max_consecutive_wins: number; max_consecutive_losses: number; best_symbol: string | null; worst_symbol: string | null;
  exit_reasons: Record<string, number>;
  equity_curve: { date: string; pnl: number; equity: number; drawdown: number }[];
  by_symbol: { symbol: string; trades: number; wins: number; net_pnl: number; win_rate: number }[];
};
type Result = {
  strategy_key: string; strategy_name: string; rules: string;
  params: { sessions: number; capital_per_trade: number; risk_per_trade: number; starting_capital: number; include_costs: boolean; slippage_bps: number; symbols: string[] | null };
  period: { from: string | null; to: string | null; sessions: number };
  symbols_tested: number; data_sources: Record<string, number>; setups: number; unfilled_setups: number;
  metrics: Metrics; trades: Trade[]; notes: string[]; runtime_s: number;
};
type RunRow = {
  id: number; created_at: string; created_by: string; strategy_key: string; strategy_name: string; period_from: string;
  period_to: string; sessions: number; symbols_tested: number; trades: number; win_rate: number | null; net_pnl: number;
  profit_factor: number | null; max_drawdown_pct: number | null;
};

const num = (n: any, d = 2) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? '–' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const inr = (n: any) => (n === null || n === undefined ? '–' : `${Number(n) < 0 ? '−' : ''}₹${num(Math.abs(Number(n)))}`);
const signedInr = (n: any) => (n === null || n === undefined ? '–' : `${Number(n) >= 0 ? '+' : '−'}₹${num(Math.abs(Number(n)))}`);
const tone = (n: any) => (n === null || n === undefined ? '' : Number(n) > 0 ? 'good' : Number(n) < 0 ? 'bad' : '');
const REASON_LABEL: Record<string, string> = { TARGET: 'Target', STOP: 'Stop loss', EOD: '15:15 square-off', SIGNAL: 'Exit signal' };

function EquityChart({ curve, start }: { curve: Metrics['equity_curve']; start: number }) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);
  useEffect(() => {
    if (!box.current) return;
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#94a3b8', fontFamily: 'JetBrains Mono, monospace' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)' },
    });
    seriesRef.current = chart.addBaselineSeries({
      baseValue: { type: 'price', price: start },
      topLineColor: '#10b981', topFillColor1: 'rgba(16,185,129,0.25)', topFillColor2: 'rgba(16,185,129,0.02)',
      bottomLineColor: '#f43f5e', bottomFillColor1: 'rgba(244,63,94,0.02)', bottomFillColor2: 'rgba(244,63,94,0.25)',
      lineWidth: 2,
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [start]);
  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(curve.map((p) => ({ time: p.date, value: p.equity })) as any);
    chartRef.current?.timeScale().fitContent();
  }, [curve]);
  return <div ref={box} style={{ height: 260, width: '100%' }} />;
}

export default function BacktestPanel({
  apiBase, token, isAdmin, initialKey, onUnauthorized, onOpenChart, onMetricsUpdated,
}: {
  apiBase: string;
  token: string;
  isAdmin: boolean;
  initialKey?: string | null;
  onUnauthorized: () => void;
  onOpenChart: (symbol: string) => void;
  onMetricsUpdated: () => void;
}) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [form, setForm] = useState({
    strategy_key: initialKey || 'open_range_breakout', sessions: 20, scope: 'all' as 'all' | 'custom', symbols: [] as string[],
    capital_per_trade: 100000, risk_per_trade: 0, starting_capital: 500000, include_costs: true, slippage_bps: 2,
  });
  const [symbolQuery, setSymbolQuery] = useState('');
  const [job, setJob] = useState<{ id: string; status: string; progress: number; total: number; error?: string | null } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [err, setErr] = useState('');
  const [tradeView, setTradeView] = useState<'all' | 'wins' | 'losses'>('all');
  const pollRef = useRef<number | null>(null);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
    if (res.status === 401) {
      onUnauthorized();
      throw new Error('Session expired');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
    return body;
  }, [apiBase, token, onUnauthorized]);

  const loadRuns = useCallback(async () => {
    try { setRuns(await api('/backtest/runs?limit=30')); } catch { /* keep list */ }
  }, [api]);

  useEffect(() => {
    (async () => {
      try {
        const m: Meta = await api('/backtest/strategies');
        setMeta(m);
        setForm((f) => ({
          ...f,
          sessions: Math.min(m.defaults.sessions, m.max_sessions),
          strategy_key: m.strategies.some((s) => s.key === f.strategy_key && s.supported) ? f.strategy_key : (m.strategies.find((s) => s.supported)?.key || f.strategy_key),
        }));
      } catch (e: any) {
        setErr(e.message);
      }
    })();
    loadRuns();
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [api, loadRuns]);

  useEffect(() => { if (initialKey) setForm((f) => ({ ...f, strategy_key: initialKey })); }, [initialKey]);

  const selected = meta?.strategies.find((s) => s.key === form.strategy_key);
  const running = job !== null && (job.status === 'QUEUED' || job.status === 'RUNNING');

  const run = async () => {
    setErr('');
    setResult(null);
    if (form.scope === 'custom' && form.symbols.length === 0) {
      setErr('Pick at least one stock, or choose "All Nifty 50".');
      return;
    }
    try {
      const { job_id } = await api('/backtest/run', {
        method: 'POST',
        body: JSON.stringify({
          strategy_key: form.strategy_key, sessions: form.sessions, symbols: form.scope === 'custom' ? form.symbols : null,
          capital_per_trade: form.capital_per_trade, risk_per_trade: form.risk_per_trade, starting_capital: form.starting_capital,
          include_costs: form.include_costs, slippage_bps: form.slippage_bps,
        }),
      });
      setJob({ id: job_id, status: 'QUEUED', progress: 0, total: 0 });
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        try {
          const j = await api(`/backtest/jobs/${job_id}`);
          setJob({ id: j.id, status: j.status, progress: j.progress, total: j.total, error: j.error });
          if (j.status === 'DONE' || j.status === 'FAILED') {
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
            if (j.status === 'DONE') {
              setResult(j.result);
              loadRuns();
              if (!j.result?.params?.symbols) onMetricsUpdated();
            } else setErr(j.error || 'Backtest failed');
          }
        } catch (e: any) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setJob(null);
          setErr(e.message);
        }
      }, 1500);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const openRun = async (id: number) => {
    setErr('');
    try {
      const r = await api(`/backtest/runs/${id}`);
      setResult(r.result);
      setJob(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const deleteRun = async (id: number) => {
    if (!window.confirm('Delete this saved backtest run? This cannot be undone.')) return;
    try { await api(`/backtest/runs/${id}`, { method: 'DELETE' }); loadRuns(); } catch (e: any) { setErr(e.message); }
  };

  const shownTrades = useMemo(() => {
    const t = result?.trades || [];
    return tradeView === 'wins' ? t.filter((x) => x.net_pnl > 0) : tradeView === 'losses' ? t.filter((x) => x.net_pnl <= 0) : t;
  }, [result, tradeView]);

  const downloadCsv = () => {
    if (!result) return;
    const head = ['date', 'symbol', 'entry_time', 'entry_fill', 'stop', 'target', 'exit_time', 'exit_fill', 'exit_reason', 'qty', 'gross_pnl', 'charges', 'net_pnl', 'r_multiple'];
    const rows = result.trades.map((t) => [t.date, t.symbol, t.entry_time, t.entry, t.stop, t.target ?? '', t.exit_time, t.exit, t.reason, t.qty, t.gross_pnl, t.charges, t.net_pnl, t.r_multiple ?? '']);
    const csv = [head, ...rows].map((r) => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest_${result.strategy_key}_${result.period.from}_${result.period.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredUniverse = (meta?.universe || []).filter((s) => s.toLowerCase().includes(symbolQuery.toLowerCase()));
  const toggleSymbol = (s: string) =>
    setForm((f) => ({ ...f, symbols: f.symbols.includes(s) ? f.symbols.filter((x) => x !== s) : [...f.symbols, s] }));
  const m = result?.metrics;

  return (
    <div className="ui-stack">
      {err && <div className="notice warn"><span>{err}</span><button className="btn" onClick={() => setErr('')}>Dismiss</button></div>}

      {/* ---------------- Setup ---------------- */}
      <div className="ui-card">
        <div className="ui-card-head">
          <div>
            <div className="ui-card-title">Run a backtest</div>
            <div className="ui-card-sub">
              Replays real 1-minute NSE candles through the strategy rules. Entries fill at the next bar's open, stops are assumed
              before targets inside a bar, and intraday charges are deducted.
            </div>
          </div>
          {meta && (
            <span className={`chip ${meta.upstox ? 'good' : 'warn'}`}>
              Data: {meta.upstox ? `Upstox · up to ${meta.max_sessions} sessions` : `Yahoo · last ${meta.max_sessions} sessions`}
            </span>
          )}
        </div>

        <div className="bt-form">
          <label className="bt-field bt-wide">
            <span>Strategy</span>
            <select className="form-input" value={form.strategy_key} onChange={(e) => setForm({ ...form, strategy_key: e.target.value })} disabled={running}>
              {(meta?.strategies || []).map((s) => (
                <option key={s.key} value={s.key} disabled={!s.supported}>
                  {s.name}{s.supported ? '' : ' — not backtestable yet'}
                </option>
              ))}
            </select>
          </label>
          <label className="bt-field">
            <span>Sessions (trading days)</span>
            <input className="form-input" type="number" min={1} max={meta?.max_sessions || 20} value={form.sessions}
              onChange={(e) => setForm({ ...form, sessions: Math.max(1, Math.min(Number(e.target.value) || 1, meta?.max_sessions || 20)) })} disabled={running} />
          </label>
          <label className="bt-field">
            <span>Capital per trade (₹)</span>
            <input className="form-input" type="number" min={1000} step={1000} value={form.capital_per_trade}
              onChange={(e) => setForm({ ...form, capital_per_trade: Number(e.target.value) || 0 })} disabled={running} />
          </label>
          <label className="bt-field">
            <span>Max risk per trade (₹, 0 = off)</span>
            <input className="form-input" type="number" min={0} step={100} value={form.risk_per_trade}
              onChange={(e) => setForm({ ...form, risk_per_trade: Number(e.target.value) || 0 })} disabled={running} />
          </label>
          <label className="bt-field">
            <span>Starting capital (₹)</span>
            <input className="form-input" type="number" min={10000} step={10000} value={form.starting_capital}
              onChange={(e) => setForm({ ...form, starting_capital: Number(e.target.value) || 0 })} disabled={running} />
          </label>
          <label className="bt-field">
            <span>Slippage (basis points per side)</span>
            <input className="form-input" type="number" min={0} max={50} step={0.5} value={form.slippage_bps}
              onChange={(e) => setForm({ ...form, slippage_bps: Math.max(0, Number(e.target.value) || 0) })} disabled={running} />
          </label>
          <label className="bt-field bt-check">
            <input type="checkbox" checked={form.include_costs} onChange={(e) => setForm({ ...form, include_costs: e.target.checked })} disabled={running} />
            <span>Deduct brokerage, STT, exchange, SEBI, GST and stamp duty</span>
          </label>
        </div>

        {selected && (
          <div className="bt-rules">
            <b>{selected.name}</b> · {selected.timeframe}
            <div>{selected.supported ? selected.rules : selected.reason}</div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.9rem' }}>
          <div className="seg">
            <button className={form.scope === 'all' ? 'on' : ''} onClick={() => setForm({ ...form, scope: 'all' })} disabled={running}>All Nifty 50</button>
            <button className={form.scope === 'custom' ? 'on' : ''} onClick={() => setForm({ ...form, scope: 'custom' })} disabled={running}>
              Pick stocks{form.symbols.length ? ` (${form.symbols.length})` : ''}
            </button>
          </div>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
            {form.scope === 'all' ? 'Full-universe runs also update the metrics shown on the Strategies page.' : 'Custom-stock runs are saved but do not change published metrics.'}
          </span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={run} disabled={running || !selected?.supported}>
            {running ? 'Running…' : 'Run backtest'}
          </button>
        </div>

        {form.scope === 'custom' && (
          <div style={{ marginTop: '0.8rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input className="form-input" style={{ maxWidth: 240, padding: '0.45rem 0.7rem', fontSize: '0.8rem' }} placeholder="Filter stocks…"
                value={symbolQuery} onChange={(e) => setSymbolQuery(e.target.value)} />
              <button className="btn" onClick={() => setForm({ ...form, symbols: [] })}>Clear</button>
            </div>
            <div className="bt-symbols">
              {filteredUniverse.map((s) => (
                <button key={s} className={`chip ${form.symbols.includes(s) ? 'info' : ''}`} onClick={() => toggleSymbol(s)} disabled={running}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {running && job && (
          <div style={{ marginTop: '0.9rem' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              {job.status === 'QUEUED' ? 'Queued…' : job.total ? `Loading history ${job.progress} / ${job.total} stocks, then simulating…` : 'Starting…'}
            </div>
            <div className="bt-progress"><div style={{ width: `${job.total ? Math.round((job.progress / job.total) * 100) : 5}%` }} /></div>
          </div>
        )}
      </div>

      {/* ---------------- Results ---------------- */}
      {result && m && (
        <>
          <div className="ui-card">
            <div className="ui-card-head">
              <div>
                <div className="ui-card-title">{result.strategy_name}</div>
                <div className="ui-card-sub">
                  {result.period.from} → {result.period.to} · {result.period.sessions} sessions · {result.symbols_tested} stocks ·
                  {' '}{Object.entries(result.data_sources).map(([k, v]) => `${k} ${v}`).join(', ') || 'no data'} · {result.runtime_s}s
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className="chip">{result.params.include_costs ? 'After costs' : 'Before costs'} · slippage {result.params.slippage_bps} bps</span>
                <button className="btn" onClick={downloadCsv} disabled={!result.trades.length}>Download trades (CSV)</button>
              </div>
            </div>

            <div className="kpi-grid">
              <div className={`kpi ${tone(m.net_pnl)}`}><div className="kpi-label">Net P&amp;L</div><div className="kpi-value">{signedInr(m.net_pnl)}</div>
                <div className="kpi-sub">{m.total_return_pct != null ? `${m.total_return_pct}% of starting capital` : '–'}</div></div>
              <div className="kpi"><div className="kpi-label">Trades</div><div className="kpi-value">{m.trades}</div>
                <div className="kpi-sub">{result.setups} setups · {result.unfilled_setups} never filled</div></div>
              <div className="kpi"><div className="kpi-label">Win rate</div><div className="kpi-value">{m.win_rate != null ? `${m.win_rate}%` : '–'}</div>
                <div className="kpi-sub">W {m.wins} · L {m.losses}</div></div>
              <div className={`kpi ${m.profit_factor != null && m.profit_factor >= 1 ? 'good' : m.profit_factor != null ? 'bad' : ''}`}>
                <div className="kpi-label">Profit factor</div><div className="kpi-value">{m.profit_factor ?? '–'}</div>
                <div className="kpi-sub">gross wins ÷ gross losses</div></div>
              <div className={`kpi ${tone(m.expectancy)}`}><div className="kpi-label">Expectancy / trade</div><div className="kpi-value">{signedInr(m.expectancy)}</div>
                <div className="kpi-sub">avg R {m.avg_r ?? '–'}</div></div>
              <div className="kpi bad"><div className="kpi-label">Max drawdown</div><div className="kpi-value">{inr(m.max_drawdown)}</div>
                <div className="kpi-sub">{m.max_drawdown_pct != null ? `${m.max_drawdown_pct}% of capital` : '–'}</div></div>
            </div>

            <div className="bt-stats">
              <span>Avg win <b>{inr(m.avg_win)}</b></span>
              <span>Avg loss <b>{inr(m.avg_loss)}</b></span>
              <span>Win/loss size <b>{m.win_loss_ratio ?? '–'}</b></span>
              <span>Sharpe <b>{m.sharpe ?? '–'}</b></span>
              <span>Sortino <b>{m.sortino ?? '–'}</b></span>
              <span>Calmar <b>{m.calmar ?? '–'}</b></span>
              <span>Streaks <b>{m.max_consecutive_wins}W / {m.max_consecutive_losses}L</b></span>
              <span>Charges paid <b>{inr(m.charges)}</b></span>
              <span>Exits <b>{Object.entries(m.exit_reasons).map(([k, v]) => `${REASON_LABEL[k] || k} ${v}`).join(' · ') || '–'}</b></span>
            </div>

            {result.notes.length > 0 && (
              <ul className="bt-notes">{result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            )}
          </div>

          <div className="ui-grid-2">
            <div className="ui-card">
              <div className="ui-card-head"><div><div className="ui-card-title">Equity curve</div>
                <div className="ui-card-sub">Starting at {inr(result.params.starting_capital)} · end-of-day equity</div></div></div>
              {m.equity_curve.length ? <EquityChart curve={m.equity_curve} start={result.params.starting_capital} /> : <div className="data-table empty">No sessions</div>}
            </div>
            <div className="ui-card">
              <div className="ui-card-head"><div><div className="ui-card-title">By stock</div><div className="ui-card-sub">Click a stock to open its live chart</div></div></div>
              <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Stock</th><th className="num">Trades</th><th className="num">Win %</th><th className="num">Net P&amp;L</th></tr></thead>
                  <tbody>
                    {m.by_symbol.length === 0 && <tr><td colSpan={4} className="empty">No trades</td></tr>}
                    {m.by_symbol.map((s) => (
                      <tr key={s.symbol} className="clickable" onClick={() => onOpenChart(s.symbol)}>
                        <td className="sym">{s.symbol}</td><td className="num">{s.trades}</td><td className="num">{s.win_rate}%</td>
                        <td className="num" style={{ color: s.net_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{signedInr(s.net_pnl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="ui-card">
            <div className="ui-card-head">
              <div><div className="ui-card-title">Trades</div><div className="ui-card-sub">Every simulated fill, oldest first</div></div>
              <div className="seg">
                {(['all', 'wins', 'losses'] as const).map((v) => (
                  <button key={v} className={tradeView === v ? 'on' : ''} onClick={() => setTradeView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
                ))}
              </div>
            </div>
            <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
              <table className="data-table">
                <thead><tr>
                  <th>Date</th><th>Stock</th><th className="num">Qty</th><th>In</th><th className="num" title="Includes slippage">Entry fill</th><th className="num">Stop</th>
                  <th className="num">Target</th><th>Out</th><th className="num" title="Includes slippage">Exit fill</th><th>Reason</th><th className="num">Charges</th>
                  <th className="num">Net P&amp;L</th><th className="num">R</th>
                </tr></thead>
                <tbody>
                  {shownTrades.length === 0 && <tr><td colSpan={13} className="empty">No trades in this view</td></tr>}
                  {shownTrades.slice(0, 1000).map((t, i) => (
                    <tr key={`${t.symbol}-${t.date}-${t.entry_time}-${i}`}>
                      <td>{t.date}</td><td className="sym">{t.symbol}</td><td className="num">{t.qty}</td><td>{t.entry_time}</td>
                      <td className="num">{num(t.entry)}</td><td className="num">{num(t.stop)}</td><td className="num">{t.target != null ? num(t.target) : 'trail'}</td>
                      <td>{t.exit_time}</td><td className="num">{num(t.exit)}</td>
                      <td><span className={`chip ${t.reason === 'TARGET' ? 'good' : t.reason === 'STOP' ? 'bad' : ''}`}>{REASON_LABEL[t.reason] || t.reason}</span></td>
                      <td className="num">{num(t.charges)}</td>
                      <td className="num" style={{ color: t.net_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{signedInr(t.net_pnl)}</td>
                      <td className="num">{t.r_multiple ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shownTrades.length > 1000 && <div className="ui-card-sub" style={{ padding: '0.5rem' }}>Showing the first 1,000 trades; download the CSV for all {shownTrades.length}.</div>}
            </div>
          </div>
        </>
      )}

      {/* ---------------- History ---------------- */}
      <div className="ui-card">
        <div className="ui-card-head">
          <div><div className="ui-card-title">Saved runs</div><div className="ui-card-sub">Every completed backtest is stored; open one to see its full report</div></div>
          <button className="btn" onClick={loadRuns}>Refresh</button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Run at</th><th>Strategy</th><th>Period</th><th className="num">Stocks</th><th className="num">Trades</th>
              <th className="num">Win %</th><th className="num">PF</th><th className="num">Max DD</th><th className="num">Net P&amp;L</th><th>By</th><th />
            </tr></thead>
            <tbody>
              {runs.length === 0 && <tr><td colSpan={11} className="empty">No backtests yet</td></tr>}
              {runs.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => openRun(r.id)}>
                  <td>{r.created_at}</td><td className="sym">{r.strategy_name}</td><td>{r.period_from} → {r.period_to}</td>
                  <td className="num">{r.symbols_tested}</td><td className="num">{r.trades}</td>
                  <td className="num">{r.win_rate != null ? `${r.win_rate}%` : '–'}</td><td className="num">{r.profit_factor ?? '–'}</td>
                  <td className="num">{r.max_drawdown_pct != null ? `${r.max_drawdown_pct}%` : '–'}</td>
                  <td className="num" style={{ color: r.net_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{signedInr(r.net_pnl)}</td>
                  <td>{r.created_by}</td>
                  <td>{isAdmin && <button className="btn" style={{ padding: '0.2rem 0.5rem' }} onClick={(e) => { e.stopPropagation(); deleteRun(r.id); }}>Delete</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ui-card-sub" style={{ padding: '0 0.25rem' }}>
        Backtests use historical data and simplified fills; they do not guarantee future results. Free-text strategies created in
        Strategy Studio need a coded rule set before they can be backtested.
      </div>
    </div>
  );
}
