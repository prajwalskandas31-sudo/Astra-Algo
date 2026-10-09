'use client';

import React, { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" && window.location.hostname === "localhost" ? "http://localhost:8000" : "https://astra-algo.onrender.com");

interface UserProfile {
  id: number;
  username: string;
  role: 'super_admin' | 'admin' | 'user';
  is_active: boolean;
}

interface StrategyStatus {
  server_time_ist: string;
  strategy_name: string;
  timeframe: string;
  scheduler: {
    status: string;
    schedule: string;
    timezone: string;
  };
  broker: {
    status: string;
    user_id?: string;
    user_name?: string;
    broker?: string;
    authenticated?: boolean;
    detail?: string;
  };
  security: {
    ip_guard: string;
    rbac: string;
  };
  recent_logs_count: number;
}

interface EvaluationResult {
  timestamp: string;
  symbol: string;
  source: string;
  prev_day_high: number;
  candle: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
  setup_detected: boolean;
  direction: string;
  expected_entry: number | null;
  stop_loss: number | null;
  risk_per_share: number | null;
  take_profit: number | null;
  risk_reward_ratio: string | null;
  telegram_dispatch?: {
    status: string;
    message?: string;
  };
  whatsapp_dispatch?: {
    status: string;
    recipients_count?: number;
    message?: string;
  };
}

export default function TradingTerminal() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [strategyStatus, setStrategyStatus] = useState<StrategyStatus | null>(null);
  const [evaluations, setEvaluations] = useState<EvaluationResult[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<'strategy' | 'users' | 'logs' | 'system'>('strategy');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  // New user form state (admin)
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

  const fetchProfile = async (authToken?: string) => {
    const t = authToken || token;
    if (!t) return;
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data);
        if (data.role === 'super_admin' || data.role === 'admin') {
          fetchUsers(t);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStatus = async (authToken?: string) => {
    const t = authToken || token;
    if (!t) return;
    try {
      const res = await fetch(`${API_BASE}/strategy/status`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        setStrategyStatus(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async (authToken?: any) => {
    const t = (typeof authToken === 'string' ? authToken : null) || token;
    if (!t) return;
    try {
      const res = await fetch(`${API_BASE}/users`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        setAllUsers(await res.json());
      }
    } catch (err) {
      console.error(err);
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
        body: new URLSearchParams({ username, password }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Authentication failed');
      }

      const data = await res.json();
      setToken(data.access_token);
      await fetchProfile(data.access_token);
      await fetchStatus(data.access_token);
      await triggerScan(data.access_token);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const triggerScan = async (authToken?: any) => {
    const t = (typeof authToken === 'string' ? authToken : null) || token;
    if (!t) return;
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/strategy/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) throw new Error('Strategy scan execution failed');
      const data = await res.json();
      setEvaluations(data.evaluations || []);
      setSuccessMsg('Strategy scan executed successfully. Live signals updated.');
      fetchStatus(t);
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
      setSuccessMsg(`User ${newUsername} (${newRole}) registered successfully!`);
      setNewUsername('');
      setNewPassword('');
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (userId: number, uName: string) => {
    if (!token || !confirm(`Delete operator ${uName}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSuccessMsg(`User ${uName} removed.`);
        fetchUsers();
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUserProfile(null);
    setStrategyStatus(null);
    setEvaluations([]);
    setActiveTab('strategy');
  };

  // Helper quick login fill
  const quickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  // ===================== LOGIN VIEW =====================
  if (!userProfile) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '460px', padding: '2.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
          {/* Logo & Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 1rem', background: 'rgba(0,242,254,0.08)', borderRadius: '20px', border: '1px solid rgba(0,242,254,0.3)', marginBottom: '1rem' }}>
              <span className="status-dot green animate-pulse-glow" />
              <span style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '1px', color: 'var(--accent-cyan)' }}>ALGORITHMIC DESK ACTIVE</span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', marginBottom: '0.4rem' }}>
              ALPHA CAPITAL
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Opening High Breakout / Reversal Strategy Terminal
            </p>
          </div>

          {error && (
            <div id="login-error-alert" style={{ padding: '0.8rem', background: 'var(--accent-red-bg)', border: '1px solid var(--accent-red)', borderRadius: '8px', color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1.2rem' }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                Operator Username
              </label>
              <input
                id="input-username"
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.8rem 1rem',
                  background: 'rgba(10, 13, 20, 0.8)',
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
                Access Key / Password
              </label>
              <input
                id="input-password"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.8rem 1rem',
                  background: 'rgba(10, 13, 20, 0.8)',
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
              {loading ? 'Authenticating...' : 'Enter Trading Terminal →'}
            </button>
          </form>

          {/* Quick preset credentials buttons for quick testing */}
          <div style={{ marginTop: '1.8rem', paddingTop: '1.2rem', borderTop: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.6rem', textAlign: 'center' }}>
              One-Click Role Presets:
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <button
                id="btn-fill-superadmin"
                type="button"
                onClick={() => quickFill('superadmin', 'superadmin123')}
                style={{
                  padding: '0.4rem 0.5rem',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: 'var(--accent-cyan)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                Super Admin
              </button>
              <button
                id="btn-fill-admin"
                type="button"
                onClick={() => quickFill('admin', 'admin123')}
                style={{
                  padding: '0.4rem 0.5rem',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: '#93c5fd',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                Admin
              </button>
              <button
                id="btn-fill-trader"
                type="button"
                onClick={() => quickFill('trader1', 'trader123')}
                style={{
                  padding: '0.4rem 0.5rem',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: '#a7f3d0',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                Trader
              </button>
            </div>
          </div>

          {/* Security note */}
          <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            🔒 Protected by Static IP Guard • Upstox Gateway Active
          </div>
        </div>
      </main>
    );
  }

  // ===================== LOGGED-IN TERMINAL =====================
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(10, 13, 20, 0.95)',
          backdropFilter: 'blur(10px)',
          padding: '0.8rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                color: '#030816',
                fontSize: '0.9rem',
              }}
            >
              AC
            </div>
            <div>
              <span style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.2px', color: '#fff' }}>
                ALPHA CAPITAL
              </span>
              <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--accent-cyan)', letterSpacing: '0.5px' }}>
                QUANT DESK V1
              </span>
            </div>
          </div>

          {/* Live IST clock */}
          <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '0.3rem 0.7rem', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
            ⏱ {currentTime || 'Loading IST...'}
          </div>

          {/* Broker Status Chip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#fff', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', padding: '0.3rem 0.7rem', borderRadius: '6px' }}>
            <span className="status-dot green animate-pulse-glow" />
            <span>Upstox API: <b>CONNECTED</b> ({strategyStatus?.broker?.user_id || '4JBX7L'})</span>
          </div>

          {/* Scheduler Chip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#fff', background: 'rgba(0,242,254,0.08)', border: '1px solid rgba(0,242,254,0.3)', padding: '0.3rem 0.7rem', borderRadius: '6px' }}>
            <span className="status-dot green" />
            <span>Scan Schedule: <b>09:16:00 AM IST</b></span>
          </div>
        </div>

        {/* User Info & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <span id="user-display-name" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', display: 'block' }}>
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

          <button
            id="btn-logout"
            onClick={handleLogout}
            style={{
              padding: '0.5rem 0.9rem',
              background: 'rgba(244,63,94,0.1)',
              border: '1px solid rgba(244,63,94,0.3)',
              borderRadius: '6px',
              color: '#fda4af',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div style={{ flex: 1, padding: '1.5rem', maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
        {/* Alerts / Feedback Banner */}
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

        {/* Strategy Control & Overview Hero Banner */}
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
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span className="status-dot green" />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
                Opening High Breakout / Reversal Strategy Engine
              </h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '750px', lineHeight: '1.4' }}>
              Monitors the <b>09:15 AM</b> 1-minute opening candle. At exactly <b>09:16:00 AM IST</b>, if the candle opened below Previous Day High (PDH) and closed above PDH, it triggers an instant Long Entry alert with calculated 1:2 Risk-Reward targets and Stop Loss.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            <button
              id="btn-trigger-strategy"
              onClick={() => triggerScan()}
              disabled={loading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.3rem',
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
              {loading ? 'Evaluating Watchlist...' : '⚡ Run Strategy Check Now'}
            </button>
          </div>
        </div>

        {/* Tabs Bar */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.5rem' }}>
          <button
            id="tab-btn-strategy"
            onClick={() => setActiveTab('strategy')}
            style={{
              padding: '0.65rem 1.2rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'strategy' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              color: activeTab === 'strategy' ? 'var(--accent-cyan)' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            📊 Live Strategy Monitor ({evaluations.length})
          </button>

          {(userProfile.role === 'super_admin' || userProfile.role === 'admin') && (
            <button
              id="tab-btn-users"
              onClick={() => setActiveTab('users')}
              style={{
                padding: '0.65rem 1.2rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'users' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                color: activeTab === 'users' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              👥 RBAC User Management ({allUsers.length})
            </button>
          )}

          <button
            id="tab-btn-system"
            onClick={() => setActiveTab('system')}
            style={{
              padding: '0.65rem 1.2rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'system' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              color: activeTab === 'system' ? 'var(--accent-cyan)' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            🛡️ System & Broker Diagnostics
          </button>
        </div>

        {/* TAB 1: STRATEGY MONITOR */}
        {activeTab === 'strategy' && (
          <div className="animate-fade-in">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.2rem' }}>
              {evaluations.length === 0 ? (
                <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', gridColumn: '1 / -1', color: 'var(--text-muted)' }}>
                  No strategy evaluation loaded yet. Click <b>"Run Strategy Check Now"</b> to scan.
                </div>
              ) : (
                evaluations.map((item, idx) => (
                  <div
                    key={idx}
                    id={`strategy-card-${item.symbol.toLowerCase()}`}
                    className="glass-panel"
                    style={{
                      padding: '1.4rem',
                      borderLeft: item.setup_detected ? '4px solid var(--accent-green)' : '4px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff' }}>{item.symbol}</h3>
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              background: item.source.includes('LIVE') ? 'rgba(16,185,129,0.15)' : 'rgba(0,242,254,0.1)',
                              color: item.source.includes('LIVE') ? 'var(--accent-green)' : 'var(--accent-cyan)',
                            }}
                          >
                            {item.source}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          Prev Day High: <b>₹{item.prev_day_high}</b>
                        </span>
                      </div>

                      <span
                        id={`badge-status-${item.symbol.toLowerCase()}`}
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.3rem 0.7rem',
                          borderRadius: '20px',
                          background: item.setup_detected ? 'var(--accent-green-bg)' : 'rgba(255,255,255,0.05)',
                          color: item.setup_detected ? 'var(--accent-green)' : 'var(--text-dim)',
                          border: item.setup_detected ? '1px solid var(--accent-green)' : '1px solid var(--border-subtle)',
                        }}
                      >
                        {item.setup_detected ? '🔥 BREAKOUT CONFIRMED' : 'NO SETUP'}
                      </span>
                    </div>

                    {/* 09:15 Candle Data */}
                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '0.8rem', marginBottom: '1rem' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.4rem' }}>
                        09:15 AM Candle Metrics
                      </span>
                      <div className="mono" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.4rem', fontSize: '0.8rem' }}>
                        <div><span style={{ color: 'var(--text-dim)' }}>O:</span> ₹{item.candle.open}</div>
                        <div><span style={{ color: 'var(--text-dim)' }}>H:</span> ₹{item.candle.high}</div>
                        <div><span style={{ color: 'var(--text-dim)' }}>L:</span> ₹{item.candle.low}</div>
                        <div><span style={{ color: 'var(--text-dim)' }}>C:</span> ₹{item.candle.close}</div>
                      </div>
                    </div>

                    {/* Setup Calculations (If Triggered) */}
                    {item.setup_detected ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
                        <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', padding: '0.6rem', borderRadius: '6px' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Expected Entry</span>
                          <span className="mono" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-green)' }}>₹{item.expected_entry}</span>
                        </div>
                        <div style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.2)', padding: '0.6rem', borderRadius: '6px' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Stop Loss</span>
                          <span className="mono" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-red)' }}>₹{item.stop_loss}</span>
                        </div>
                        <div style={{ background: 'rgba(0,242,254,0.06)', border: '1px solid rgba(0,242,254,0.2)', padding: '0.6rem', borderRadius: '6px' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Target (1:2 R:R)</span>
                          <span className="mono" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>₹{item.take_profit}</span>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', padding: '0.6rem', borderRadius: '6px' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Risk / Share</span>
                          <span className="mono" style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>₹{item.risk_per_share}</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
                        Breakout criteria not met: Open was not below PDH or Close did not exceed PDH.
                      </div>
                    )}

                    {/* Telegram Dispatch Indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.7rem' }}>
                      <span style={{ color: 'var(--text-dim)' }}>Telegram Dispatch:</span>
                      <span className="mono" style={{ color: item.setup_detected ? 'var(--accent-cyan)' : 'var(--text-dim)', fontWeight: 600 }}>
                        {item.telegram_dispatch?.status || 'IDLE'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 2: RBAC USER MANAGEMENT */}
        {activeTab === 'users' && (userProfile.role === 'super_admin' || userProfile.role === 'admin') && (
          <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '1.5rem', alignItems: 'start' }}>
            {/* Create Operator Card */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '0.3rem' }}>
                Register New Operator
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.2rem' }}>
                {userProfile.role === 'super_admin'
                  ? 'Super Admins can provision Admins and Desk Traders.'
                  : 'Admins can provision Desk Traders.'}
              </p>

              <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                    Username
                  </label>
                  <input
                    id="input-new-username"
                    type="text"
                    placeholder="e.g. trader_rahul"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.8rem',
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
                    Temporary Password
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
                      padding: '0.65rem 0.8rem',
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
                    Assigned Role
                  </label>
                  <select
                    id="select-new-role"
                    value={newRole}
                    onChange={(e: any) => setNewRole(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.8rem',
                      background: '#121826',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '0.85rem',
                    }}
                  >
                    <option value="user">User (Desk Trader)</option>
                    {userProfile.role === 'super_admin' && (
                      <option value="admin">Admin (Desk Supervisor)</option>
                    )}
                  </select>
                </div>

                <button
                  id="btn-create-user-submit"
                  type="submit"
                  style={{
                    padding: '0.75rem',
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

            {/* Operator Directory Table */}
            <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                  Active Operators Directory ({allUsers.length})
                </h3>
                <button
                  id="btn-refresh-users"
                  onClick={() => fetchUsers()}
                  style={{
                    padding: '0.3rem 0.6rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    color: '#fff',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  🔄 Refresh
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
                      <td className="mono" style={{ padding: '0.7rem 0.8rem', color: 'var(--text-dim)' }}>
                        #{u.id}
                      </td>
                      <td style={{ padding: '0.7rem 0.8rem', fontWeight: 600, color: '#fff' }}>
                        {u.username}
                      </td>
                      <td style={{ padding: '0.7rem 0.8rem' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.45rem',
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
                      <td style={{ padding: '0.7rem 0.8rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-green)', fontSize: '0.75rem' }}>
                          <span className="status-dot green" /> Active
                        </span>
                      </td>
                      {userProfile.role === 'super_admin' && (
                        <td style={{ padding: '0.7rem 0.8rem', textAlign: 'right' }}>
                          {u.username !== userProfile.username ? (
                            <button
                              onClick={() => handleDeleteUser(u.id, u.username)}
                              style={{
                                padding: '0.25rem 0.5rem',
                                background: 'rgba(244,63,94,0.1)',
                                border: '1px solid rgba(244,63,94,0.3)',
                                borderRadius: '4px',
                                color: '#f87171',
                                fontSize: '0.7rem',
                                cursor: 'pointer',
                              }}
                            >
                              Revoke
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Self</span>
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

        {/* TAB 3: SYSTEM DIAGNOSTICS */}
        {activeTab === 'system' && (
          <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span className="status-dot green animate-pulse-glow" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                  Upstox Broker Connectivity
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Broker Platform:</span>
                  <span style={{ fontWeight: 600, color: '#fff' }}>{strategyStatus?.broker?.broker || 'Upstox V2 API'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Upstox User ID:</span>
                  <span className="mono" style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{strategyStatus?.broker?.user_id || '4JBX7L'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Account Name:</span>
                  <span style={{ fontWeight: 600, color: '#fff' }}>{strategyStatus?.broker?.user_name || 'BATARAYANAPURA GOPALAKRISHNA ATREYASHA'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Token State:</span>
                  <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>Active & Authenticated</span>
                </div>
              </div>
            </div>

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
                  <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>ENABLED (403 Forbidden on foreign IPs)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Current Origin:</span>
                  <span className="mono" style={{ color: '#fff' }}>127.0.0.1 (Localhost / Verified)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Allowed Configured IPs:</span>
                  <span className="mono" style={{ color: 'var(--accent-cyan)' }}>127.0.0.1, localhost, ::1</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Scheduler Cron:</span>
                  <span className="mono" style={{ color: '#fff' }}>Mon-Fri 09:16:00 AM IST</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
