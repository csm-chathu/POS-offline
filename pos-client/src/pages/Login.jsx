import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useLoginMutation } from '../features/auth/authApi';
import { setCredentials } from '../features/auth/authSlice';
import { getApiUrl } from '../config/runtimeConfig';

const API = getApiUrl();
const OFFLINE_KEY = 'pos_offline_creds';

async function hashCreds(email, password) {
  const data = new TextEncoder().encode(email.toLowerCase().trim() + ':' + password);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function saveOfflineCreds(hash, auth, appInfo) {
  try {
    localStorage.setItem(OFFLINE_KEY, JSON.stringify({ hash, auth, appInfo }));
  } catch {}
}

function loadOfflineCreds() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || 'null'); } catch { return null; }
}

const DEMO = [
  {
    role: 'Admin',
    email: 'admin@lmucpos.lk',
    badge: 'සියලු අයිතිවාසිකම්',
    bg: 'bg-blue-600',
    cardBg: 'bg-blue-50',
    badgeBg: 'bg-purple-100 text-purple-700',
  },
  {
    role: 'Manager',
    email: 'manager@lmucpos.lk',
    badge: 'කළමනාකරණ',
    bg: 'bg-purple-500',
    cardBg: 'bg-purple-50',
    badgeBg: 'bg-pink-100 text-pink-700',
  },
  {
    role: 'Cashier',
    email: 'cashier@lmucpos.lk',
    badge: 'බිල්පත් කිරීම',
    bg: 'bg-teal-500',
    cardBg: 'bg-teal-50',
    badgeBg: 'bg-teal-100 text-teal-700',
  },
];

export default function Login() {
  const [form, setForm]       = useState({ email: 'admin@lumac.lk', password: '' });
  const [error, setError]     = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [appInfo, setAppInfo] = useState(() => {
    const cached = loadOfflineCreds();
    return cached?.appInfo || { shop_name: 'LMUC POS', shop_logo: '' };
  });

  const passwordRef = useRef();
  const [login, { isLoading }] = useLoginMutation();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    const on  = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    fetch(`${API}/api/settings/public`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setAppInfo(d))
      .catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Try online login first
    if (!isOffline) {
      try {
        const res = await login(form).unwrap();
        // Cache credentials for future offline use
        const hash = await hashCreds(form.email, form.password);
        saveOfflineCreds(hash, res, appInfo);
        dispatch(setCredentials(res));
        navigate('/sales/create');
        return;
      } catch (err) {
        // Network error → fall through to offline check
        const isNetworkError = err?.status === 'FETCH_ERROR' || err?.status === 'PARSING_ERROR';
        if (!isNetworkError) {
          setError(err?.data?.error || 'Login failed');
          return;
        }
      }
    }

    // Offline fallback — verify against cached hash
    try {
      const stored = loadOfflineCreds();
      if (!stored) { setError('No offline credentials saved. Please log in online first.'); return; }
      const hash = await hashCreds(form.email, form.password);
      if (hash !== stored.hash) { setError('Incorrect email or password'); return; }
      dispatch(setCredentials(stored.auth));
      navigate('/sales/create');
    } catch {
      setError('Offline login failed');
    }
  }

  function fillDemo(email) {
    setForm({ email, password: 'password' });
  }

  return (
    <div>
      {/* Logo + brand */}
      <div className="flex flex-col items-center mb-5">
        {appInfo.shop_logo ? (
          <img
            src={appInfo.shop_logo}
            alt="logo"
            className="w-20 h-20 rounded-full object-cover shadow-md border-4 border-white mb-3"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-white shadow-md border-4 border-white mb-3 flex items-center justify-center overflow-hidden">
            <svg viewBox="0 0 80 80" className="w-full h-full" fill="none">
              <circle cx="40" cy="40" r="40" fill="#1e4d8c" />
              <circle cx="40" cy="28" r="12" fill="#fff" opacity=".9" />
              <ellipse cx="40" cy="62" rx="20" ry="14" fill="#fff" opacity=".9" />
            </svg>
          </div>
        )}
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">
          {appInfo.shop_name || 'LMUC POS'}
        </h1>
        <p className="text-sm text-slate-500">Point of Sale System</p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-800">Sign In</h2>
          {isOffline ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Offline
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Online
            </span>
          )}
        </div>
        {isOffline && loadOfflineCreds() && (
          <div className="mb-4 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            You're offline. Sign in with your saved credentials.
          </div>
        )}
        {isOffline && !loadOfflineCreds() && (
          <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            No offline credentials saved. Connect to the internet to log in.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email" required autoFocus
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              onBlur={e => { if (e.target.value.trim()) passwordRef.current?.focus(); }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              ref={passwordRef}
              type="password" required
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit" disabled={isLoading}
            className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm disabled:opacity-60 hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            {isLoading && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            )}
            {isLoading ? 'Signing in…' : isOffline ? 'Sign In Offline' : 'Sign In'}
          </button>
        </form>

      </div>
    </div>
  );
}
