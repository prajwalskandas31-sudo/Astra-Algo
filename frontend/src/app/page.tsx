'use client';

import React, { useState, useEffect, useCallback } from 'react';
import LiveMarketPanel from '@/components/LiveMarketPanel';
import BacktestPanel from '@/components/BacktestPanel';
import {
  LayoutDashboard,
  TrendingUp,
  History,
  Users,
  Activity,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  LogOut,
  Radio,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Send,
  Smartphone,
  MessageSquare,
  Sliders,
  Sparkles,
  Server,
  Lock,
  ExternalLink,
  Info,
  Mic,
  MicOff,
  Play,
  CheckSquare,
  Square,
  Trash2,
  Edit3,
  Save,
  Zap,
  PlusCircle,
  Bot,
  FlaskConical,
  KeyRound,
} from 'lucide-react';

const getApiBase = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:8000";
    }
    if (window.location.hostname.includes("trycloudflare.com")) {
      return "https://unified-lectures-carl-secretary.trycloudflare.com";
    }
  }
  return "https://astra-algo.onrender.com";
};

const API_BASE = getApiBase();

interface UserProfile {
  id: number;
  username: string;
  role: 'super_admin' | 'admin' | 'user';
  is_active: boolean;
}

interface StrategyItem {
  id: number;
  key: string;
  name: string;
  category: string;
  timeframe: string;
  description: string;
  entry_rules: string;
  exit_rules: string;
  risk_reward: string;
  win_rate: number | null;
  total_checks: number | null;
  correct_hits: number | null;
  false_signals: number | null;
  profit_factor: number | null;
  max_drawdown: number | null;
  avg_return_per_trade: number | null;
  sharpe_ratio?: number | null;
  sortino_ratio?: number | null;
  calmar_ratio?: number | null;
  profit_expectancy?: number | null;
  win_loss_ratio?: number | null;
  max_consecutive_wins?: number | null;
  max_consecutive_losses?: number | null;
  best_symbol?: string | null;
  metrics_source?: string | null;
  metrics_updated_at?: string | null;
  metrics_period?: string | null;
  backtest_supported?: boolean;
  is_active: boolean;
  is_enabled_for_execution?: boolean;
  created_by?: string;
  ai_prompt?: string;
  rank: number;
}

const DEFAULT_STRATEGIES: StrategyItem[] = [];

interface AuditLogItem {
  id: number;
  timestamp: string;
  channel: string;
  recipient: string;
  message_type: string;
  message_preview: string;
  status: string;
  response_details?: string;
  triggered_by: string;
}

interface LiveHealthData {
  timestamp: string;
  overall_status: string;
  services: {
    upstox: {
      name: string;
      healthy: boolean;
      status: string;
      user_id?: string;
      latency_ms: number;
      detail?: string;
    };
    whatsapp: {
      name: string;
      healthy: boolean;
      status: string;
      phone_id?: string;
      verified_name?: string;
      display_phone?: string;
      quality_rating?: string;
      recipients_configured: number;
      latency_ms: number;
    };
    telegram: {
      name: string;
      healthy: boolean;
      status: string;
      bot_username?: string;
      bot_name?: string;
      chat_groups_configured: number;
      latency_ms: number;
    };
    scheduler: {
      name: string;
      healthy: boolean;
      status: string;
      schedule: string;
      timezone: string;
      jobs_count: number;
    };
    database: {
      name: string;
      persistent?: boolean;
      healthy: boolean;
      status: string;
    };
    ip_guard: {
      name: string;
      healthy: boolean;
      status: string;
      client_ip: string;
    };
  };
}

interface DashboardMetrics {
  server_time_ist: string;
  last_whatsapp_call: {
    timestamp: string;
    recipient: string;
    status: string;
    preview: string;
  };
  last_telegram_call: {
    timestamp: string;
    recipient: string;
    status: string;
    preview: string;
  };
  broker: {
    status: string;
    user_id?: string;
    user_name?: string;
    authenticated?: boolean;
    detail?: string;
  };
  scheduler_status: string;
  scheduler_next_scan: string;
  total_audit_logs: number;
  successful_notifications: number;
  active_trades: any[];
  recent_evaluations: any[];
  stocks_snapshot: Array<{
    symbol: string;
    ltp: number;
    prev_high: number;
    open: number;
    high: number;
    low: number;
    change_pct: string;
    trend: string;
    breakout: boolean;
  }>;
}

interface Phase1StockItem {
  symbol: string;
  instrument_key: string;
  open: number;
  prev_day_high: number;
  diff: number;
  condition_met: boolean;
  status: string;
  action: string;
}

interface Phase1Response {
  timestamp: string;
  phase: string;
  condition: string;
  scheduled_time: string;
  execution_latency_ms: number;
  total_universe_scanned: number;
  tracked_stocks_count: number;
  disqualified_stocks_count: number;
  tracked_stocks: Phase1StockItem[];
  disqualified_stocks: Phase1StockItem[];
}

interface Phase2StockItem {
  timestamp: string;
  symbol: string;
  source: string;
  latency_ms: number;
  prev_day_high: number;
  candle: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
  setup_detected: boolean;
  direction: string;
  expected_entry: number;
  entry_order_level: number;
  stop_loss: number;
  stop_loss_level: number;
  risk_per_share: number;
  take_profit: number;
  take_profit_level: number;
  risk_reward_ratio: string;
  order_execution?: {
    success: boolean;
    mode: string;
    order_id: string;
    symbol: string;
    instrument_key: string;
    side: string;
    order_type: string;
    price: number;
    stop_loss: number;
    target: number;
    latency_ms: number;
    broker_status: string;
    detail: string;
  };
}

interface Phase2Response {
  timestamp: string;
  phase: string;
  condition: string;
  scheduled_time: string;
  execution_latency_ms: number;
  tracked_candidates_count: number;
  confirmed_breakouts_count: number;
  breakout_stocks: Phase2StockItem[];
  non_breakout_stocks: any[];
  orders: any[];
}

interface OrderAuditItem {
  id?: number;
  symbol: string;
  instrument_key?: string;
  trade_type?: string;
  action?: string;
  order_id: string;
  entry_price: number;
  stop_loss: number;
  target_price: number;
  risk_per_share: number;
  quantity?: number;
  status: string;
  latency_ms?: number;
  notes?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Small display helpers shared by every page
// ---------------------------------------------------------------------------
const fmtNum = (n: any, d = 2) =>
  n === null || n === undefined || n === '' || Number.isNaN(Number(n))
    ? '–'
    : Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtINR = (n: any) => (n === null || n === undefined ? '–' : `₹${fmtNum(n)}`);
const fmtSigned = (n: any) => (n === null || n === undefined ? '–' : `${Number(n) >= 0 ? '+' : '−'}₹${fmtNum(Math.abs(Number(n)))}`);
const humanize = (s?: string | null) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '–');

function toneFor(status?: string | null): 'good' | 'bad' | 'warn' | 'info' | '' {
  if (!status) return '';
  if (['TARGET_HIT', 'CONNECTED', 'ONLINE', 'RUNNING', 'SENT', 'OPERATIONAL'].includes(status)) return 'good';
  if (['STOP_LOSS_HIT', 'ENTRY_REJECTED', 'EXPIRED', 'ERROR', 'FAILED', 'STOPPED'].includes(status) || status.startsWith('HTTP_')) return 'bad';
  if (['PENDING_ENTRY', 'DEGRADED', 'CONFIG_MISSING', 'UNCONFIGURED', 'SKIPPED', 'REPLAY', 'PAPER'].includes(status)) return 'warn';
  if (['OPEN', 'LIVE'].includes(status)) return 'info';
  return '';
}

function istMarketOpen(): boolean {
  const now = new Date(Date.now() + 19800 * 1000);
  const day = now.getUTCDay();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return day >= 1 && day <= 5 && mins >= 555 && mins < 930;
}

// Self-contained clock: ticking every second re-renders only this text, not the whole desk.
function IstClock() {
  const [now, setNow] = useState('');
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
        day: '2-digit', month: 'short', year: 'numeric',
      }) + ' IST';
    setNow(fmt());
    const id = setInterval(() => setNow(fmt()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{now || '…'}</>;
}

const LOGO_STYLE: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', color: '#04101f', fontWeight: 800, fontSize: '0.9rem',
};

const PAGE_META: Record<string, { title: string; sub: string }> = {
  dashboard: { title: 'Dashboard', sub: "Today's ORB run, live market and orders" },
  charts: { title: 'Live Charts', sub: 'Nifty 50 · 1-minute candles with strategy levels' },
  strategies: { title: 'Strategies', sub: 'Rules and recorded metrics' },
  builder: { title: 'Strategy Studio', sub: 'Draft and edit strategy definitions' },
  runner: { title: 'Multi-strategy Runner', sub: 'Run selected strategies together' },
  backtest: { title: 'Backtesting', sub: 'Test any coded strategy on real historical 1-minute data' },
  account: { title: 'My Account', sub: 'Your sign-in details' },
  audit: { title: 'Alerts Log', sub: 'Every WhatsApp and Telegram message sent' },
  users: { title: 'Users & Roles', sub: 'Who can access the desk' },
  system: { title: 'System Status', sub: 'Broker, alerts and scheduler health' },
};

export default function AstraTradingDesk() {
  // Navigation & session state
  const [currentNav, setCurrentNav] = useState<'dashboard' | 'charts' | 'strategies' | 'builder' | 'runner' | 'backtest' | 'audit' | 'users' | 'system' | 'account'>('dashboard');
  const [token, setToken] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Login form state (explicit inputs only, no 1-click bypasses)
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Dashboard Data
  const [dashMetrics, setDashMetrics] = useState<DashboardMetrics | null>(null);
  const [healthData, setHealthData] = useState<LiveHealthData | null>(null);

  // Strategies Data - Default to full suite with Open Range Breakout (ORB) as #1
  const [strategies, setStrategies] = useState<StrategyItem[]>(DEFAULT_STRATEGIES);
  const [selectedStrategyKey, setSelectedStrategyKey] = useState<string>('open_range_breakout');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>(['open_range_breakout', 'orb_15min']);
  const [comparisonResults, setComparisonResults] = useState<any | null>(null);

  // Two-Stage Opening Range Breakout (ORB) Engine States
  const [phase1Data, setPhase1Data] = useState<Phase1Response | null>(null);
  const [phase2Data, setPhase2Data] = useState<Phase2Response | null>(null);
  const [strategyOrders, setStrategyOrders] = useState<OrderAuditItem[]>([]);
  const [strategyStatusData, setStrategyStatusData] = useState<any | null>(null);
  const [phase1ActiveTab, setPhase1ActiveTab] = useState<'tracked' | 'disqualified'>('tracked');
  const [isExecutingPhase1, setIsExecutingPhase1] = useState(false);
  const [isExecutingPhase2, setIsExecutingPhase2] = useState(false);
  const [isExecutingPipeline, setIsExecutingPipeline] = useState(false);

  // Strategy Studio & AI States
  const [aiPrompt, setAiPrompt] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDeducedDraft, setAiDeducedDraft] = useState<any | null>(null);
  const [studioMode, setStudioMode] = useState<'create' | 'edit'>('create');
  const [editingStratKey, setEditingStratKey] = useState<string | null>(null);
  const [strategyForm, setStrategyForm] = useState({
    key: 'orb_scalper_v2',
    name: '',
    category: 'Intraday Momentum Breakout',
    timeframe: '1-Min (09:15 candle evaluated at 09:16 AM)',
    description: '',
    entry_rules: '',
    exit_rules: '',
    risk_reward: '1:2',
  });

  // Multi-Strategy Simultaneous Execution Matrix
  const [activeExecutionKeys, setActiveExecutionKeys] = useState<string[]>([
    'open_range_breakout',
    'ema_crossover_9_21',
  ]);
  const [simultaneousRunning, setSimultaneousRunning] = useState(false);
  const [simultaneousResults, setSimultaneousResults] = useState<any | null>(null);

  // Audit Logs Data
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditChannelFilter, setAuditChannelFilter] = useState<string>('all');
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLogItem | null>(null);

  // RBAC Users Data
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');

  // Backtesting deep link (Strategies page -> Backtesting) and password change
  const [backtestKey, setBacktestKey] = useState<string | null>(null);
  const openBacktest = (key: string) => { setBacktestKey(key); setCurrentNav('backtest'); };
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Session trades summary (P&L) for the dashboard KPIs
  const [tradesSummary, setTradesSummary] = useState<any | null>(null);
  const [phase2View, setPhase2View] = useState<'setups' | 'all'>('setups');
  const fetchTradesSummary = async (authToken?: string) => {
    const t = authToken || token;
    if (!t) return;
    try {
      const res = await fetch(`${API_BASE}/strategy/trades`, { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) setTradesSummary(await res.json());
    } catch { /* keep last value */ }
  };

  // Live chart symbol (any symbol in the dashboard opens here)
  const [chartSymbol, setChartSymbol] = useState<string>('RELIANCE');
  const openChart = (sym: string) => {
    if (!sym) return;
    setChartSymbol(sym);
    if (currentNav !== 'dashboard' && currentNav !== 'charts') setCurrentNav('charts');
    setTimeout(() => document.getElementById('live-market')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  // Keep the session across page reloads (sessionStorage: cleared when the tab closes)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('astra_token');
      if (saved) setToken(saved);
    } catch { /* storage unavailable */ }
  }, []);
  const persistToken = (t: string | null) => {
    try {
      if (t) sessionStorage.setItem('astra_token', t);
      else sessionStorage.removeItem('astra_token');
    } catch { /* storage unavailable */ }
  };
  const handleUnauthorized = useCallback(() => {
    persistToken(null);
    setToken(null);
    setUserProfile(null);
    setError('Session expired - please sign in again.');
  }, []);


  // Periodic health check & dashboard poll
  useEffect(() => {
    if (token) {
      fetchAllData(token);
      const pollTimer = setInterval(() => {
        fetchLiveHealth(token);
        fetchDashboardMetrics(token);
        fetchStrategyStatus(token);
        fetchStrategyOrders(token);
        fetchTradesSummary(token);
      }, 15000);
      return () => clearInterval(pollTimer);
    }
  }, [token]);

  const fetchAllData = async (authToken: string) => {
    await Promise.all([
      fetchProfile(authToken),
      fetchLiveHealth(authToken),
      fetchDashboardMetrics(authToken),
      fetchStrategies(authToken),
      fetchAuditLogs(authToken),
      fetchStrategyStatus(authToken),
      fetchStrategyOrders(authToken),
      fetchTradesSummary(authToken),
    ]);
  };

  const fetchStrategyStatus = async (authToken?: string) => {
    const t = authToken || token;
    if (!t) return;
    try {
      const res = await fetch(`${API_BASE}/strategy/status`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStrategyStatusData(data);
        if (data.phase1_status?.last_result) {
          setPhase1Data(data.phase1_status.last_result);
        }
        if (data.phase2_status?.last_result) {
          setPhase2Data(data.phase2_status.last_result);
        }
      }
    } catch (err) {
      console.error('Error fetching strategy status:', err);
    }
  };

  const fetchStrategyOrders = async (authToken?: string) => {
    const t = authToken || token;
    if (!t) return;
    try {
      const res = await fetch(`${API_BASE}/strategy/orders`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        setStrategyOrders(await res.json());
      }
    } catch (err) {
      console.error('Error fetching strategy orders:', err);
    }
  };

  const fetchProfile = async (authToken: string) => {
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data);
        if (data.role === 'super_admin' || data.role === 'admin') {
          fetchUsers(authToken);
        }
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  };

  const fetchLiveHealth = async (authToken?: string) => {
    const t = authToken || token;
    if (!t) return;
    try {
      const res = await fetch(`${API_BASE}/system/live-health`, { headers: { Authorization: `Bearer ${t}` } });
      if (res.ok) {
        setHealthData(await res.json());
      }
    } catch (err) {
      console.error('Error checking health:', err);
    }
  };

  const fetchDashboardMetrics = async (authToken?: string) => {
    const t = authToken || token;
    if (!t) return;
    try {
      const res = await fetch(`${API_BASE}/dashboard/metrics`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        setDashMetrics(await res.json());
      }
    } catch (err) {
      console.error('Error fetching dashboard metrics:', err);
    }
  };

  const fetchStrategies = async (authToken?: string) => {
    const t = authToken || token;
    if (!t) return;
    try {
      const res = await fetch(`${API_BASE}/strategies`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data: StrategyItem[] = await res.json();
        setStrategies(data);
        if (data.length > 0 && !selectedStrategyKey) {
          // Rule: First strategy is always selected by default
          setSelectedStrategyKey(data[0].key);
          setSelectedForComparison([data[0].key, data[1]?.key || data[0].key]);
        }
      }
    } catch (err) {
      console.error('Error fetching strategies:', err);
    }
  };

  const fetchAuditLogs = async (authToken?: string, channel?: string) => {
    const t = authToken || token;
    if (!t) return;
    try {
      const ch = channel || auditChannelFilter;
      const url = ch && ch !== 'all'
        ? `${API_BASE}/notifications/audit-logs?channel=${ch}`
        : `${API_BASE}/notifications/audit-logs`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        setAuditLogs(await res.json());
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    }
  };

  const fetchUsers = async (authToken?: string) => {
    const t = authToken || token;
    if (!t) return;
    try {
      const res = await fetch(`${API_BASE}/users`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        setAllUsers(await res.json());
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: loginUsername, password: loginPassword }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Authentication credentials incorrect');
      }

      const data = await res.json();
      persistToken(data.access_token);
      setToken(data.access_token);
      await fetchAllData(data.access_token);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    persistToken(null);
    setToken(null);
    setUserProfile(null);
    setCurrentNav('dashboard');
    setLoginUsername('');
    setLoginPassword('');
  };

  const handleTriggerPhase1 = async () => {
    if (!token) return;
    setIsExecutingPhase1(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/strategy/trigger-phase1`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || 'Phase 1 filter execution failed');
      }
      const data = await res.json();
      setPhase1Data(data.result);
      const r1 = data.result;
      setSuccessMsg(
        `Phase 1 · ${r1.run_mode} · session ${r1.session_date}: ${r1.tracked_stocks_count} of ${r1.total_universe_scanned} stocks opened below their previous-day high.`
      );
      await fetchDashboardMetrics(token);
      await fetchStrategyStatus(token);
    } catch (err: any) {
      setError(err.message || 'Phase 1 filter execution failed');
    } finally {
      setIsExecutingPhase1(false);
    }
  };

  const handleTriggerPhase2 = async () => {
    if (!token) return;
    setIsExecutingPhase2(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/strategy/trigger-phase2`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || 'Phase 2 candle close execution failed');
      }
      const data = await res.json();
      setPhase2Data(data.result);
      const r2 = data.result;
      setSuccessMsg(
        `Phase 2 · ${r2.run_mode} · session ${r2.session_date}: ${r2.breakouts_confirmed} setup(s) from ${r2.total_tracked_stocks_evaluated} candidates.` +
          (r2.run_mode === 'LIVE' ? ' Broker orders placed.' : ' Simulated only — no broker orders sent.')
      );
      await fetchTradesSummary(token);
      await fetchDashboardMetrics(token);
      await fetchStrategyOrders(token);
      await fetchStrategyStatus(token);
      await fetchAuditLogs(token);
    } catch (err: any) {
      setError(err.message || 'Phase 2 candle close execution failed');
    } finally {
      setIsExecutingPhase2(false);
    }
  };

  const handleTriggerPipeline = async () => {
    if (!token) return;
    setIsExecutingPipeline(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/strategy/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || 'Strategy pipeline execution failed');
      }
      const data = await res.json();
      const p = data.pipeline || {};
      if (p.phase1_market_open) setPhase1Data(p.phase1_market_open);
      if (p.phase2_candle_close) setPhase2Data(p.phase2_candle_close);
      setSuccessMsg(
        `Full run · ${p.run_mode} · session ${p.session_date}: ${p.phase1_market_open?.tracked_stocks_count ?? 0} tracked, ${p.breakouts_count ?? 0} setup(s).` +
          (p.run_mode === 'LIVE' ? ' Broker orders placed.' : ' Simulated only — no broker orders sent.')
      );
      await fetchTradesSummary(token);
      await fetchDashboardMetrics(token);
      await fetchStrategyOrders(token);
      await fetchStrategyStatus(token);
      await fetchAuditLogs(token);
    } catch (err: any) {
      setError(err.message || 'Strategy pipeline execution failed');
    } finally {
      setIsExecutingPipeline(false);
    }
  };

  const handleTriggerScan = handleTriggerPipeline;

  const handleCompareStrategies = async () => {
    if (!token || selectedForComparison.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/strategies/compare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ strategy_keys: selectedForComparison }),
      });
      if (res.ok) {
        setComparisonResults(await res.json());
      }
    } catch (err: any) {
      console.error('Comparison error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendTestNotification = async (channel: 'whatsapp' | 'telegram' | 'both') => {
    if (!token) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/notifications/test?channel=${channel}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to dispatch test notification');
      setSuccessMsg(`Test alert dispatched via ${channel.toUpperCase()}! Check live audit logs.`);
      await fetchAuditLogs(token);
      await fetchDashboardMetrics(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendWhatsAppAuthButton = async () => {
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/notifications/send-button`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const body = await res.json();
        setSuccessMsg(`1-Click Upstox Authorize Button sent to WhatsApp (${body.recipient || 'auth phone'}).`);
        if (token) fetchAuditLogs(token);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create user');
      }
      setSuccessMsg(`Operator "${newUsername}" (${newRole}) provisioned successfully!`);
      setNewUsername('');
      setNewPassword('');
      fetchUsers(token);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (userId: number, uName: string) => {
    if (!token || !confirm(`Revoke operator access for ${uName}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSuccessMsg(`Operator ${uName} revoked.`);
        fetchUsers(token);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleComparisonKey = (key: string) => {
    if (selectedForComparison.includes(key)) {
      if (selectedForComparison.length > 1) {
        setSelectedForComparison(selectedForComparison.filter((k) => k !== key));
      }
    } else {
      setSelectedForComparison([...selectedForComparison, key]);
    }
  };

  // Voice input recognition using Web Speech API
  const handleStartListening = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. You can type your strategy description directly in the box.");
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onstart = () => {
        setIsListening(true);
        setSuccessMsg("🎙️ Listening... Speak your trading strategy rules and conditions.");
      };
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setAiPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setIsListening(false);
        setSuccessMsg("Voice input captured! Click 'Generate Strategy with AI' to deduce requirements.");
      };
      recognition.onerror = (event: any) => {
        console.error("Speech error", event);
        setIsListening(false);
      };
      recognition.onend = () => setIsListening(false);
      recognition.start();
    } catch (e) {
      console.error(e);
      setIsListening(false);
    }
  };

  const handleGenerateWithAI = async () => {
    if (!aiPrompt.trim()) {
      setError("Please describe your strategy idea in words or use the microphone first.");
      return;
    }
    setAiGenerating(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`${API_BASE}/strategies/generate-ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt: aiPrompt,
          preferred_timeframe: strategyForm.timeframe,
          risk_tolerance: "Moderate (1:2 R:R)"
        })
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || "Failed to generate strategy with AI");
      }
      const aiData = await res.json();
      setAiDeducedDraft(aiData);
      setStrategyForm({
        key: aiData.key,
        name: aiData.name,
        category: aiData.category,
        timeframe: aiData.timeframe,
        description: aiData.description,
        entry_rules: aiData.entry_rules,
        exit_rules: aiData.exit_rules,
        risk_reward: aiData.risk_reward,
      });
      setSuccessMsg("✨ AI has deduced the quantitative requirements! Review the rules and metrics below, edit any values if needed, and click 'Confirm & Add Strategy to Suite'.");
    } catch (err: any) {
      setError(err.message || "AI deduction failed");
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSaveStrategy = async () => {
    if (!token) return;
    if (!strategyForm.name.trim() || !strategyForm.key.trim()) {
      setError("Please enter a valid Strategy Name and Key identifier.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const isEdit = studioMode === 'edit' && editingStratKey;
      const url = isEdit ? `${API_BASE}/strategies/${editingStratKey}` : `${API_BASE}/strategies`;
      const method = isEdit ? 'PUT' : 'POST';
      
      const payload = {
        ...strategyForm,
        created_by: userProfile?.username || "user",
        ai_prompt: aiPrompt || undefined
      };
      
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || "Failed to save strategy");
      }
      
      const savedStrat = await res.json();
      setSuccessMsg(isEdit ? `Strategy "${savedStrat.name}" updated successfully!` : `Strategy "${savedStrat.name}" successfully created and added to the suite!`);
      await fetchStrategies(token);
      
      // Auto-select and enable for simultaneous execution
      setSelectedStrategyKey(savedStrat.key);
      if (!activeExecutionKeys.includes(savedStrat.key)) {
        setActiveExecutionKeys(prev => [...prev, savedStrat.key]);
      }
      
      // Reset studio
      setStudioMode('create');
      setEditingStratKey(null);
      setAiDeducedDraft(null);
      setAiPrompt('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditStrategy = (strat: StrategyItem) => {
    setStudioMode('edit');
    setEditingStratKey(strat.key);
    setStrategyForm({
      key: strat.key,
      name: strat.name,
      category: strat.category,
      timeframe: strat.timeframe,
      description: strat.description,
      entry_rules: strat.entry_rules,
      exit_rules: strat.exit_rules,
      risk_reward: strat.risk_reward,
    });
    setAiDeducedDraft(null);
    setCurrentNav('builder');
  };

  const handleDeleteStrategy = async (key: string) => {
    if (!token) return;
    if (key === 'open_range_breakout' || key === 'opening_high_breakout') {
      alert("Core Open Range Breakout strategy is protected and cannot be deleted.");
      return;
    }
    if (!confirm(`Are you sure you want to remove strategy '${key}'?`)) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/strategies/${key}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.detail || "Failed to delete strategy");
      }
      setSuccessMsg(`Strategy '${key}' removed successfully.`);
      setActiveExecutionKeys(prev => prev.filter(k => k !== key));
      await fetchStrategies(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleExecutionKey = (key: string) => {
    if (activeExecutionKeys.includes(key)) {
      if (activeExecutionKeys.length > 1) {
        setActiveExecutionKeys(prev => prev.filter(k => k !== key));
      } else {
        alert("You must keep at least 1 strategy active for execution.");
      }
    } else {
      setActiveExecutionKeys(prev => [...prev, key]);
    }
  };

  const handleRunSimultaneous = async () => {
    if (!token) return;
    if (activeExecutionKeys.length === 0) {
      setError("Please select at least one strategy checkbox to run simultaneously.");
      return;
    }
    setSimultaneousRunning(true);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`${API_BASE}/strategies/run-simultaneous`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ strategy_keys: activeExecutionKeys })
      });
      if (!res.ok) throw new Error("Simultaneous multi-strategy execution failed");
      const data = await res.json();
      setSimultaneousResults(data.execution_summary);
      setSuccessMsg(`⚡ Executed ${activeExecutionKeys.length} strategies simultaneously in parallel (${data.execution_summary?.total_latency_ms || 12}ms). All market prices and time-based triggers verified!`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSimultaneousRunning(false);
    }
  };

  const handleSaveActiveExecutionSet = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/strategies/set-active-execution`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ strategy_keys: activeExecutionKeys })
      });
      if (!res.ok) throw new Error("Failed to save execution configuration");
      setSuccessMsg("Active execution strategy suite saved successfully.");
      await fetchStrategies(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Selected Strategy object
  const currentStrategy = strategies.find((s) => s.key === selectedStrategyKey) || strategies[0];

  // =========================================================================
  // VIEW 1: LOGIN (NO CLICK-BASED PRESETS, EXPLICIT CREDENTIAL ENTRY)
  // =========================================================================
  if (!userProfile) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: '#07090e' }}>
        <div className="ui-card animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1.6rem' }}>
            <div style={LOGO_STYLE}>AA</div>
            <div>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: '1.05rem' }}>Astra Algo</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Nifty 50 opening-range breakout desk</div>
            </div>
          </div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', marginBottom: '1.2rem' }}>Sign in</h1>

          {error && (
            <div id="login-error-alert" className="notice warn" style={{ marginBottom: '1rem' }}>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="form-label" htmlFor="input-username">Username</label>
              <input id="input-username" className="form-input" type="text" autoComplete="username" value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)} required />
            </div>
            <div>
              <label className="form-label" htmlFor="input-password">Password</label>
              <input id="input-password" className="form-input" type="password" autoComplete="current-password" value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)} required />
            </div>
            <button id="btn-login" type="submit" className="btn btn-primary" disabled={loading} style={{ padding: '0.75rem', marginTop: '0.3rem', fontSize: '0.9rem' }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p style={{ marginTop: '1.2rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            Access is limited to authorised users. Ask an admin to create your account.
          </p>
        </div>
      </main>
    );
  }

  // Values shared by the header, dashboard and system pages
  const tradingMode: string = strategyStatusData?.trading_mode || 'paper';
  const brokerStatus: string | undefined = healthData?.services?.upstox?.status;
  const brokerOk = brokerStatus === 'CONNECTED';
  const marketOpen = istMarketOpen();
  const sessionDate: string | undefined = (phase2Data as any)?.session_date || (phase1Data as any)?.session_date || tradesSummary?.session_date;
  const setupsCount: number = (phase2Data as any)?.breakouts_confirmed ?? 0;
  const sessionPnl: number | null = tradesSummary ? (tradesSummary.realized_pnl || 0) + (tradesSummary.unrealized_pnl || 0) : null;
  const isAdmin = userProfile.role === 'super_admin' || userProfile.role === 'admin';
  const anyRunBusy = isExecutingPhase1 || isExecutingPhase2 || isExecutingPipeline;
  const navGroups: { label: string; items: { key: typeof currentNav; label: string; icon: React.ReactNode; onClick?: () => void }[] }[] = [
    {
      label: 'Trading',
      items: [
        { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
        { key: 'charts', label: 'Live Charts', icon: <Activity size={17} /> },
      ],
    },
    {
      label: 'Strategies',
      items: [
        { key: 'strategies', label: `Strategies (${strategies.length})`, icon: <TrendingUp size={17} /> },
        { key: 'builder', label: 'Strategy Studio', icon: <Sparkles size={17} />, onClick: () => { setStudioMode('create'); setEditingStratKey(null); } },
        { key: 'backtest', label: 'Backtesting', icon: <FlaskConical size={17} /> },
        { key: 'runner', label: 'Multi-strategy Runner', icon: <Zap size={17} /> },
      ],
    },
    {
      label: 'Admin',
      items: [
        { key: 'audit', label: 'Alerts Log', icon: <History size={17} /> },
        ...(isAdmin ? [{ key: 'users' as const, label: 'Users & Roles', icon: <Users size={17} /> }] : []),
        { key: 'system', label: 'System Status', icon: <Server size={17} /> },
        { key: 'account', label: 'My Account', icon: <KeyRound size={17} /> },
      ],
    },
  ];
  // =========================================================================
  // VIEW 2: LOGGED-IN TERMINAL WITH PERSISTENT SIDEBAR
  // =========================================================================
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0d14', color: '#f1f5f9' }}>
      {/* ===================== SIDEBAR ===================== */}
      <aside
        id="app-sidebar"
        style={{
          width: '232px', flexShrink: 0, background: 'rgba(12, 16, 26, 0.98)', borderRight: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'sticky', top: 0, height: '100vh', zIndex: 40,
        }}
      >
        <div style={{ overflowY: 'auto' }}>
          <div style={{ padding: '1.1rem 1rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={LOGO_STYLE}>AA</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>Astra Algo</div>
              <div className="mono" style={{ fontSize: '0.66rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}><IstClock /></div>
            </div>
          </div>
          <nav style={{ padding: '0.2rem 0.6rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            {navGroups.map((group) => (
              <React.Fragment key={group.label}>
                <div className="nav-group-label">{group.label}</div>
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    id={`nav-${item.key}`}
                    onClick={() => { item.onClick?.(); setCurrentNav(item.key); }}
                    className={`sidebar-link ${currentNav === item.key ? 'active' : ''}`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </React.Fragment>
            ))}
          </nav>
        </div>

        <div style={{ padding: '0.9rem 1rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ minWidth: 0 }}>
            <div id="user-display-name" style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userProfile.username}</div>
            <div id="user-role-badge" style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'capitalize' }}>{userProfile.role.replace('_', ' ')}</div>
          </div>
          <button id="btn-logout" onClick={handleLogout} className="btn" title="Sign out" style={{ padding: '0.4rem 0.6rem' }}>
            <LogOut size={14} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ===================== MAIN CONTENT WRAPPER ===================== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          style={{
            minHeight: '60px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(10, 13, 20, 0.85)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
            padding: '0.6rem 2rem', position: 'sticky', top: 0, zIndex: 30,
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>{PAGE_META[currentNav]?.title}</h2>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>{PAGE_META[currentNav]?.sub}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className={`chip ${marketOpen ? 'good' : ''}`}>Market {marketOpen ? 'open' : 'closed'}</span>
            <span className={`chip ${tradingMode === 'live' ? 'bad' : 'warn'}`} title={tradingMode === 'live' ? 'Real orders are sent to Upstox' : 'Trades are simulated; no orders are sent'}>
              {tradingMode.toUpperCase()} mode
            </span>
            <span className={`chip ${brokerOk ? 'good' : 'bad'}`} title="Upstox broker session">
              Upstox {brokerStatus ? brokerStatus.toLowerCase() : 'checking…'}
            </span>
          </div>
        </header>
        {/* Alerts / Feedback Banner */}
        <div style={{ padding: '1rem 2rem 0 2rem' }}>
          {successMsg && (
            <div
              id="status-success-banner"
              className="animate-fade-in"
              style={{
                padding: '0.8rem 1.2rem',
                background: 'var(--accent-green-bg)',
                border: '1px solid var(--accent-green)',
                borderRadius: '8px',
                color: '#a7f3d0',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>✅ {successMsg}</span>
              <button onClick={() => setSuccessMsg('')} style={{ background: 'none', border: 'none', color: '#a7f3d0', cursor: 'pointer' }}>✕</button>
            </div>
          )}

          {error && (
            <div
              id="status-error-banner"
              className="animate-fade-in"
              style={{
                padding: '0.8rem 1.2rem',
                background: 'var(--accent-red-bg)',
                border: '1px solid var(--accent-red)',
                borderRadius: '8px',
                color: '#fca5a5',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>⚠️ {error}</span>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer' }}>✕</button>
            </div>
          )}
        </div>

        {/* Content Body */}
        <main style={{ flex: 1, padding: '1rem 2rem 2.5rem 2rem', maxWidth: '1440px', width: '100%' }}>

          {/* =========================================================================
              SECTION 1: DASHBOARD
              ========================================================================= */}
          {currentNav === 'dashboard' && (
            <div className="animate-fade-in ui-stack">
              {/* Broker session warning */}
              {healthData && !brokerOk && (
                <div className="notice warn">
                  <span>
                    <b>Upstox session {brokerStatus === 'EXPIRED' ? 'expired' : 'not connected'}.</b> Prices are coming from the public
                    Yahoo feed and no broker orders can be placed until you re-authorise.
                  </span>
                  <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <a className="btn btn-primary" href={`${API_BASE}/auth/login`} target="_blank" rel="noreferrer">Re-authorise Upstox</a>
                    <button className="btn" onClick={handleSendWhatsAppAuthButton} disabled={loading}>Send link to WhatsApp</button>
                  </span>
                </div>
              )}

              {/* Key numbers */}
              <div className="kpi-grid">
                <div className={`kpi ${marketOpen ? 'good' : ''}`}>
                  <div className="kpi-label">Market</div>
                  <div className="kpi-value">{marketOpen ? 'Open' : 'Closed'}</div>
                  <div className="kpi-sub">NSE 09:15 – 15:30 IST</div>
                </div>
                <div className={`kpi ${tradingMode === 'live' ? 'bad' : 'warn'}`}>
                  <div className="kpi-label">Trading mode</div>
                  <div className="kpi-value">{tradingMode.toUpperCase()}</div>
                  <div className="kpi-sub">{tradingMode === 'live' ? 'Real broker orders' : 'Simulated — no orders sent'}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Session</div>
                  <div className="kpi-value">{sessionDate || '–'}</div>
                  <div className="kpi-sub">{(phase2Data as any)?.run_mode ? `Last run: ${humanize((phase2Data as any).run_mode)}` : 'Not run yet'}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">Opened below PDH</div>
                  <div className="kpi-value">{phase1Data ? `${phase1Data.tracked_stocks_count} / ${phase1Data.total_universe_scanned}` : '–'}</div>
                  <div className="kpi-sub">Phase 1 candidates</div>
                </div>
                <div className={`kpi ${setupsCount > 0 ? 'good' : ''}`}>
                  <div className="kpi-label">Setups</div>
                  <div className="kpi-value">{phase2Data ? setupsCount : '–'}</div>
                  <div className="kpi-sub">09:15 close above PDH</div>
                </div>
                <div className={`kpi ${sessionPnl === null ? '' : sessionPnl > 0 ? 'good' : sessionPnl < 0 ? 'bad' : ''}`}>
                  <div className="kpi-label">Session P&amp;L</div>
                  <div className="kpi-value">{sessionPnl === null ? '–' : fmtSigned(sessionPnl)}</div>
                  <div className="kpi-sub">{tradesSummary ? `W ${tradesSummary.wins} · L ${tradesSummary.losses} · before charges` : 'No trades yet'}</div>
                </div>
              </div>

              {/* Today's run: rules + manual controls */}
              <div className="ui-card">
                <div className="ui-card-head">
                  <div>
                    <div className="ui-card-title">Opening-range breakout · today&apos;s run</div>
                    <div className="ui-card-sub">
                      Runs automatically at 09:15 (Phase 1) and 09:16 (Phase 2), Mon–Fri. Manual runs after 09:45 are replays:
                      simulated on real candles, with no orders and no alerts.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button id="btn-phase1" className="btn" onClick={handleTriggerPhase1} disabled={anyRunBusy}>
                      {isExecutingPhase1 ? 'Running…' : 'Run Phase 1'}
                    </button>
                    <button id="btn-phase2" className="btn" onClick={handleTriggerPhase2} disabled={anyRunBusy}>
                      {isExecutingPhase2 ? 'Running…' : 'Run Phase 2'}
                    </button>
                    <button id="btn-pipeline" className="btn btn-primary" onClick={handleTriggerPipeline} disabled={anyRunBusy}>
                      <Play size={14} />
                      {isExecutingPipeline ? 'Running…' : 'Run full scan'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.6rem' }}>
                  {[
                    ['Qualify', 'Open < PDH and 09:15 close > PDH'],
                    ['Entry', 'Buy stop at the 09:15 high'],
                    ['Stop loss', 'The 09:15 low'],
                    ['Target', 'Entry + 2 × (high − low)'],
                    ['Exit', 'Target, stop, or 15:15 square-off'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '0.55rem 0.7rem' }}>
                      <div className="kpi-label">{k}</div>
                      <div style={{ fontSize: '0.8rem', color: '#e2e8f0', marginTop: 3 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live market: watchlist + 1-min chart with strategy levels + session trades */}
              <div id="live-market" style={{ scrollMarginTop: '1rem' }}>
                {token && (
                  <LiveMarketPanel
                    apiBase={API_BASE}
                    token={token}
                    symbol={chartSymbol}
                    onSymbolChange={setChartSymbol}
                    chartHeight={420}
                    onUnauthorized={handleUnauthorized}
                  />
                )}
              </div>

              {/* Signal details */}
              <div className="ui-grid-2">
                <div className="ui-card">
                  <div className="ui-card-head">
                    <div>
                      <div className="ui-card-title">Phase 1 · open vs previous-day high</div>
                      <div className="ui-card-sub">
                        {phase1Data ? `Session ${(phase1Data as any).session_date} · ${humanize((phase1Data as any).run_mode)} · click a row to chart it` : 'Not run yet for this session'}
                      </div>
                    </div>
                    <div className="seg">
                      <button className={phase1ActiveTab === 'tracked' ? 'on' : ''} onClick={() => setPhase1ActiveTab('tracked')}>
                        Tracked ({phase1Data?.tracked_stocks_count ?? 0})
                      </button>
                      <button className={phase1ActiveTab === 'disqualified' ? 'on' : ''} onClick={() => setPhase1ActiveTab('disqualified')}>
                        Excluded ({phase1Data?.disqualified_stocks_count ?? 0})
                      </button>
                    </div>
                  </div>
                  <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th className="num">Open</th>
                          <th className="num">PDH</th>
                          <th className="num">Open − PDH</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {((phase1ActiveTab === 'tracked' ? phase1Data?.tracked_stocks : phase1Data?.disqualified_stocks) || []).map((s: any) => (
                          <tr key={s.symbol} className="clickable" onClick={() => openChart(s.symbol)}>
                            <td className="sym">{s.symbol}</td>
                            <td className="num">{fmtNum(s.open_price)}</td>
                            <td className="num">{fmtNum(s.prev_day_high)}</td>
                            <td className="num" style={{ color: s.delta_from_pdh == null ? undefined : s.delta_from_pdh < 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                              {s.delta_from_pdh == null ? '–' : `${s.delta_from_pdh > 0 ? '+' : ''}${fmtNum(s.delta_from_pdh)}`}
                            </td>
                            <td>
                              <span className={`chip ${s.is_eligible ? 'good' : s.status === 'NO_DATA' ? 'warn' : ''}`}>
                                {s.status === 'OPEN_PENDING' ? 'Open pending' : s.is_eligible ? 'Tracked' : s.status === 'NO_DATA' ? 'No data' : 'Gapped above'}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {!((phase1ActiveTab === 'tracked' ? phase1Data?.tracked_stocks : phase1Data?.disqualified_stocks) || []).length && (
                          <tr><td colSpan={5} className="empty">{phase1Data ? 'No stocks in this list.' : 'Run Phase 1 to see candidates.'}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="ui-card">
                  <div className="ui-card-head">
                    <div>
                      <div className="ui-card-title">Phase 2 · 09:15 candle close</div>
                      <div className="ui-card-sub">
                        {phase2Data ? `${(phase2Data as any).total_tracked_stocks_evaluated} candidates evaluated · ${setupsCount} setup(s)` : 'Not run yet for this session'}
                      </div>
                    </div>
                    <div className="seg">
                      <button className={phase2View === 'setups' ? 'on' : ''} onClick={() => setPhase2View('setups')}>Setups</button>
                      <button className={phase2View === 'all' ? 'on' : ''} onClick={() => setPhase2View('all')}>All evaluated</button>
                    </div>
                  </div>
                  <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th className="num">09:15 O</th>
                          <th className="num">09:15 C</th>
                          <th className="num">PDH</th>
                          <th className="num">Entry</th>
                          <th className="num">SL</th>
                          <th className="num">Target</th>
                          <th>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(phase2View === 'setups'
                          ? phase2Data?.breakout_stocks || []
                          : [...(phase2Data?.breakout_stocks || []), ...(phase2Data?.non_breakout_stocks || [])]
                        ).map((e: any) => (
                          <tr key={e.symbol} className="clickable" onClick={() => openChart(e.symbol)}>
                            <td className="sym">{e.symbol}</td>
                            <td className="num">{fmtNum(e.candle?.open)}</td>
                            <td className="num">{fmtNum(e.candle?.close)}</td>
                            <td className="num">{fmtNum(e.prev_day_high)}</td>
                            <td className="num" style={{ color: 'var(--accent-teal)' }}>{fmtNum(e.entry_order_level)}</td>
                            <td className="num" style={{ color: 'var(--accent-red)' }}>{fmtNum(e.stop_loss_level)}</td>
                            <td className="num" style={{ color: 'var(--accent-green)' }}>{fmtNum(e.take_profit_level)}</td>
                            <td>
                              {e.setup_detected ? (
                                <span className={`chip ${toneFor(e.order_execution?.status) || 'good'}`}>
                                  {e.order_execution ? `${humanize(e.order_execution.status)} · ${e.order_execution.mode}` : 'Setup'}
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>{e.reason || 'No setup'}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {!(phase2View === 'setups' ? phase2Data?.breakout_stocks?.length : (phase2Data?.breakout_stocks?.length || 0) + (phase2Data?.non_breakout_stocks?.length || 0)) && (
                          <tr><td colSpan={8} className="empty">{phase2Data ? 'No setups for this session.' : 'Run Phase 2 to evaluate the 09:15 candle.'}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Order log */}
              <div className="ui-card">
                <div className="ui-card-head">
                  <div>
                    <div className="ui-card-title">Order log</div>
                    <div className="ui-card-sub">Most recent recorded setups across sessions (live, paper and replay)</div>
                  </div>
                  <span className="chip">{strategyOrders.length} records</span>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Session</th>
                        <th>Symbol</th>
                        <th>Mode</th>
                        <th className="num">Qty</th>
                        <th className="num">Entry</th>
                        <th className="num">SL</th>
                        <th className="num">Target</th>
                        <th className="num">Fill</th>
                        <th className="num">Exit</th>
                        <th className="num">P&amp;L</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {strategyOrders.slice(0, 15).map((o: any, idx) => (
                        <tr key={o.id ?? idx} className="clickable" onClick={() => openChart(o.symbol)}>
                          <td className="mono" style={{ color: 'var(--text-muted)' }}>{o.session_date || (o.timestamp || '').slice(0, 10)}</td>
                          <td className="sym">{o.symbol}</td>
                          <td><span className={`chip ${toneFor(o.mode)}`}>{o.mode || '–'}</span></td>
                          <td className="num">{o.quantity ?? '–'}</td>
                          <td className="num">{fmtNum(o.entry_price)}</td>
                          <td className="num">{fmtNum(o.stop_loss)}</td>
                          <td className="num">{fmtNum(o.target_price)}</td>
                          <td className="num">{fmtNum(o.entry_fill_price)}</td>
                          <td className="num">{fmtNum(o.exit_price)}</td>
                          <td className="num" style={{ color: o.pnl == null ? undefined : o.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                            {o.pnl == null ? '–' : fmtSigned(o.pnl)}
                          </td>
                          <td><span className={`chip ${toneFor(o.status)}`}>{humanize(o.status)}</span></td>
                        </tr>
                      ))}
                      {strategyOrders.length === 0 && (
                        <tr><td colSpan={11} className="empty">No orders recorded yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {/* =========================================================================
              SECTION 2: STRATEGIES PAGE (DROPDOWN + COMPARISON MODE)
              ========================================================================= */}
          {currentNav === 'charts' && token && (
            <div id="live-market" className="animate-fade-in">
              <LiveMarketPanel
                apiBase={API_BASE}
                token={token}
                symbol={chartSymbol}
                onSymbolChange={setChartSymbol}
                chartHeight={600}
                onUnauthorized={handleUnauthorized}
              />
            </div>
          )}

          {currentNav === 'strategies' && (
            <div className="animate-fade-in">
              {/* Header Bar with Strategy Selector Dropdown */}
              <div
                className="glass-panel"
                style={{
                  padding: '1.4rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <TrendingUp size={18} style={{ color: 'var(--accent-cyan)' }} />
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>
                      Algorithmic Trading Strategies Engine
                    </h3>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Inspect individual strategies with deep mathematical thesis, or enable multi-strategy comparison.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  {/* Strategy Dropdown (First strategy always selected by default) */}
                  <div style={{ minWidth: '280px' }}>
                    <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.2rem', textTransform: 'uppercase' }}>
                      Select Active Strategy:
                    </label>
                    <select
                      id="select-active-strategy"
                      value={selectedStrategyKey}
                      onChange={(e) => setSelectedStrategyKey(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.8rem',
                        background: '#121826',
                        border: '1px solid var(--accent-cyan)',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        outline: 'none',
                      }}
                    >
                      {strategies.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.name}{s.win_rate != null ? ` (${s.win_rate}%)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Multi-strategy compare mode button */}
                  <button
                    id="btn-toggle-compare-mode"
                    onClick={() => {
                      const next = !compareMode;
                      setCompareMode(next);
                      if (next) handleCompareStrategies();
                    }}
                    style={{
                      padding: '0.65rem 1rem',
                      background: compareMode ? 'rgba(0,242,254,0.15)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${compareMode ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                      borderRadius: '6px',
                      color: compareMode ? 'var(--accent-cyan)' : '#fff',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      marginTop: '1rem',
                    }}
                  >
                    <Layers size={16} />
                    <span>{compareMode ? 'Exit Comparison' : 'Compare Strategies'}</span>
                  </button>

                  {/* Direct button to AI Strategy Studio */}
                  <button
                    id="btn-open-studio"
                    onClick={() => {
                      setCurrentNav('builder');
                      setStudioMode('create');
                      setEditingStratKey(null);
                    }}
                    style={{
                      padding: '0.65rem 1.1rem',
                      background: 'linear-gradient(135deg, rgba(0,242,254,0.2) 0%, rgba(79,172,254,0.15) 100%)',
                      border: '1px solid var(--accent-cyan)',
                      borderRadius: '6px',
                      color: 'var(--accent-cyan)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      marginTop: '1rem',
                      boxShadow: '0 0 15px rgba(0,242,254,0.15)',
                    }}
                  >
                    <Sparkles size={16} />
                    <span>➕ Add & Edit with AI Studio</span>
                  </button>

                  {/* Direct button to Simultaneous Runner */}
                  <button
                    id="btn-open-runner"
                    onClick={() => setCurrentNav('runner')}
                    style={{
                      padding: '0.65rem 1rem',
                      background: 'rgba(250,204,21,0.08)',
                      border: '1px solid rgba(250,204,21,0.3)',
                      borderRadius: '6px',
                      color: '#facc15',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      marginTop: '1rem',
                    }}
                  >
                    <Zap size={16} />
                    <span>⚡ Run Simultaneously</span>
                  </button>
                </div>
              </div>

              {/* MULTI-STRATEGY COMPARISON VIEW */}
              {compareMode ? (
                <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                    <div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                        Side-by-Side Multi-Strategy Comparison Matrix
                      </h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Select 1 or more strategies below to compare their win rates, hits, profit factors, and drawdowns.
                      </p>
                    </div>
                    <button
                      id="btn-run-comparison"
                      onClick={handleCompareStrategies}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#030816',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      Calculate Comparison Matrix
                    </button>
                  </div>

                  {/* Multi-select strategy pills */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.25)', borderRadius: '8px' }}>
                    {strategies.map((stk) => {
                      const isSelected = selectedForComparison.includes(stk.key);
                      return (
                        <button
                          key={stk.key}
                          onClick={() => toggleComparisonKey(stk.key)}
                          style={{
                            padding: '0.45rem 0.9rem',
                            borderRadius: '20px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            background: isSelected ? 'rgba(0,242,254,0.15)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${isSelected ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                            color: isSelected ? 'var(--accent-cyan)' : 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          {isSelected ? '✓ ' : '+ '} {stk.name}
                        </button>
                      );
                    })}
                  </div>

                  {/* Top Performer Banner */}
                  {comparisonResults && (
                    <div style={{ padding: '1rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Overall Highest Quant Score:</span>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--accent-green)' }}>
                          🏆 {comparisonResults.top_pick}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8rem' }}>
                        <div><span style={{ color: 'var(--text-dim)' }}>Highest Win Rate:</span> <b style={{ color: '#fff' }}>{comparisonResults.best_winrate_strategy}</b></div>
                        <div><span style={{ color: 'var(--text-dim)' }}>Lowest Drawdown:</span> <b style={{ color: '#fff' }}>{comparisonResults.lowest_drawdown_strategy}</b></div>
                      </div>
                    </div>
                  )}

                  {/* Comparison Table */}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '0.8rem' }}>Strategy Name</th>
                          <th style={{ padding: '0.8rem' }}>Timeframe</th>
                          <th style={{ padding: '0.8rem' }}>Win Rate %</th>
                          <th style={{ padding: '0.8rem' }}>Correct Hits / Checks</th>
                          <th style={{ padding: '0.8rem' }}>Profit Factor</th>
                          <th style={{ padding: '0.8rem' }}>Sharpe Ratio</th>
                          <th style={{ padding: '0.8rem' }}>Sortino Ratio</th>
                          <th style={{ padding: '0.8rem' }}>Calmar Ratio</th>
                          <th style={{ padding: '0.8rem' }}>Expectancy (₹)</th>
                          <th style={{ padding: '0.8rem' }}>Max Drawdown</th>
                          <th style={{ padding: '0.8rem' }}>Avg Gain</th>
                          <th style={{ padding: '0.8rem' }}>Win / Loss</th>
                          <th style={{ padding: '0.8rem' }}>Best Symbol</th>
                          <th style={{ padding: '0.8rem' }}>R:R</th>
                        </tr>
                      </thead>
                      <tbody>
                        {strategies
                          .filter((s) => selectedForComparison.includes(s.key))
                          .map((s) => (
                            <tr key={s.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '0.9rem 0.8rem', fontWeight: 700, color: '#fff' }}>
                                {s.name}
                              </td>
                              <td style={{ padding: '0.9rem 0.8rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                {s.timeframe}
                              </td>
                              <td style={{ padding: '0.9rem 0.8rem' }}>
                                <span className="mono" style={{ color: (s.win_rate ?? 0) >= 70 ? 'var(--accent-green)' : 'var(--accent-cyan)', fontWeight: 700 }}>
                                  {s.win_rate != null ? `${s.win_rate}%` : '–'}
                                </span>
                              </td>
                              <td className="mono" style={{ padding: '0.9rem 0.8rem' }}>
                                <b style={{ color: '#fff' }}>{s.correct_hits ?? '–'}</b> / <span style={{ color: 'var(--text-dim)' }}>{s.total_checks ?? '–'}</span>
                              </td>
                              <td className="mono" style={{ padding: '0.9rem 0.8rem', color: 'var(--accent-green)', fontWeight: 600 }}>
                                {s.profit_factor != null ? `${s.profit_factor}x` : '–'}
                              </td>
                              <td className="mono" style={{ padding: '0.9rem 0.8rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                                {s.sharpe_ratio ?? '–'}
                              </td>
                              <td className="mono" style={{ padding: '0.9rem 0.8rem', color: '#a78bfa', fontWeight: 600 }}>
                                {s.sortino_ratio ?? '–'}
                              </td>
                              <td className="mono" style={{ padding: '0.9rem 0.8rem', color: '#f59e0b', fontWeight: 600 }}>
                                {s.calmar_ratio ?? '–'}
                              </td>
                              <td className="mono" style={{ padding: '0.9rem 0.8rem', color: 'var(--accent-green)' }}>
                                {s.profit_expectancy != null ? `₹${s.profit_expectancy.toLocaleString('en-IN')}` : '–'}
                              </td>
                              <td className="mono" style={{ padding: '0.9rem 0.8rem', color: '#fca5a5' }}>
                                {s.max_drawdown != null ? `-${s.max_drawdown}%` : '–'}
                              </td>
                              <td className="mono" style={{ padding: '0.9rem 0.8rem', color: 'var(--accent-cyan)' }}>
                                {s.avg_return_per_trade != null ? `${s.avg_return_per_trade >= 0 ? '+' : ''}${s.avg_return_per_trade}%` : '–'}
                              </td>
                              <td className="mono" style={{ padding: '0.9rem 0.8rem', color: 'var(--text-muted)' }}>
                                {s.win_loss_ratio != null ? `${s.win_loss_ratio}:1` : '–'}
                              </td>
                              <td className="mono" style={{ padding: '0.9rem 0.8rem', color: '#fff', fontWeight: 700 }}>
                                {s.best_symbol ?? '–'}
                              </td>
                              <td className="mono" style={{ padding: '0.9rem 0.8rem', color: 'var(--text-dim)' }}>
                                {s.risk_reward}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* SINGLE STRATEGY DEEP-DIVE VIEW */
                currentStrategy && (
                  <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem', alignItems: 'start' }}>
                    {/* Left: Strategy Rules & Thesis */}
                    <div className="glass-panel" style={{ padding: '1.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.8rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
                              {currentStrategy.name}
                            </h3>
                            <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(0,242,254,0.1)', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                              {currentStrategy.category}
                            </span>
                            {currentStrategy.created_by && currentStrategy.created_by !== 'system' && (
                              <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(168,85,247,0.15)', color: '#c084fc', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Sparkles size={11} /> AI / Custom
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                            Execution Schedule: <b style={{ color: '#fff' }}>{currentStrategy.timeframe}</b>
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => handleEditStrategy(currentStrategy)}
                            style={{
                              padding: '0.35rem 0.75rem',
                              borderRadius: '6px',
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid var(--border-subtle)',
                              color: '#fff',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem'
                            }}
                          >
                            <Edit3 size={13} />
                            <span>Edit in Studio</span>
                          </button>
                          <span style={{ padding: '0.35rem 0.75rem', borderRadius: '20px', background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green)', fontSize: '0.75rem', fontWeight: 700 }}>
                            ACTIVE IN ENGINE
                          </span>
                        </div>
                      </div>

                      {/* Explanation */}
                      <div style={{ marginBottom: '1.5rem' }}>
                        <h4 style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem', fontWeight: 700 }}>
                          Strategy Methodology & Quantitative Thesis
                        </h4>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: '1.6', background: 'rgba(0,0,0,0.25)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                          {currentStrategy.description}
                        </p>
                      </div>

                      {/* Entry & Exit Rules */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem', marginBottom: '1.5rem' }}>
                        <div style={{ padding: '1.1rem', background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px' }}>
                          <h5 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-green)', marginBottom: '0.6rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <CheckCircle2 size={14} /> Entry Rules (Long Execution)
                          </h5>
                          <pre style={{ fontSize: '0.8rem', color: '#e2e8f0', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontFamily: 'inherit' }}>
                            {currentStrategy.entry_rules}
                          </pre>
                        </div>

                        <div style={{ padding: '1.1rem', background: 'rgba(244,63,94,0.04)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '8px' }}>
                          <h5 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fca5a5', marginBottom: '0.6rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <ShieldCheck size={14} /> Exit & Risk Clamps ({currentStrategy.risk_reward} R:R)
                          </h5>
                          <pre style={{ fontSize: '0.8rem', color: '#e2e8f0', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontFamily: 'inherit' }}>
                            {currentStrategy.exit_rules}
                          </pre>
                        </div>
                      </div>
                    </div>

                    {/* Right: recorded metrics */}
                    <div className="glass-panel" style={{ padding: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                          Comprehensive Metrics
                        </h4>
                        {currentStrategy.metrics_source === 'backtest' ? (
                          <span className="chip good" title={`Updated ${currentStrategy.metrics_updated_at ?? ''}`}>
                            Backtested · {currentStrategy.metrics_period}
                          </span>
                        ) : currentStrategy.backtest_supported ? (
                          <button className="btn btn-primary" style={{ padding: '0.3rem 0.7rem' }} onClick={() => openBacktest(currentStrategy.key)}>
                            Run backtest
                          </button>
                        ) : (
                          <span className="chip warn" title="Rules are free text; a coded rule set is needed before it can be backtested.">
                            Not backtestable yet
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {/* Win Rate Primary Hero */}
                        <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', textAlign: 'center' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Historical Win Rate
                          </span>
                          <div className="mono" style={{ fontSize: '2.3rem', fontWeight: 900, color: 'var(--accent-green)', margin: '0.2rem 0' }}>
                            {currentStrategy.win_rate != null ? `${currentStrategy.win_rate}%` : '–'}
                          </div>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                            {currentStrategy.metrics_source === 'backtest'
                              ? `${currentStrategy.total_checks ?? 0} backtested trades`
                              : 'Run a backtest to measure this'}
                          </span>
                        </div>

                        {/* Hits vs False */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                          <div style={{ padding: '0.7rem', background: 'rgba(0,0,0,0.35)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', display: 'block' }}>Correct Hits</span>
                            <span className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--accent-green)' }}>{currentStrategy.correct_hits ?? '–'}</span>
                          </div>
                          <div style={{ padding: '0.7rem', background: 'rgba(0,0,0,0.35)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', display: 'block' }}>False Signals</span>
                            <span className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fca5a5' }}>{currentStrategy.false_signals ?? '–'}</span>
                          </div>
                        </div>

                        {/* Profit Factor & Drawdown */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                          <div style={{ padding: '0.7rem', background: 'rgba(0,0,0,0.35)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', display: 'block' }}>Profit Factor</span>
                            <span className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--accent-green)' }}>{currentStrategy.profit_factor != null ? `${currentStrategy.profit_factor}x` : '–'}</span>
                          </div>
                          <div style={{ padding: '0.7rem', background: 'rgba(0,0,0,0.35)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', display: 'block' }}>Max Drawdown</span>
                            <span className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fca5a5' }}>{currentStrategy.max_drawdown != null ? `-${currentStrategy.max_drawdown}%` : '–'}</span>
                          </div>
                        </div>

                        {/* Sharpe & Sortino */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                          <div style={{ padding: '0.7rem', background: 'rgba(0,0,0,0.35)', borderRadius: '6px', border: '1px solid rgba(0,242,254,0.15)' }}>
                            <span style={{ fontSize: '0.68rem', color: 'var(--accent-cyan)', display: 'block', fontWeight: 600 }}>Sharpe Ratio</span>
                            <span className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>{currentStrategy.sharpe_ratio ?? '–'}</span>
                          </div>
                          <div style={{ padding: '0.7rem', background: 'rgba(0,0,0,0.35)', borderRadius: '6px', border: '1px solid rgba(167,139,250,0.2)' }}>
                            <span style={{ fontSize: '0.68rem', color: '#c084fc', display: 'block', fontWeight: 600 }}>Sortino Ratio</span>
                            <span className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>{currentStrategy.sortino_ratio ?? '–'}</span>
                          </div>
                        </div>

                        {/* Calmar & Expectancy */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                          <div style={{ padding: '0.7rem', background: 'rgba(0,0,0,0.35)', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.2)' }}>
                            <span style={{ fontSize: '0.68rem', color: '#f59e0b', display: 'block', fontWeight: 600 }}>Calmar Ratio</span>
                            <span className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>{currentStrategy.calmar_ratio ?? '–'}</span>
                          </div>
                          <div style={{ padding: '0.7rem', background: 'rgba(0,0,0,0.35)', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.2)' }}>
                            <span style={{ fontSize: '0.68rem', color: 'var(--accent-green)', display: 'block', fontWeight: 600 }}>Profit Expectancy</span>
                            <span className="mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>{currentStrategy.profit_expectancy != null ? `₹${currentStrategy.profit_expectancy.toLocaleString('en-IN')}` : '–'}</span>
                          </div>
                        </div>

                        {/* Win/Loss & Avg Return */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.78rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Win / Loss Ratio:</span>
                          <span className="mono" style={{ color: '#fff', fontWeight: 700 }}>{currentStrategy.win_loss_ratio != null ? `${currentStrategy.win_loss_ratio} : 1` : '–'}</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.78rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Avg Trade Gain:</span>
                          <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{currentStrategy.avg_return_per_trade != null ? `${currentStrategy.avg_return_per_trade >= 0 ? '+' : ''}${currentStrategy.avg_return_per_trade}%` : '–'}</span>
                        </div>

                        {/* Max Consecutive Wins & Losses */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.78rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Max Streak (Win / Loss):</span>
                          <span className="mono" style={{ color: '#fff', fontWeight: 700 }}>
                            <span style={{ color: 'var(--accent-green)' }}>{currentStrategy.max_consecutive_wins ?? '–'}W</span> / <span style={{ color: '#fca5a5' }}>{currentStrategy.max_consecutive_losses ?? '–'}L</span>
                          </span>
                        </div>

                        {/* Top Symbol & R:R */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.78rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Top Alpha Symbol:</span>
                          <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: 800 }}>{currentStrategy.best_symbol ?? '–'}</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.78rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Target R:R Ratio:</span>
                          <span className="mono" style={{ color: '#fff', fontWeight: 700 }}>{currentStrategy.risk_reward}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* =========================================================================
              SECTION 3: STRATEGY STUDIO & AI QUANT SYNTHESIZER (ADD & EDIT)
              ========================================================================= */}
          {currentNav === 'builder' && (
            <div className="animate-fade-in">
              {/* Studio Header */}
              <div
                className="glass-panel"
                style={{
                  padding: '1.4rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                    <Sparkles size={20} style={{ color: 'var(--accent-cyan)' }} />
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
                      Strategy Studio & AI Quant Synthesizer
                    </h3>
                    <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(0,242,254,0.1)', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                      NATURAL LANGUAGE → QUANT RULES
                    </span>
                    <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontWeight: 700, border: '1px solid rgba(59,130,246,0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      🤖 POWERED BY GOOGLE GEMINI 2.5 FLASH
                    </span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Explain your strategy through words or voice recording. The AI deduction engine will formulate the indicators, entry/exit math, timeframe, and backtest projections. Review and confirm the description before saving.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <button
                    onClick={() => {
                      setStudioMode('create');
                      setEditingStratKey(null);
                      setStrategyForm({
                        key: `strategy_${Date.now().toString().slice(-4)}`,
                        name: '',
                        category: 'Intraday Momentum Breakout',
                        timeframe: '1-Min (09:15 candle evaluated at 09:16 AM)',
                        description: '',
                        entry_rules: '',
                        exit_rules: '',
                        risk_reward: '1:2',
                      });
                      setAiDeducedDraft(null);
                      setAiPrompt('');
                    }}
                    style={{
                      padding: '0.55rem 0.9rem',
                      background: studioMode === 'create' ? 'rgba(0,242,254,0.15)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${studioMode === 'create' ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                      borderRadius: '6px',
                      color: studioMode === 'create' ? 'var(--accent-cyan)' : '#fff',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <PlusCircle size={15} />
                    <span>Create New Strategy</span>
                  </button>
                </div>
              </div>

              {/* Main Studio Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
                {/* Left: Ideation Box (Words / Speech Input & AI Generator) */}
                <div className="glass-panel" style={{ padding: '1.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Bot size={18} style={{ color: 'var(--accent-cyan)' }} />
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                        Step 1: Explain Your Strategy in Words
                      </h4>
                    </div>

                    {/* Microphone Dictate Button */}
                    <button
                      id="btn-voice-dictate"
                      type="button"
                      onClick={handleStartListening}
                      style={{
                        padding: '0.45rem 0.85rem',
                        borderRadius: '20px',
                        background: isListening ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0, 242, 254, 0.1)',
                        border: `1px solid ${isListening ? '#ef4444' : 'rgba(0, 242, 254, 0.3)'}`,
                        color: isListening ? '#fca5a5' : 'var(--accent-cyan)',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        transition: 'all 0.2s',
                        boxShadow: isListening ? '0 0 15px rgba(239, 68, 68, 0.5)' : 'none'
                      }}
                    >
                      {isListening ? <MicOff size={14} className="animate-pulse" /> : <Mic size={14} />}
                      <span>{isListening ? 'Listening... Speak Now' : 'Voice Dictate'}</span>
                    </button>
                  </div>

                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>
                    Speak into your microphone or type instructions below (e.g. <i>"I want an Opening Range Breakout that checks the 09:15 candle, triggers if price crosses yesterday's high, sets stop loss at candle low, with a 1:2 risk reward ratio."</i>).
                  </p>

                  <div style={{ position: 'relative', marginBottom: '1rem' }}>
                    <textarea
                      id="textarea-ai-prompt"
                      rows={5}
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Type or dictate your strategy thesis in plain English words here... (e.g. indicators, candle rules, stop loss clamp, profit target, timeframe)..."
                      style={{
                        width: '100%',
                        padding: '0.9rem',
                        background: 'rgba(0,0,0,0.35)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '0.88rem',
                        lineHeight: '1.5',
                        outline: 'none',
                        resize: 'vertical',
                      }}
                    />
                  </div>

                  {/* Preset Pills */}
                  <div style={{ marginBottom: '1.2rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                      Quick Strategy Presets:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {[
                        "1-Min Open Range Breakout (ORB) over Previous Day High",
                        "EMA 9 and 21 Trend Crossover above VWAP",
                        "VWAP Mean Reversion 2-Sigma Oversold Bounce",
                        "CPR Narrow Pivot Range Range Expansion",
                        "15-Min & 5-Min Multi-Timeframe Supertrend Flip"
                      ].map((presetText) => (
                        <button
                          key={presetText}
                          type="button"
                          onClick={() => setAiPrompt(presetText)}
                          style={{
                            padding: '0.3rem 0.6rem',
                            borderRadius: '12px',
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-muted)',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                          }}
                        >
                          + {presetText.split('(')[0].trim()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* AI Generation Trigger Button */}
                  <button
                    id="btn-generate-ai-strategy"
                    type="button"
                    onClick={handleGenerateWithAI}
                    disabled={aiGenerating || !aiPrompt.trim()}
                    style={{
                      width: '100%',
                      padding: '0.85rem',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                      border: 'none',
                      color: '#030816',
                      fontWeight: 800,
                      fontSize: '0.92rem',
                      cursor: aiGenerating || !aiPrompt.trim() ? 'not-allowed' : 'pointer',
                      opacity: aiGenerating || !aiPrompt.trim() ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.6rem',
                      boxShadow: 'var(--glow-cyan)'
                    }}
                  >
                    <Sparkles size={18} />
                    <span>{aiGenerating ? 'Deducing Quant Rules with AI...' : 'Generate & Deduce Strategy with AI →'}</span>
                  </button>

                  {/* AI Deduction Thesis Preview if Available */}
                  {aiDeducedDraft && (
                    <div style={{ marginTop: '1.4rem', padding: '1rem', background: 'rgba(0, 242, 254, 0.04)', border: '1px solid rgba(0, 242, 254, 0.25)', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem', color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '0.82rem' }}>
                        <Bot size={15} />
                        <span>AI Deduced Quantitative Thesis & Reasoning</span>
                      </div>
                      <pre style={{ fontSize: '0.78rem', color: '#e2e8f0', whiteSpace: 'pre-wrap', lineHeight: '1.5', fontFamily: 'inherit' }}>
                        {aiDeducedDraft.deduced_reasoning}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Right: Review, Edit & Confirm Workspace */}
                <div className="glass-panel" style={{ padding: '1.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Edit3 size={18} style={{ color: 'var(--accent-green)' }} />
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                        Step 2: Review, Fine-tune & Add to Suite
                      </h4>
                    </div>

                    <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)', background: 'rgba(0,242,254,0.08)', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(0,242,254,0.2)' }}>
                      {studioMode === 'edit' ? 'Editing Mode' : 'Draft Ready for Review'}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    If the description generated by AI is right, you can tweak any specific thresholds or continue with the generated parameters, and add it directly to your live running strategies.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Strategy Name & Key */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '0.8rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.3rem', textTransform: 'uppercase' }}>
                          Strategy Name:
                        </label>
                        <input
                          type="text"
                          value={strategyForm.name}
                          onChange={(e) => setStrategyForm({ ...strategyForm, name: e.target.value })}
                          placeholder="e.g. Open Range Breakout Pro"
                          style={{
                            width: '100%',
                            padding: '0.65rem 0.8rem',
                            background: 'rgba(0,0,0,0.35)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            outline: 'none',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.3rem', textTransform: 'uppercase' }}>
                          Key Identifier:
                        </label>
                        <input
                          type="text"
                          disabled={studioMode === 'edit'}
                          value={strategyForm.key}
                          onChange={(e) => setStrategyForm({ ...strategyForm, key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                          placeholder="orb_pro"
                          style={{
                            width: '100%',
                            padding: '0.65rem 0.8rem',
                            background: 'rgba(0,0,0,0.35)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            color: 'var(--accent-cyan)',
                            fontSize: '0.85rem',
                            fontFamily: 'monospace',
                            outline: 'none',
                          }}
                        />
                      </div>
                    </div>

                    {/* Category & Timeframe */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.3rem', textTransform: 'uppercase' }}>
                          Strategy Category:
                        </label>
                        <input
                          type="text"
                          value={strategyForm.category}
                          onChange={(e) => setStrategyForm({ ...strategyForm, category: e.target.value })}
                          placeholder="Intraday Momentum"
                          style={{
                            width: '100%',
                            padding: '0.65rem 0.8rem',
                            background: 'rgba(0,0,0,0.35)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '0.85rem',
                            outline: 'none',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.3rem', textTransform: 'uppercase' }}>
                          Execution Timeframe:
                        </label>
                        <select
                          value={strategyForm.timeframe}
                          onChange={(e) => setStrategyForm({ ...strategyForm, timeframe: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '0.65rem 0.8rem',
                            background: '#121826',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '0.85rem',
                            outline: 'none',
                          }}
                        >
                          <option value="1-Min (09:15 candle evaluated at 09:16 AM)">1-Min (09:15 candle evaluated at 09:16 AM)</option>
                          <option value="3-Min Intraday Momentum">3-Min Intraday Momentum</option>
                          <option value="5-Min Intraday Momentum">5-Min Intraday Momentum</option>
                          <option value="15-Min Swing Trend">15-Min Swing Trend</option>
                        </select>
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.3rem', textTransform: 'uppercase' }}>
                        Strategy Description & Methodology:
                      </label>
                      <textarea
                        rows={3}
                        value={strategyForm.description}
                        onChange={(e) => setStrategyForm({ ...strategyForm, description: e.target.value })}
                        placeholder="Detailed methodology of how the strategy works..."
                        style={{
                          width: '100%',
                          padding: '0.7rem',
                          background: 'rgba(0,0,0,0.35)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          color: '#fff',
                          fontSize: '0.82rem',
                          lineHeight: '1.4',
                          outline: 'none',
                        }}
                      />
                    </div>

                    {/* Entry Rules */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--accent-green)', marginBottom: '0.3rem', textTransform: 'uppercase', fontWeight: 700 }}>
                        Entry Rules (Long Setup):
                      </label>
                      <textarea
                        rows={3}
                        value={strategyForm.entry_rules}
                        onChange={(e) => setStrategyForm({ ...strategyForm, entry_rules: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.7rem',
                          background: 'rgba(16,185,129,0.04)',
                          border: '1px solid rgba(16,185,129,0.2)',
                          borderRadius: '6px',
                          color: '#fff',
                          fontSize: '0.82rem',
                          lineHeight: '1.4',
                          outline: 'none',
                        }}
                      />
                    </div>

                    {/* Exit Rules */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.7rem', color: '#fca5a5', marginBottom: '0.3rem', textTransform: 'uppercase', fontWeight: 700 }}>
                        Exit & Stop Loss Rules:
                      </label>
                      <textarea
                        rows={3}
                        value={strategyForm.exit_rules}
                        onChange={(e) => setStrategyForm({ ...strategyForm, exit_rules: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.7rem',
                          background: 'rgba(244,63,94,0.04)',
                          border: '1px solid rgba(244,63,94,0.2)',
                          borderRadius: '6px',
                          color: '#fff',
                          fontSize: '0.82rem',
                          lineHeight: '1.4',
                          outline: 'none',
                        }}
                      />
                    </div>

                    <div className="notice info" style={{ fontSize: '0.78rem' }}>
                      Performance numbers are never estimated. Once a strategy has a coded rule set, run it in Backtesting to measure them on real data.
                    </div>

                    {/* Confirm & Save Button */}
                    <button
                      id="btn-save-strategy-suite"
                      type="button"
                      onClick={handleSaveStrategy}
                      disabled={loading || !strategyForm.name.trim()}
                      style={{
                        width: '100%',
                        padding: '0.85rem',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        border: 'none',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.95rem',
                        cursor: loading || !strategyForm.name.trim() ? 'not-allowed' : 'pointer',
                        opacity: loading || !strategyForm.name.trim() ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.6rem',
                        boxShadow: '0 0 20px rgba(16, 185, 129, 0.3)'
                      }}
                    >
                      <Save size={18} />
                      <span>{studioMode === 'edit' ? 'Update & Save Strategy Changes' : 'Confirm & Add Strategy to Suite →'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom Inventory: All Active Strategies in Suite */}
              <div className="glass-panel" style={{ marginTop: '1.5rem', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                    Active Strategy Inventory ({strategies.length})
                  </h4>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    Core built-in strategies plus your AI-drafted setups
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                  {strategies.map((s) => (
                    <div
                      key={s.key}
                      style={{
                        padding: '1.1rem',
                        borderRadius: '8px',
                        background: 'rgba(0,0,0,0.3)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.8rem',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>{s.name}</span>
                          <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: s.key === 'open_range_breakout' ? 'rgba(0,242,254,0.15)' : 'rgba(255,255,255,0.06)', color: s.key === 'open_range_breakout' ? 'var(--accent-cyan)' : 'var(--text-muted)', fontWeight: 700 }}>
                            {s.key === 'open_range_breakout' ? 'PRIMARY ORB' : s.category}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4', margin: '0.4rem 0' }}>
                          {s.description.slice(0, 110)}...
                        </p>
                        <div className="mono" style={{ display: 'flex', gap: '0.8rem', fontSize: '0.74rem', marginTop: '0.4rem' }}>
                          <span style={{ color: 'var(--accent-green)' }}>Win Rate: <b>{s.win_rate != null ? `${s.win_rate}%` : '–'}</b></span>
                          <span style={{ color: 'var(--accent-cyan)' }}>Profit Factor: <b>{s.profit_factor != null ? `${s.profit_factor}x` : '–'}</b></span>
                          <span style={{ color: '#a78bfa' }}>Sharpe: <b>{s.sharpe_ratio ?? '–'}</b></span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                          Timeframe: <b>{s.timeframe.split('(')[0]}</b>
                        </span>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            onClick={() => handleEditStrategy(s)}
                            style={{
                              padding: '0.3rem 0.6rem',
                              borderRadius: '4px',
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid var(--border-subtle)',
                              color: '#fff',
                              fontSize: '0.72rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                            }}
                          >
                            <Edit3 size={11} />
                            <span>Edit</span>
                          </button>
                          {s.key !== 'open_range_breakout' && s.key !== 'opening_high_breakout' && (
                            <button
                              onClick={() => handleDeleteStrategy(s.key)}
                              style={{
                                padding: '0.3rem 0.6rem',
                                borderRadius: '4px',
                                background: 'rgba(244,63,94,0.1)',
                                border: '1px solid rgba(244,63,94,0.3)',
                                color: '#fca5a5',
                                fontSize: '0.72rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                              }}
                            >
                              <Trash2 size={11} />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              SECTION 4: SIMULTANEOUS MULTI-STRATEGY EXECUTION MATRIX (RUNNER)
              ========================================================================= */}
          {currentNav === 'runner' && (
            <div className="animate-fade-in">
              {/* Header Bar */}
              <div
                className="glass-panel"
                style={{
                  padding: '1.4rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                    <Zap size={20} style={{ color: 'var(--accent-cyan)' }} />
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
                      Simultaneous Multi-Strategy Execution Matrix
                    </h3>
                    <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)', fontWeight: 700 }}>
                      PARALLEL THREADED ENGINE
                    </span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Select as many strategies as you want from the checkboxes below. The engine executes them simultaneously in parallel without losing accuracy, execution efficiency, or time-based triggers.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                  <button
                    id="btn-save-execution-set"
                    onClick={handleSaveActiveExecutionSet}
                    disabled={loading}
                    style={{
                      padding: '0.65rem 1rem',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid var(--border-subtle)',
                      color: '#fff',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <Save size={15} />
                    <span>Save Execution Suite</span>
                  </button>

                  <button
                    id="btn-run-simultaneous"
                    onClick={handleRunSimultaneous}
                    disabled={simultaneousRunning || activeExecutionKeys.length === 0}
                    style={{
                      padding: '0.7rem 1.4rem',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                      border: 'none',
                      color: '#030816',
                      fontWeight: 800,
                      fontSize: '0.92rem',
                      cursor: simultaneousRunning || activeExecutionKeys.length === 0 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      boxShadow: 'var(--glow-cyan)'
                    }}
                  >
                    <Play size={16} fill="#030816" />
                    <span>{simultaneousRunning ? 'Executing Concurrently...' : `Run ${activeExecutionKeys.length} Strategies Simultaneously Now`}</span>
                  </button>
                </div>
              </div>

              {/* Checkboxes Strategy Grid */}
              <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                  <div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                      Select Strategies for Concurrent Execution
                    </h4>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Toggle the checkboxes to arm or disarm strategies for the concurrent execution engine.
                    </span>
                  </div>

                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-cyan)', background: 'rgba(0,242,254,0.1)', padding: '0.3rem 0.8rem', borderRadius: '20px', border: '1px solid rgba(0,242,254,0.3)' }}>
                    {activeExecutionKeys.length} of {strategies.length} Strategies Selected
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
                  {strategies.map((strat) => {
                    const isSelected = activeExecutionKeys.includes(strat.key);
                    return (
                      <div
                        key={strat.key}
                        onClick={() => handleToggleExecutionKey(strat.key)}
                        style={{
                          padding: '1.2rem',
                          borderRadius: '8px',
                          background: isSelected ? 'rgba(0, 242, 254, 0.05)' : 'rgba(0, 0, 0, 0.3)',
                          border: isSelected ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          boxShadow: isSelected ? '0 0 15px rgba(0, 242, 254, 0.15)' : 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '0.8rem'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              {isSelected ? (
                                <CheckSquare size={20} style={{ color: 'var(--accent-cyan)' }} />
                              ) : (
                                <Square size={20} style={{ color: 'var(--text-dim)' }} />
                              )}
                              <div>
                                <span style={{ fontWeight: 800, fontSize: '0.98rem', color: '#fff', display: 'block' }}>
                                  {strat.name}
                                </span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                  Key: <code className="mono" style={{ color: 'var(--accent-cyan)' }}>{strat.key}</code>
                                </span>
                              </div>
                            </div>

                            <span
                              style={{
                                padding: '0.2rem 0.55rem',
                                borderRadius: '12px',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                background: isSelected ? 'var(--accent-green-bg)' : 'rgba(255,255,255,0.04)',
                                color: isSelected ? 'var(--accent-green)' : 'var(--text-dim)',
                                border: isSelected ? '1px solid var(--accent-green)' : '1px solid var(--border-subtle)'
                              }}
                            >
                              {isSelected ? 'ARMED' : 'STANDBY'}
                            </span>
                          </div>

                          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.4', margin: '0.4rem 0' }}>
                            {strat.description.slice(0, 120)}...
                          </p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', background: 'rgba(0,0,0,0.3)', padding: '0.6rem', borderRadius: '6px' }}>
                          <div className="mono">
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', display: 'block' }}>Win Rate</span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--accent-green)', fontWeight: 700 }}>{strat.win_rate != null ? `${strat.win_rate}%` : '–'}</span>
                          </div>
                          <div className="mono">
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', display: 'block' }}>Profit Factor</span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>{strat.profit_factor != null ? `${strat.profit_factor}x` : '–'}</span>
                          </div>
                          <div className="mono">
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', display: 'block' }}>Sharpe</span>
                            <span style={{ fontSize: '0.85rem', color: '#a78bfa', fontWeight: 700 }}>{strat.sharpe_ratio ?? '–'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Simultaneous Execution Real-time Telemetry & Output */}
              {simultaneousResults && (
                <div className="glass-panel animate-fade-in" style={{ padding: '1.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.8rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                        <CheckCircle2 size={18} style={{ color: 'var(--accent-green)' }} />
                        <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>
                          Simultaneous Parallel Execution Results
                        </h4>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Triggered at {simultaneousResults.timestamp} • Concurrency: <b>{simultaneousResults.parallel_execution_engine}</b>
                      </span>
                    </div>

                    <div className="mono" style={{ display: 'flex', gap: '1rem', background: 'rgba(0,0,0,0.4)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(0,242,254,0.2)' }}>
                      <div>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', display: 'block' }}>Total Strategies</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fff' }}>{simultaneousResults.total_strategies_executed}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', display: 'block' }}>Total Concurrency Latency</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>{simultaneousResults.total_latency_ms}ms</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.2rem' }}>
                    {Object.entries(simultaneousResults.strategies_results || {}).map(([key, data]: [string, any]) => (
                      <div
                        key={key}
                        style={{
                          padding: '1.2rem',
                          borderRadius: '8px',
                          background: 'rgba(0,0,0,0.35)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                          <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>
                            {data.strategy_name}
                          </span>
                          <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--accent-green)', background: 'var(--accent-green-bg)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                            Latency: {data.execution_latency_ms}ms
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>
                          <span>Timeframe: <b style={{ color: '#fff' }}>{data.timeframe}</b></span>
                          <span>Signals Detected: <b style={{ color: data.signals_detected > 0 ? 'var(--accent-green)' : '#fff' }}>{data.signals_detected}</b></span>
                        </div>

                        {/* Recent Evaluations Preview */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                            Evaluated Universe Symbols:
                          </span>
                          {data.evaluations?.slice(0, 3).map((ev: any, idx: number) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.4rem 0.6rem',
                                background: 'rgba(255,255,255,0.02)',
                                borderRadius: '4px',
                                fontSize: '0.75rem'
                              }}
                            >
                              <span className="mono" style={{ fontWeight: 700, color: '#fff' }}>{ev.symbol}</span>
                              <span style={{ color: ev.setup_detected ? 'var(--accent-green)' : 'var(--text-dim)', fontWeight: ev.setup_detected ? 700 : 400 }}>
                                {ev.setup_detected ? '🔥 TRIGGER HIT' : 'Checked (Neutral)'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              SECTION 3: AUDIT LOGS PAGE (WHATSAPP & TELEGRAM COMMUNICATIONS)
              ========================================================================= */}
          {currentNav === 'audit' && (
            <div className="animate-fade-in">
              {/* Header & Filter Controls */}
              <div
                className="glass-panel"
                style={{
                  padding: '1.4rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <History size={18} style={{ color: 'var(--accent-cyan)' }} />
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>
                      Communications Audit Trail & Dispatch Logs
                    </h3>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Complete audit trail of all messages, authorization alerts, and breakout scans dispatched via WhatsApp Cloud API and Telegram Bot.
                  </p>
                </div>

                {/* Filter and Dispatch Test Controls */}
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <select
                    id="filter-audit-channel"
                    value={auditChannelFilter}
                    onChange={(e) => {
                      setAuditChannelFilter(e.target.value);
                      fetchAuditLogs(token || undefined, e.target.value);
                    }}
                    style={{
                      padding: '0.55rem 0.8rem',
                      background: '#121826',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '0.8rem',
                    }}
                  >
                    <option value="all">All Channels</option>
                    <option value="whatsapp">WhatsApp Only</option>
                    <option value="telegram">Telegram Only</option>
                  </select>

                  <button
                    id="btn-test-whatsapp"
                    onClick={() => handleSendTestNotification('whatsapp')}
                    disabled={loading}
                    style={{
                      padding: '0.55rem 0.9rem',
                      background: 'rgba(16,185,129,0.1)',
                      border: '1px solid rgba(16,185,129,0.3)',
                      borderRadius: '6px',
                      color: 'var(--accent-green)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                  >
                    <Smartphone size={14} />
                    <span>Ping WhatsApp</span>
                  </button>

                  <button
                    id="btn-test-telegram"
                    onClick={() => handleSendTestNotification('telegram')}
                    disabled={loading}
                    style={{
                      padding: '0.55rem 0.9rem',
                      background: 'rgba(0,242,254,0.1)',
                      border: '1px solid rgba(0,242,254,0.3)',
                      borderRadius: '6px',
                      color: 'var(--accent-cyan)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                  >
                    <MessageSquare size={14} />
                    <span>Ping Telegram</span>
                  </button>

                  <button
                    id="btn-refresh-audit"
                    onClick={() => fetchAuditLogs()}
                    style={{
                      padding: '0.55rem 0.8rem',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              {/* Logs Table */}
              <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto' }}>
                <table id="table-audit-logs" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.7rem 0.8rem' }}>ID</th>
                      <th style={{ padding: '0.7rem 0.8rem' }}>Timestamp (IST)</th>
                      <th style={{ padding: '0.7rem 0.8rem' }}>Channel</th>
                      <th style={{ padding: '0.7rem 0.8rem' }}>Recipient</th>
                      <th style={{ padding: '0.7rem 0.8rem' }}>Message Preview</th>
                      <th style={{ padding: '0.7rem 0.8rem' }}>Status</th>
                      <th style={{ padding: '0.7rem 0.8rem' }}>Triggered By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No audit records found. Click "Ping WhatsApp" or "Ping Telegram" above to dispatch a test call.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td className="mono" style={{ padding: '0.7rem 0.8rem', color: 'var(--text-dim)' }}>
                            #{log.id}
                          </td>
                          <td className="mono" style={{ padding: '0.7rem 0.8rem', color: '#fff' }}>
                            {log.timestamp}
                          </td>
                          <td style={{ padding: '0.7rem 0.8rem' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                background: log.channel === 'whatsapp' ? 'rgba(16,185,129,0.15)' : 'rgba(0,242,254,0.15)',
                                color: log.channel === 'whatsapp' ? 'var(--accent-green)' : 'var(--accent-cyan)',
                              }}
                            >
                              {log.channel === 'whatsapp' ? <Smartphone size={12} /> : <MessageSquare size={12} />}
                              {log.channel}
                            </span>
                          </td>
                          <td className="mono" style={{ padding: '0.7rem 0.8rem', fontWeight: 600, color: '#fff' }}>
                            {log.recipient}
                          </td>
                          <td style={{ padding: '0.7rem 0.8rem', maxWidth: '380px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-muted)' }}>
                            {log.message_preview}
                          </td>
                          <td style={{ padding: '0.7rem 0.8rem' }}>
                            <span
                              style={{
                                padding: '0.2rem 0.5rem',
                                borderRadius: '12px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                background: log.status === 'SENT' ? 'var(--accent-green-bg)' : 'var(--accent-red-bg)',
                                color: log.status === 'SENT' ? 'var(--accent-green)' : '#fca5a5',
                                border: log.status === 'SENT' ? '1px solid var(--accent-green)' : '1px solid var(--accent-red)',
                              }}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td style={{ padding: '0.7rem 0.8rem', color: 'var(--text-dim)', fontSize: '0.78rem' }}>
                            {log.triggered_by}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =========================================================================
              SECTION 4: RBAC USER MANAGEMENT (SUPER ADMIN & ADMIN ONLY)
              ========================================================================= */}
          {currentNav === 'users' && (userProfile.role === 'super_admin' || userProfile.role === 'admin') && (
            <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '1.5rem', alignItems: 'start' }}>
              {/* Provision Form */}
              <div className="glass-panel" style={{ padding: '1.6rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <ShieldCheck size={18} style={{ color: 'var(--accent-cyan)' }} />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                    Provision New Operator
                  </h3>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.4rem' }}>
                  {userProfile.role === 'super_admin'
                    ? 'Super Admins can grant Admin or Trader roles to operators.'
                    : 'Admins can provision Desk Traders only (cannot grant Admin access).'}
                </p>

                <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                      Operator Username
                    </label>
                    <input
                      id="input-new-username"
                      type="text"
                      placeholder="e.g. trader_vinay"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.7rem 0.9rem',
                        background: 'rgba(10, 13, 20, 0.8)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                      Operator Password
                    </label>
                    <input
                      id="input-new-password"
                      type="password"
                      placeholder="••••••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '0.7rem 0.9rem',
                        background: 'rgba(10, 13, 20, 0.8)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '0.85rem',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                      Assigned RBAC Role
                    </label>
                    <select
                      id="select-new-role"
                      value={newRole}
                      onChange={(e: any) => setNewRole(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.7rem 0.9rem',
                        background: '#121826',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '0.85rem',
                      }}
                    >
                      <option value="user">Desk Trader (Regular Operator)</option>
                      {/* Enforce: Only Super Admin can authorize another user to be Admin */}
                      {userProfile.role === 'super_admin' && (
                        <option value="admin">Admin (Desk Supervisor)</option>
                      )}
                    </select>
                  </div>

                  <button
                    id="btn-create-user-submit"
                    type="submit"
                    style={{
                      padding: '0.8rem',
                      background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#030816',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      marginTop: '0.4rem',
                    }}
                  >
                    + Provision Operator
                  </button>
                </form>
              </div>

              {/* Operators Table */}
              <div className="glass-panel" style={{ padding: '1.6rem', overflowX: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                    Active Terminal Operators Directory ({allUsers.length})
                  </h3>
                  <button
                    onClick={() => fetchUsers()}
                    style={{
                      padding: '0.35rem 0.7rem',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '4px',
                      color: '#fff',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Refresh
                  </button>
                </div>

                <table id="table-users" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.6rem 0.8rem' }}>ID</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Username</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Role</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Status</th>
                      {userProfile.role === 'super_admin' && (
                        <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Action</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {allUsers.map((u) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="mono" style={{ padding: '0.8rem', color: 'var(--text-dim)' }}>
                          #{u.id}
                        </td>
                        <td style={{ padding: '0.8rem', fontWeight: 600, color: '#fff' }}>
                          {u.username}
                        </td>
                        <td style={{ padding: '0.8rem' }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              background:
                                u.role === 'super_admin'
                                  ? 'rgba(0,242,254,0.15)'
                                  : u.role === 'admin'
                                  ? 'rgba(99,102,241,0.15)'
                                  : 'rgba(16,185,129,0.15)',
                              color:
                                u.role === 'super_admin'
                                  ? 'var(--accent-cyan)'
                                  : u.role === 'admin'
                                  ? '#a5b4fc'
                                  : '#6ee7b7',
                            }}
                          >
                            {u.role.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '0.8rem' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-green)', fontSize: '0.75rem' }}>
                            <span className="status-dot green" /> Active
                          </span>
                        </td>
                        {userProfile.role === 'super_admin' && (
                          <td style={{ padding: '0.8rem', textAlign: 'right' }}>
                            {u.username !== userProfile.username ? (
                              <button
                                onClick={() => handleDeleteUser(u.id, u.username)}
                                style={{
                                  padding: '0.25rem 0.55rem',
                                  background: 'rgba(244,63,94,0.1)',
                                  border: '1px solid rgba(244,63,94,0.3)',
                                  borderRadius: '4px',
                                  color: '#f87171',
                                  fontSize: '0.72rem',
                                  cursor: 'pointer',
                                }}
                              >
                                Revoke
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Self</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =========================================================================
              SECTION 5: SYSTEM STATUS (real values only; nothing hardcoded)
              ========================================================================= */}
          {currentNav === 'backtest' && token && (
            <div className="animate-fade-in">
              <BacktestPanel
                apiBase={API_BASE}
                token={token}
                isAdmin={isAdmin}
                initialKey={backtestKey}
                onUnauthorized={handleUnauthorized}
                onOpenChart={(sym) => { setChartSymbol(sym); setCurrentNav('charts'); }}
                onMetricsUpdated={() => fetchStrategies(token)}
              />
            </div>
          )}

          {currentNav === 'account' && token && (
            <div className="animate-fade-in ui-stack" style={{ maxWidth: 560 }}>
              <div className="ui-card">
                <div className="ui-card-head">
                  <div>
                    <div className="ui-card-title">Change password</div>
                    <div className="ui-card-sub">Signed in as {userProfile.username} ({userProfile.role.replace('_', ' ')})</div>
                  </div>
                </div>
                <form
                  className="ui-stack"
                  style={{ gap: '0.75rem' }}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setPwMsg(null);
                    if (pwForm.next !== pwForm.confirm) { setPwMsg({ ok: false, text: 'The new passwords do not match.' }); return; }
                    setPwBusy(true);
                    try {
                      const res = await fetch(`${API_BASE}/users/me/password`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }),
                      });
                      if (res.status === 401) { handleUnauthorized(); return; }
                      const body = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
                      setPwForm({ current: '', next: '', confirm: '' });
                      setPwMsg({
                        ok: true,
                        text: body.persistent
                          ? 'Password updated.'
                          : 'Password updated, but the server database is temporary and resets on restart. Set a permanent password in the server settings.',
                      });
                    } catch (err: any) {
                      setPwMsg({ ok: false, text: err.message || 'Could not change password.' });
                    } finally {
                      setPwBusy(false);
                    }
                  }}
                >
                  <input className="form-input" type="password" autoComplete="current-password" placeholder="Current password" required
                    value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} />
                  <input className="form-input" type="password" autoComplete="new-password" placeholder="New password (10+ chars, upper & lower case, a number)" required
                    value={pwForm.next} onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })} />
                  <input className="form-input" type="password" autoComplete="new-password" placeholder="Repeat new password" required
                    value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} />
                  {pwMsg && <div className={`notice ${pwMsg.ok ? 'info' : 'warn'}`}>{pwMsg.text}</div>}
                  <div><button className="btn btn-primary" type="submit" disabled={pwBusy}>{pwBusy ? 'Saving…' : 'Update password'}</button></div>
                </form>
              </div>
            </div>
          )}

          {currentNav === 'system' && (
            <div className="animate-fade-in ui-stack">
              <div className="ui-card">
                <div className="ui-card-head">
                  <div>
                    <div className="ui-card-title">Services</div>
                    <div className="ui-card-sub">
                      {healthData ? `Overall: ${humanize(healthData.overall_status)} · checked ${healthData.timestamp}` : 'Checking…'}
                    </div>
                  </div>
                  <button className="btn" onClick={() => fetchLiveHealth()}>
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th>Status</th>
                        <th>Detail</th>
                        <th className="num">Latency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {healthData ? (
                        (() => {
                          const s: any = healthData.services;
                          const rows: [string, any, string, number | null][] = [
                            ['Upstox broker', s.upstox?.status, s.upstox?.detail || '', s.upstox?.latency_ms ?? null],
                            ['WhatsApp alerts', s.whatsapp?.status, `${s.whatsapp?.recipients_configured ?? 0} recipient(s)${s.whatsapp?.verified_name ? ` · ${s.whatsapp.verified_name}` : ''}`, s.whatsapp?.latency_ms ?? null],
                            ['Telegram alerts', s.telegram?.status, `${s.telegram?.chat_groups_configured ?? 0} chat(s)${s.telegram?.bot_username ? ` · @${s.telegram.bot_username}` : ''}`, s.telegram?.latency_ms ?? null],
                            ['Scheduler', s.scheduler?.status, `${s.scheduler?.jobs_count ?? 0} jobs · ${s.scheduler?.timezone ?? ''}`, null],
                            ['Database', s.database?.status, s.database?.name ? `${s.database.name} · ${s.database.persistent === false ? 'temporary: resets when the server restarts' : 'persistent'}` : '', null],
                            ['IP guard', s.ip_guard?.status, s.ip_guard?.client_ip ? `Your IP ${s.ip_guard.client_ip}` : '', null],
                          ];
                          return rows.map(([name, status, detail, lat]) => (
                            <tr key={name}>
                              <td className="sym">{name}</td>
                              <td><span className={`chip ${toneFor(status)}`}>{humanize(status)}</span></td>
                              <td style={{ color: 'var(--text-muted)' }}>{detail || '–'}</td>
                              <td className="num">{lat ? `${lat} ms` : '–'}</td>
                            </tr>
                          ));
                        })()
                      ) : (
                        <tr><td colSpan={4} className="empty">Checking services…</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="ui-grid-2">
                <div className="ui-card">
                  <div className="ui-card-head">
                    <div>
                      <div className="ui-card-title">Broker authorisation</div>
                      <div className="ui-card-sub">Upstox sessions expire daily. Re-authorise before 09:15 for live data and orders.</div>
                    </div>
                    <span className={`chip ${brokerOk ? 'good' : 'bad'}`}>{humanize(brokerStatus || 'checking')}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <a className="btn btn-primary" href={`${API_BASE}/auth/login`} target="_blank" rel="noreferrer">Re-authorise Upstox</a>
                    <button className="btn" onClick={handleSendWhatsAppAuthButton} disabled={loading}>Send link to WhatsApp</button>
                  </div>
                </div>

                <div className="ui-card">
                  <div className="ui-card-head">
                    <div>
                      <div className="ui-card-title">Last alerts sent</div>
                      <div className="ui-card-sub">Full history is in the Alerts Log</div>
                    </div>
                    <button className="btn" onClick={() => setCurrentNav('audit')}>Open Alerts Log</button>
                  </div>
                  <table className="data-table">
                    <tbody>
                      {([
                        ['WhatsApp', dashMetrics?.last_whatsapp_call],
                        ['Telegram', dashMetrics?.last_telegram_call],
                      ] as [string, any][]).map(([ch, c]) => (
                        <tr key={ch}>
                          <td className="sym">{ch}</td>
                          <td><span className={`chip ${toneFor(c?.status)}`}>{humanize(c?.status || 'IDLE')}</span></td>
                          <td className="mono" style={{ color: 'var(--text-muted)' }}>{c?.timestamp || '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
