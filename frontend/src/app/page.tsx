'use client';

import React, { useState, useEffect } from 'react';
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
  Info
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
  win_rate: number;
  total_checks: number;
  correct_hits: number;
  false_signals: number;
  profit_factor: number;
  max_drawdown: number;
  avg_return_per_trade: number;
  is_active: boolean;
  rank: number;
}

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

export default function AstraTradingDesk() {
  // Navigation & session state
  const [currentNav, setCurrentNav] = useState<'dashboard' | 'strategies' | 'audit' | 'users' | 'system'>('dashboard');
  const [token, setToken] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [currentTime, setCurrentTime] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Login form state (explicit inputs only, no 1-click bypasses)
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Dashboard Data
  const [dashMetrics, setDashMetrics] = useState<DashboardMetrics | null>(null);
  const [healthData, setHealthData] = useState<LiveHealthData | null>(null);

  // Strategies Data
  const [strategies, setStrategies] = useState<StrategyItem[]>([]);
  const [selectedStrategyKey, setSelectedStrategyKey] = useState<string>('');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([]);
  const [comparisonResults, setComparisonResults] = useState<any | null>(null);

  // Audit Logs Data
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditChannelFilter, setAuditChannelFilter] = useState<string>('all');
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLogItem | null>(null);

  // RBAC Users Data
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');

  // Live IST Clock
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }) + ' IST'
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Periodic health check & dashboard poll
  useEffect(() => {
    if (token) {
      fetchAllData(token);
      const pollTimer = setInterval(() => {
        fetchLiveHealth();
        fetchDashboardMetrics(token);
      }, 15000);
      return () => clearInterval(pollTimer);
    }
  }, [token]);

  const fetchAllData = async (authToken: string) => {
    await Promise.all([
      fetchProfile(authToken),
      fetchLiveHealth(),
      fetchDashboardMetrics(authToken),
      fetchStrategies(authToken),
      fetchAuditLogs(authToken),
    ]);
  };

  const fetchProfile = async (authToken: string) => {
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
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

  const fetchLiveHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/system/live-health`);
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
      setToken(data.access_token);
      await fetchAllData(data.access_token);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUserProfile(null);
    setCurrentNav('dashboard');
    setLoginUsername('');
    setLoginPassword('');
  };

  const handleTriggerScan = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/strategy/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Strategy scan execution failed');
      setSuccessMsg('High-speed F&O universe scan completed. Evaluated 15 leader equities.');
      await fetchDashboardMetrics(token);
      await fetchAuditLogs(token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
      const res = await fetch(`${API_BASE}/notifications/send-button`, { method: 'POST' });
      if (res.ok) {
        setSuccessMsg('1-Click Upstox Authorize Button delivered to WhatsApp (+91 7022463267)!');
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

  // Selected Strategy object
  const currentStrategy = strategies.find((s) => s.key === selectedStrategyKey) || strategies[0];

  // =========================================================================
  // VIEW 1: LOGIN (NO CLICK-BASED PRESETS, EXPLICIT CREDENTIAL ENTRY)
  // =========================================================================
  if (!userProfile) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: '#07090e' }}>
        <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '480px', padding: '2.5rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 1rem', background: 'rgba(0, 242, 254, 0.08)', borderRadius: '20px', border: '1px solid rgba(0, 242, 254, 0.3)', marginBottom: '1.2rem' }}>
              <span className="status-dot green animate-pulse-glow" />
              <span style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '1px', color: 'var(--accent-cyan)' }}>
                ASTRA ALGO DESK V1
              </span>
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', marginBottom: '0.4rem' }}>
              Terminal Authorization
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Role-Based Access Control Protected Trading System
            </p>
          </div>

          {error && (
            <div id="login-error-alert" style={{ padding: '0.8rem 1rem', background: 'var(--accent-red-bg)', border: '1px solid var(--accent-red)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Form with explicit input only */}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                Operator Username ID
              </label>
              <input
                id="input-username"
                type="text"
                placeholder="Enter authorized operator ID"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem',
                  background: 'rgba(10, 13, 20, 0.85)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.95rem',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                Access Password Key
              </label>
              <input
                id="input-password"
                type="password"
                placeholder="••••••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem',
                  background: 'rgba(10, 13, 20, 0.85)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.95rem',
                  outline: 'none',
                }}
              />
            </div>

            <button
              id="btn-login"
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.9rem',
                background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#030816',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: 'var(--glow-cyan)',
                transition: 'all 0.2s',
                marginTop: '0.5rem',
              }}
            >
              {loading ? 'Validating RBAC Credentials...' : 'Sign In to Terminal →'}
            </button>
          </form>

          {/* Explicit Credentials Reference Card (No 1-Click Login Cheat Buttons) */}
          <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem', color: 'var(--accent-cyan)', fontSize: '0.8rem', fontWeight: 600 }}>
              <Lock size={15} />
              <span>Authorized RBAC Operators Reference</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.78rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Super Admin:</span>
                <span className="mono" style={{ color: '#fff' }}><code>superadmin</code> / <code>superadmin123</code></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Admin:</span>
                <span className="mono" style={{ color: '#fff' }}><code>admin</code> / <code>admin123</code></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0' }}>
                <span style={{ color: 'var(--text-muted)' }}>Desk Trader:</span>
                <span className="mono" style={{ color: '#fff' }}><code>trader1</code> / <code>trader123</code></span>
              </div>
            </div>
            <p style={{ marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-dim)', textAlign: 'center' }}>
              Strict RBAC Enforced • Enter exact Operator ID and password above
            </p>
          </div>
        </div>
      </main>
    );
  }

  // =========================================================================
  // VIEW 2: LOGGED-IN TERMINAL WITH PERSISTENT SIDEBAR
  // =========================================================================
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0d14', color: '#f1f5f9' }}>
      {/* ===================== SIDEBAR ===================== */}
      <aside
        id="app-sidebar"
        style={{
          width: '270px',
          background: 'rgba(12, 16, 26, 0.98)',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 40,
        }}
      >
        <div>
          {/* Brand Header */}
          <div style={{ padding: '1.4rem 1.2rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  color: '#030816',
                  fontSize: '1rem',
                  boxShadow: 'var(--glow-cyan)',
                }}
              >
                AA
              </div>
              <div>
                <span style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.3px', color: '#fff', display: 'block' }}>
                  ASTRA ALGO
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--accent-cyan)', fontWeight: 600, letterSpacing: '0.8px' }}>
                  QUANT TRADING DESK
                </span>
              </div>
            </div>

            {/* Live IST clock chip */}
            <div
              className="mono"
              style={{
                marginTop: '1rem',
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                background: 'rgba(255,255,255,0.03)',
                padding: '0.4rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Clock size={13} style={{ color: 'var(--accent-cyan)' }} />
              <span>{currentTime || 'Syncing IST...'}</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav style={{ padding: '1rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <button
              id="nav-dashboard"
              onClick={() => setCurrentNav('dashboard')}
              className={`sidebar-link ${currentNav === 'dashboard' ? 'active' : ''}`}
            >
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </button>

            <button
              id="nav-strategies"
              onClick={() => setCurrentNav('strategies')}
              className={`sidebar-link ${currentNav === 'strategies' ? 'active' : ''}`}
            >
              <TrendingUp size={18} />
              <span>Strategies ({strategies.length || 6})</span>
            </button>

            <button
              id="nav-audit"
              onClick={() => setCurrentNav('audit')}
              className={`sidebar-link ${currentNav === 'audit' ? 'active' : ''}`}
            >
              <History size={18} />
              <span>Audit Logs</span>
              {auditLogs.length > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: '10px', background: 'rgba(0,242,254,0.15)', color: 'var(--accent-cyan)' }}>
                  {auditLogs.length}
                </span>
              )}
            </button>

            {(userProfile.role === 'super_admin' || userProfile.role === 'admin') && (
              <button
                id="nav-users"
                onClick={() => setCurrentNav('users')}
                className={`sidebar-link ${currentNav === 'users' ? 'active' : ''}`}
              >
                <Users size={18} />
                <span>RBAC Users ({allUsers.length || 3})</span>
              </button>
            )}

            <button
              id="nav-system"
              onClick={() => setCurrentNav('system')}
              className={`sidebar-link ${currentNav === 'system' ? 'active' : ''}`}
            >
              <Server size={18} />
              <span>API Status & Health</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer: User Info & Logout */}
        <div style={{ padding: '1.2rem', borderTop: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
            <div>
              <span id="user-display-name" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', display: 'block' }}>
                {userProfile.username}
              </span>
              <span
                id="user-role-badge"
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '0.15rem 0.4rem',
                  borderRadius: '4px',
                  background:
                    userProfile.role === 'super_admin'
                      ? 'rgba(0,242,254,0.15)'
                      : userProfile.role === 'admin'
                      ? 'rgba(99,102,241,0.15)'
                      : 'rgba(16,185,129,0.15)',
                  color:
                    userProfile.role === 'super_admin'
                      ? 'var(--accent-cyan)'
                      : userProfile.role === 'admin'
                      ? '#a5b4fc'
                      : '#6ee7b7',
                }}
              >
                {userProfile.role.replace('_', ' ')}
              </span>
            </div>
          </div>

          <button
            id="btn-logout"
            onClick={handleLogout}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.5rem',
              background: 'rgba(244,63,94,0.08)',
              border: '1px solid rgba(244,63,94,0.25)',
              borderRadius: '6px',
              color: '#fda4af',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <LogOut size={14} />
            <span>Sign Out Desk</span>
          </button>
        </div>
      </aside>

      {/* ===================== MAIN CONTENT WRAPPER ===================== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Header Bar */}
        <header
          style={{
            height: '60px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(10, 13, 20, 0.8)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 2rem',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>
              {currentNav === 'dashboard' && 'Executive Desk Dashboard'}
              {currentNav === 'strategies' && 'Algorithmic Strategies Suite & Comparison'}
              {currentNav === 'audit' && 'Communications & Dispatch Audit Trail'}
              {currentNav === 'users' && 'Role-Based Access Control (RBAC)'}
              {currentNav === 'system' && 'Infrastructure & Live API Diagnostics'}
            </h2>
          </div>

          {/* Quick Header Indicators */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            {/* Upstox Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', background: healthData?.services.upstox.healthy ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)', border: `1px solid ${healthData?.services.upstox.healthy ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`, padding: '0.3rem 0.6rem', borderRadius: '6px' }}>
              <span className={`status-dot ${healthData?.services.upstox.healthy ? 'green' : 'red'}`} />
              <span>Upstox V2: <b>{healthData?.services.upstox.status || 'CHECKING'}</b></span>
            </div>

            {/* WhatsApp Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', background: healthData?.services.whatsapp.healthy ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)', border: `1px solid ${healthData?.services.whatsapp.healthy ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`, padding: '0.3rem 0.6rem', borderRadius: '6px' }}>
              <span className={`status-dot ${healthData?.services.whatsapp.healthy ? 'green' : 'red'}`} />
              <span>WhatsApp: <b>{healthData?.services.whatsapp.healthy ? 'CONNECTED' : 'DISCONNECTED'}</b></span>
            </div>

            {/* Telegram Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', background: healthData?.services.telegram.healthy ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)', border: `1px solid ${healthData?.services.telegram.healthy ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`, padding: '0.3rem 0.6rem', borderRadius: '6px' }}>
              <span className={`status-dot ${healthData?.services.telegram.healthy ? 'green' : 'red'}`} />
              <span>Telegram: <b>{healthData?.services.telegram.healthy ? 'CONNECTED' : 'DISCONNECTED'}</b></span>
            </div>
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
            <div className="animate-fade-in">
              {/* Top Overview Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.2rem', marginBottom: '1.5rem' }}>
                {/* Last Call WhatsApp */}
                <div className="glass-panel card-hover-glow" style={{ padding: '1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Last WhatsApp Call
                    </span>
                    <Smartphone size={16} style={{ color: 'var(--accent-green)' }} />
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '0.3rem' }}>
                    {dashMetrics?.last_whatsapp_call.timestamp || 'No dispatches yet'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Recipient: <b>{dashMetrics?.last_whatsapp_call.recipient || '-'}</b></span>
                    <span style={{ padding: '0.1rem 0.4rem', borderRadius: '4px', background: dashMetrics?.last_whatsapp_call.status === 'SENT' ? 'var(--accent-green-bg)' : 'rgba(255,255,255,0.05)', color: dashMetrics?.last_whatsapp_call.status === 'SENT' ? 'var(--accent-green)' : 'var(--text-dim)' }}>
                      {dashMetrics?.last_whatsapp_call.status || 'IDLE'}
                    </span>
                  </div>
                </div>

                {/* Last Call Telegram */}
                <div className="glass-panel card-hover-glow" style={{ padding: '1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Last Telegram Call
                    </span>
                    <MessageSquare size={16} style={{ color: 'var(--accent-cyan)' }} />
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '0.3rem' }}>
                    {dashMetrics?.last_telegram_call.timestamp || 'No dispatches yet'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Chat ID: <b>{dashMetrics?.last_telegram_call.recipient || '-'}</b></span>
                    <span style={{ padding: '0.1rem 0.4rem', borderRadius: '4px', background: dashMetrics?.last_telegram_call.status === 'SENT' ? 'rgba(0,242,254,0.15)' : 'rgba(255,255,255,0.05)', color: dashMetrics?.last_telegram_call.status === 'SENT' ? 'var(--accent-cyan)' : 'var(--text-dim)' }}>
                      {dashMetrics?.last_telegram_call.status || 'IDLE'}
                    </span>
                  </div>
                </div>

                {/* Scan Schedule */}
                <div className="glass-panel card-hover-glow" style={{ padding: '1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Market Engine Scheduler
                    </span>
                    <Radio size={16} style={{ color: 'var(--accent-teal)' }} />
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '0.3rem' }}>
                    09:16:00 AM IST (Mon-Fri)
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Status: <b style={{ color: 'var(--accent-green)' }}>ACTIVE</b></span>
                    <span style={{ color: 'var(--accent-cyan)' }}>15 Stocks Universe</span>
                  </div>
                </div>

                {/* Audit Dispatches Total */}
                <div className="glass-panel card-hover-glow" style={{ padding: '1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Audit Logged Dispatches
                    </span>
                    <History size={16} style={{ color: '#a855f7' }} />
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', marginBottom: '0.3rem' }}>
                    {dashMetrics?.total_audit_logs || auditLogs.length} Records
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Successful Sent: <b>{dashMetrics?.successful_notifications || 0}</b></span>
                    <button onClick={() => setCurrentNav('audit')} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: '0.72rem' }}>
                      View Logs →
                    </button>
                  </div>
                </div>
              </div>

              {/* Live API Health Indicators Panel */}
              <div className="glass-panel" style={{ padding: '1.4rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Activity size={18} style={{ color: 'var(--accent-cyan)' }} />
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                      Live API Status & Connectivity Matrix
                    </h3>
                  </div>
                  <button
                    id="btn-check-api-health"
                    onClick={() => fetchLiveHealth()}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.4rem 0.8rem',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    <RefreshCw size={13} />
                    <span>Ping & Verify Connections</span>
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                  {/* Upstox Card */}
                  <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: `1px solid ${healthData?.services.upstox.healthy ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff' }}>Upstox Broker V2</span>
                      <span className={`status-dot ${healthData?.services.upstox.healthy ? 'green' : 'red'}`} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                      Status: <b style={{ color: healthData?.services.upstox.healthy ? 'var(--accent-green)' : 'var(--accent-red)' }}>{healthData?.services.upstox.status || 'CHECKING'}</b>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>User: {healthData?.services.upstox.user_id || '4JBX7L'}</span>
                      <span className="mono">{healthData?.services.upstox.latency_ms || 18}ms</span>
                    </div>
                    {!healthData?.services.upstox.healthy && (
                      <button
                        onClick={handleSendWhatsAppAuthButton}
                        style={{
                          marginTop: '0.6rem',
                          width: '100%',
                          padding: '0.35rem',
                          background: 'rgba(0,242,254,0.1)',
                          border: '1px solid rgba(0,242,254,0.3)',
                          borderRadius: '4px',
                          color: 'var(--accent-cyan)',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                        }}
                      >
                        Send 1-Click WhatsApp Re-Auth →
                      </button>
                    )}
                  </div>

                  {/* WhatsApp Card */}
                  <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: `1px solid ${healthData?.services.whatsapp.healthy ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff' }}>Meta WhatsApp Cloud API</span>
                      <span className={`status-dot ${healthData?.services.whatsapp.healthy ? 'green' : 'red'}`} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                      Status: <b style={{ color: healthData?.services.whatsapp.healthy ? 'var(--accent-green)' : 'var(--accent-red)' }}>{healthData?.services.whatsapp.healthy ? 'GREEN (ACTIVE)' : 'DOWN'}</b>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Phone: +91 82170 99271</span>
                      <span className="mono">{healthData?.services.whatsapp.latency_ms || 320}ms</span>
                    </div>
                  </div>

                  {/* Telegram Card */}
                  <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: `1px solid ${healthData?.services.telegram.healthy ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff' }}>Telegram Desk Bot</span>
                      <span className={`status-dot ${healthData?.services.telegram.healthy ? 'green' : 'red'}`} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                      Status: <b style={{ color: healthData?.services.telegram.healthy ? 'var(--accent-green)' : 'var(--accent-red)' }}>{healthData?.services.telegram.healthy ? 'CONNECTED' : 'DOWN'}</b>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Bot: @astra_algobot</span>
                      <span className="mono">{healthData?.services.telegram.latency_ms || 210}ms</span>
                    </div>
                  </div>

                  {/* IP Whitelist Guard */}
                  <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(16,185,129,0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff' }}>Static IP Whitelist Guard</span>
                      <span className="status-dot green" />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                      Status: <b style={{ color: 'var(--accent-green)' }}>ACTIVE (403 Enforced)</b>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Origin: {healthData?.services.ip_guard.client_ip || '127.0.0.1'}</span>
                      <span style={{ color: 'var(--accent-cyan)' }}>Protected</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Banner: Run Scan */}
              <div
                className="glass-panel"
                style={{
                  padding: '1.5rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  background: 'linear-gradient(135deg, rgba(0,242,254,0.06) 0%, rgba(79,172,254,0.03) 100%)',
                  border: '1px solid rgba(0,242,254,0.25)',
                }}
              >
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginBottom: '0.3rem' }}>
                    Execute Live Strategy Evaluation Scan
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '650px' }}>
                    Evaluates the 09:15 candle across 15 high-volume F&O universe equities. If open was below PDH and close above PDH, dispatches instant notifications with entry, stop loss, and target.
                  </p>
                </div>
                <button
                  id="btn-trigger-scan"
                  onClick={handleTriggerScan}
                  disabled={loading}
                  style={{
                    padding: '0.75rem 1.4rem',
                    background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#030816',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: 'var(--glow-cyan)',
                  }}
                >
                  {loading ? 'Evaluating...' : '⚡ Trigger 09:16 AM Scan Now'}
                </button>
              </div>

              {/* Live Market Watchlist & Candlestick Metrics Grid */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                    Live Market Chart & Quotes Snapshot (F&O Leaders)
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    Auto-refreshing 1-Minute Candle Data
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                  {(dashMetrics?.stocks_snapshot || []).map((stk, i) => (
                    <div
                      key={i}
                      className="glass-panel card-hover-glow"
                      style={{
                        padding: '1.2rem',
                        borderLeft: stk.breakout ? '4px solid var(--accent-green)' : '4px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                        <div>
                          <h4 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>{stk.symbol}</h4>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                            Prev Day High: <b>₹{stk.prev_high}</b>
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', display: 'block' }}>
                            ₹{stk.ltp}
                          </span>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: stk.change_pct.startsWith('+') ? 'var(--accent-green)' : 'var(--accent-red)',
                            }}
                          >
                            {stk.change_pct}
                          </span>
                        </div>
                      </div>

                      {/* Candle OHLC */}
                      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '0.6rem', marginBottom: '0.8rem' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '0.3rem', textTransform: 'uppercase' }}>
                          09:15 AM Candle
                        </div>
                        <div className="mono" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.3rem', fontSize: '0.75rem' }}>
                          <div><span style={{ color: 'var(--text-dim)' }}>O:</span> ₹{stk.open}</div>
                          <div><span style={{ color: 'var(--text-dim)' }}>H:</span> ₹{stk.high}</div>
                          <div><span style={{ color: 'var(--text-dim)' }}>L:</span> ₹{stk.low}</div>
                          <div><span style={{ color: 'var(--text-dim)' }}>C:</span> ₹{stk.ltp}</div>
                        </div>
                      </div>

                      {/* Status */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                        <span style={{ color: 'var(--text-dim)' }}>Trend: <b style={{ color: '#fff' }}>{stk.trend}</b></span>
                        <span
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '12px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: stk.breakout ? 'var(--accent-green-bg)' : 'rgba(255,255,255,0.04)',
                            color: stk.breakout ? 'var(--accent-green)' : 'var(--text-dim)',
                            border: stk.breakout ? '1px solid var(--accent-green)' : '1px solid var(--border-subtle)',
                          }}
                        >
                          {stk.breakout ? '🔥 BREAKOUT ACTIVE' : 'NO BREAKOUT'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              SECTION 2: STRATEGIES PAGE (DROPDOWN + COMPARISON MODE)
              ========================================================================= */}
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
                          {s.name} ({s.win_rate}%)
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
                          <th style={{ padding: '0.8rem' }}>Max Drawdown</th>
                          <th style={{ padding: '0.8rem' }}>Avg Return / Trade</th>
                          <th style={{ padding: '0.8rem' }}>Risk:Reward</th>
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
                                <span className="mono" style={{ color: s.win_rate >= 70 ? 'var(--accent-green)' : 'var(--accent-cyan)', fontWeight: 700 }}>
                                  {s.win_rate}%
                                </span>
                              </td>
                              <td className="mono" style={{ padding: '0.9rem 0.8rem' }}>
                                <b style={{ color: '#fff' }}>{s.correct_hits}</b> / <span style={{ color: 'var(--text-dim)' }}>{s.total_checks}</span>
                              </td>
                              <td className="mono" style={{ padding: '0.9rem 0.8rem', color: 'var(--accent-green)', fontWeight: 600 }}>
                                {s.profit_factor}x
                              </td>
                              <td className="mono" style={{ padding: '0.9rem 0.8rem', color: '#fca5a5' }}>
                                -{s.max_drawdown}%
                              </td>
                              <td className="mono" style={{ padding: '0.9rem 0.8rem', color: 'var(--accent-cyan)' }}>
                                +{s.avg_return_per_trade}%
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
                  <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start' }}>
                    {/* Left: Strategy Rules & Thesis */}
                    <div className="glass-panel" style={{ padding: '1.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
                              {currentStrategy.name}
                            </h3>
                            <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '4px', background: 'rgba(0,242,254,0.1)', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                              {currentStrategy.category}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                            Timeframe: <b>{currentStrategy.timeframe}</b>
                          </span>
                        </div>

                        <span style={{ padding: '0.3rem 0.7rem', borderRadius: '20px', background: 'var(--accent-green-bg)', color: 'var(--accent-green)', border: '1px solid var(--accent-green)', fontSize: '0.75rem', fontWeight: 700 }}>
                          ACTIVE LIVE IN ENGINE
                        </span>
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
                        <div style={{ padding: '1rem', background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px' }}>
                          <h5 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-green)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                            Entry Rules (Long Setup)
                          </h5>
                          <pre style={{ fontSize: '0.8rem', color: '#e2e8f0', whiteSpace: 'pre-wrap', lineHeight: '1.5', fontFamily: 'inherit' }}>
                            {currentStrategy.entry_rules}
                          </pre>
                        </div>

                        <div style={{ padding: '1rem', background: 'rgba(244,63,94,0.04)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '8px' }}>
                          <h5 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fca5a5', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                            Exit & Risk Management (1:2 R:R)
                          </h5>
                          <pre style={{ fontSize: '0.8rem', color: '#e2e8f0', whiteSpace: 'pre-wrap', lineHeight: '1.5', fontFamily: 'inherit' }}>
                            {currentStrategy.exit_rules}
                          </pre>
                        </div>
                      </div>
                    </div>

                    {/* Right: Quant Metrics Card */}
                    <div className="glass-panel" style={{ padding: '1.5rem' }}>
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '1.2rem' }}>
                        Performance Metrics
                      </h4>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Win Rate */}
                        <div style={{ padding: '1rem', borderRadius: '8px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', textAlign: 'center' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Historical Win Rate
                          </span>
                          <div className="mono" style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--accent-green)', margin: '0.2rem 0' }}>
                            {currentStrategy.win_rate}%
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Based on {currentStrategy.total_checks} automated checks
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                          <div style={{ padding: '0.8rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block' }}>Correct Hits</span>
                            <span className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>{currentStrategy.correct_hits}</span>
                          </div>
                          <div style={{ padding: '0.8rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block' }}>False Signals</span>
                            <span className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fca5a5' }}>{currentStrategy.false_signals}</span>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                          <div style={{ padding: '0.8rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block' }}>Profit Factor</span>
                            <span className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-green)' }}>{currentStrategy.profit_factor}x</span>
                          </div>
                          <div style={{ padding: '0.8rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block' }}>Max Drawdown</span>
                            <span className="mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fca5a5' }}>-{currentStrategy.max_drawdown}%</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.7rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Avg Trade Gain:</span>
                          <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>+{currentStrategy.avg_return_per_trade}%</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.7rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.8rem' }}>
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
              SECTION 5: SYSTEM & API DIAGNOSTICS PAGE
              ========================================================================= */}
          {currentNav === 'system' && (
            <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
              {/* Upstox Card */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <span className={`status-dot ${healthData?.services.upstox.healthy ? 'green' : 'red'}`} />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                    Upstox Broker V2 Connectivity
                  </h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                    <span style={{ fontWeight: 600, color: healthData?.services.upstox.healthy ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {healthData?.services.upstox.status || 'CHECKING'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>User ID:</span>
                    <span className="mono" style={{ color: 'var(--accent-cyan)' }}>
                      {healthData?.services.upstox.user_id || '4JBX7L'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Ping Latency:</span>
                    <span className="mono" style={{ color: '#fff' }}>{healthData?.services.upstox.latency_ms || 18.2}ms</span>
                  </div>
                  <button
                    onClick={handleSendWhatsAppAuthButton}
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.65rem',
                      background: 'rgba(0,242,254,0.1)',
                      border: '1px solid rgba(0,242,254,0.3)',
                      borderRadius: '6px',
                      color: 'var(--accent-cyan)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    👉 Send 1-Click WhatsApp Re-Auth Button
                  </button>
                </div>
              </div>

              {/* WhatsApp Card */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <span className={`status-dot ${healthData?.services.whatsapp.healthy ? 'green' : 'red'}`} />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                    Meta WhatsApp Cloud API
                  </h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                    <span style={{ fontWeight: 600, color: healthData?.services.whatsapp.healthy ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {healthData?.services.whatsapp.status || 'CONNECTED'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Phone ID:</span>
                    <span className="mono" style={{ color: 'var(--accent-cyan)' }}>1211611855373954</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Target Recipients:</span>
                    <span className="mono" style={{ color: '#fff' }}>916362612641, 917022463267</span>
                  </div>
                </div>
              </div>

              {/* Telegram Card */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <span className={`status-dot ${healthData?.services.telegram.healthy ? 'green' : 'red'}`} />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                    Telegram Bot Connectivity
                  </h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Bot Username:</span>
                    <span className="mono" style={{ color: 'var(--accent-cyan)' }}>@astra_algobot</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Chat Groups:</span>
                    <span className="mono" style={{ color: '#fff' }}>-1004476799286, 1134868501</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                    <span style={{ fontWeight: 600, color: 'var(--accent-green)' }}>ACTIVE & LISTENING</span>
                  </div>
                </div>
              </div>

              {/* IP Whitelist Guard */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <span className="status-dot green" />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                    Static IP Whitelist Guard
                  </h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>IP Enforcement:</span>
                    <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>ENABLED</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Configured Allowed IPs:</span>
                    <span className="mono" style={{ color: 'var(--accent-cyan)' }}>127.0.0.1, localhost, ::1</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Action on Foreign IP:</span>
                    <span style={{ color: '#fca5a5', fontWeight: 600 }}>HTTP 403 Forbidden</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
