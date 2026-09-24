import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useLoginMutation } from '../features/auth/authApi';
import { setCredentials } from '../features/auth/authSlice';
import { getApiUrl } from '../config/runtimeConfig';
import { useTheme } from '../contexts/ThemeContext';

const API = getApiUrl();
const OFFLINE_KEY = 'pos_offline_creds';

function getHomeRoute(auth) {
  const features = auth?.user?.features ?? null; // null = admin
  if (features === null || features.includes('pos')) return '/sales/create';
  if (features.includes('users'))            return '/users';
  if (features.includes('reports'))          return '/reports';
  if (features.includes('products'))         return '/products';
  if (features.includes('role_permissions')) return '/settings/roles';
  if (features.includes('settings'))         return '/settings';
  return '/sales/create'; // fallback
}

const ROLE_COLORS = {
  setup:   { avatar: 'bg-purple-600', badge: 'bg-purple-100 text-purple-700', btn: 'from-purple-600 to-purple-800', ring: 'ring-purple-400/50' },
  manager: { avatar: 'bg-indigo-600', badge: 'bg-indigo-100 text-indigo-700', btn: 'from-indigo-600 to-indigo-800', ring: 'ring-indigo-400/50' },
  cashier: { avatar: 'bg-teal-600',   badge: 'bg-teal-100 text-teal-700',     btn: 'from-teal-600 to-teal-800',   ring: 'ring-teal-400/50'   },
  custom:  { avatar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700', btn: 'from-orange-500 to-orange-700', ring: 'ring-orange-400/50' },
};
const DEFAULT_COLORS = { avatar: 'bg-slate-600', badge: 'bg-slate-100 text-slate-700', btn: 'from-slate-600 to-slate-800', ring: 'ring-slate-400/50' };

const ROLE_LABELS = { cashier: 'Cashier', setup: 'Setup', manager: 'Manager', custom: 'Custom' };

function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?';
}

async function hashCreds(email, password) {
  const data = new TextEncoder().encode(email.toLowerCase().trim() + ':' + password);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function saveOfflineCreds(hash, auth, appInfo) {
  try { localStorage.setItem(OFFLINE_KEY, JSON.stringify({ hash, auth, appInfo })); } catch {}
}
function loadOfflineCreds() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || 'null'); } catch { return null; }
}

export default function Login() {
  const [users, setUsers]           = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [selected, setSelected]     = useState(null);
  const [pwVisible, setPwVisible]   = useState(false);
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');
  const [emailMode, setEmailMode]   = useState(false);
  const [emailForm, setEmailForm]   = useState({ email: '', password: '' });
  const [isOffline, setIsOffline]   = useState(!navigator.onLine);
  const [entered, setEntered]       = useState(false);
  const [appInfo, setAppInfo]       = useState(() => {
    const c = loadOfflineCreds();
    return c?.appInfo || { shop_name: 'LMUC POS', shop_logo: '' };
  });

  const passwordRef = useRef();
  const emailRef    = useRef();
  const [login, { isLoading }] = useLoginMutation();
  const { theme, setTheme } = useTheme();
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
      .then(d => { if (d) setAppInfo(d); })
      .catch(() => {});

    fetch(`${API}/api/users/public`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { setUsers(data); setUsersLoading(false); })
      .catch(() => { setUsers([]); setUsersLoading(false); });

    setTimeout(() => setEntered(true), 50);
  }, []);

  useEffect(() => {
    if (selected) {
      setTimeout(() => { setPwVisible(true); }, 20);
      setTimeout(() => passwordRef.current?.focus(), 380);
    } else {
      setPwVisible(false);
    }
  }, [selected]);

  useEffect(() => {
    if (emailMode) setTimeout(() => emailRef.current?.focus(), 100);
  }, [emailMode]);

  async function doLogin(email, pwd) {
    setError('');
    if (!isOffline) {
      try {
        const res = await login({ email, password: pwd }).unwrap();
        const hash = await hashCreds(email, pwd);
        saveOfflineCreds(hash, res, appInfo);
        dispatch(setCredentials(res));
        navigate(getHomeRoute(res));
        return;
      } catch (err) {
        const isNetworkError = err?.status === 'FETCH_ERROR' || err?.status === 'PARSING_ERROR';
        if (!isNetworkError) { setError(err?.data?.error || 'Incorrect password'); return; }
      }
    }
    try {
      const stored = loadOfflineCreds();
      if (!stored) { setError('No offline credentials saved. Connect to internet first.'); return; }
      const hash = await hashCreds(email, pwd);
      if (hash !== stored.hash) { setError('Incorrect password'); return; }
      dispatch(setCredentials(stored.auth));
      navigate(getHomeRoute(stored.auth));
    } catch { setError('Login failed'); }
  }

  function selectUser(u) {
    setSelected(u);
    setPassword('');
    setError('');
  }

  function backToTiles() {
    setPwVisible(false);
    setTimeout(() => setSelected(null), 280);
    setPassword('');
    setError('');
  }

  const gridCols = users.length === 1 ? 'grid-cols-1' :
                   users.length === 2 ? 'grid-cols-2' :
                   users.length === 4 ? 'grid-cols-2' : 'grid-cols-3';

  /* ── Email/Admin fallback form ─────────────────────────── */
  if (emailMode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div
          className={`w-full max-w-sm transition-all duration-500 ${entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <div className="flex flex-col items-center mb-6">
            <LogoAvatar appInfo={appInfo} />
            <h1 className="text-xl font-bold text-white mt-3">{appInfo.shop_name || 'LMUC POS'}</h1>
          </div>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-7 shadow-2xl">
            <h2 className="text-white font-semibold text-lg mb-5">Sign In</h2>
            <form
              onSubmit={async e => { e.preventDefault(); await doLogin(emailForm.email, emailForm.password); }}
              className="space-y-4"
            >
              <div>
                <label className="block text-white/70 text-xs font-medium mb-1.5">Email / Username</label>
                <input
                  ref={emailRef}
                  type="text" required autoComplete="username"
                  value={emailForm.email}
                  onChange={e => setEmailForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-xl bg-white/10 border border-white/25 px-4 py-2.5 text-white placeholder-white/30 text-sm outline-none focus:ring-2 focus:ring-white/40 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="block text-white/70 text-xs font-medium mb-1.5">Password</label>
                <input
                  type="password" required autoComplete="current-password"
                  value={emailForm.password}
                  onChange={e => setEmailForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full rounded-xl bg-white/10 border border-white/25 px-4 py-2.5 text-white placeholder-white/30 text-sm outline-none focus:ring-2 focus:ring-white/40 focus:border-transparent transition"
                />
              </div>
              {error && <p className="text-red-300 text-xs bg-red-500/20 rounded-lg px-3 py-2 text-center">{error}</p>}
              <button
                type="submit" disabled={isLoading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 text-white font-semibold text-sm shadow-lg hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading && <Spinner />}
                {isLoading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>
          <button
            onClick={() => { setEmailMode(false); setError(''); }}
            className="w-full mt-4 text-white/40 hover:text-white/70 text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <ChevronLeft /> Back to accounts
          </button>
        </div>
        <StatusBadge isOffline={isOffline} />
      </div>
    );
  }

  /* ── Password entry phase ──────────────────────────────── */
  if (selected) {
    const c = ROLE_COLORS[selected.role] ?? DEFAULT_COLORS;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div
          className={`w-full max-w-xs transition-all duration-300 ${pwVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'}`}
        >
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-8 shadow-2xl">
            <div className="flex flex-col items-center mb-6">
              <div className={`w-20 h-20 rounded-full ${c.avatar} flex items-center justify-center text-white text-2xl font-bold shadow-xl ring-4 ${c.ring} mb-3`}>
                {getInitials(selected.name)}
              </div>
              <span className="text-white font-bold text-lg leading-tight text-center">{selected.name}</span>
              <span className={`mt-2 px-3 py-0.5 rounded-full text-xs font-medium ${c.badge}`}>
                {ROLE_LABELS[selected.role] ?? selected.role}
              </span>
            </div>
            <form onSubmit={e => { e.preventDefault(); doLogin(selected.email, password); }} className="space-y-4">
              <input
                ref={passwordRef}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full rounded-xl bg-white/10 border border-white/30 px-4 py-3 text-white placeholder-white/30 text-sm outline-none focus:ring-2 focus:ring-white/40 focus:border-transparent transition text-center tracking-[0.3em]"
              />
              {error && <p className="text-red-300 text-xs bg-red-500/20 rounded-lg px-3 py-2 text-center">{error}</p>}
              <button
                type="submit" disabled={isLoading || !password}
                className={`w-full py-3 rounded-xl bg-gradient-to-r ${c.btn} text-white font-semibold text-sm shadow-lg hover:opacity-90 active:opacity-80 transition-all disabled:opacity-40 flex items-center justify-center gap-2`}
              >
                {isLoading && <Spinner />}
                {isLoading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>
          <button
            onClick={backToTiles}
            className="w-full mt-4 text-white/40 hover:text-white/70 text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <ChevronLeft /> Back to accounts
          </button>
        </div>
        <StatusBadge isOffline={isOffline} />
      </div>
    );
  }

  /* ── User tile selection phase ─────────────────────────── */
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 relative">
      {/* Theme toggle */}
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="absolute top-4 right-4 p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" strokeWidth={2}/><path strokeLinecap="round" strokeWidth={2} d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        )}
      </button>
      {/* Header */}
      <div className={`flex flex-col items-center mb-8 transition-all duration-700 ${entered ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'}`}>
        <LogoAvatar appInfo={appInfo} />
        <h1 className="text-2xl font-bold text-white tracking-tight drop-shadow mt-3">
          {appInfo.shop_name || 'LMUC POS'}
        </h1>
        <p className="text-white/50 text-sm mt-1">Select your account to sign in</p>
      </div>

      {/* Tiles */}
      <div className={`w-full max-w-lg transition-all duration-500 ${entered ? 'opacity-100' : 'opacity-0'}`}>
        {usersLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-9 h-9 border-4 border-white/20 border-t-white/70 rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-white/40 text-center text-sm py-8">No accounts found</p>
        ) : (
          <div className={`grid gap-4 ${gridCols}`}>
            {users.map((u, i) => {
              const c = ROLE_COLORS[u.role] ?? DEFAULT_COLORS;
              return (
                <button
                  key={u.id}
                  onClick={() => selectUser(u)}
                  style={{ transitionDelay: `${80 + i * 70}ms` }}
                  className={`group flex flex-col items-center p-5 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 hover:border-white/40 hover:scale-[1.04] active:scale-95 transition-all duration-300 cursor-pointer shadow-lg ${entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
                >
                  <div className={`w-16 h-16 rounded-full ${c.avatar} flex items-center justify-center text-white text-xl font-bold shadow-lg ring-4 ring-white/10 group-hover:ring-white/30 transition-all mb-3`}>
                    {getInitials(u.name)}
                  </div>
                  <span className="text-white font-semibold text-sm text-center leading-tight">{u.name}</span>
                  <span className={`mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium ${c.badge}`}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div
          className={`text-center mt-8 transition-all duration-700 ${entered ? 'opacity-100' : 'opacity-0'}`}
          style={{ transitionDelay: `${80 + users.length * 70 + 100}ms` }}
        >
          <button
            onClick={() => { setEmailMode(true); setError(''); }}
            className="text-white/30 hover:text-white/60 text-xs transition-colors"
          >
            Sign in with email instead
          </button>
        </div>
      </div>

      <StatusBadge isOffline={isOffline} />
    </div>
  );
}

/* ── Small shared components ───────────────────────────────── */
function LogoAvatar({ appInfo }) {
  if (appInfo.shop_logo) {
    return (
      <img
        src={appInfo.shop_logo}
        alt="logo"
        className="w-20 h-20 rounded-full object-cover shadow-xl border-4 border-white/20"
      />
    );
  }
  return (
    <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur border-4 border-white/20 flex items-center justify-center shadow-xl overflow-hidden">
      <svg viewBox="0 0 80 80" className="w-full h-full" fill="none">
        <circle cx="40" cy="40" r="40" fill="#1e4d8c" />
        <circle cx="40" cy="28" r="12" fill="#fff" opacity=".9" />
        <ellipse cx="40" cy="62" rx="20" ry="14" fill="#fff" opacity=".9" />
      </svg>
    </div>
  );
}

function StatusBadge({ isOffline }) {
  return (
    <div className="mt-8 flex flex-col items-center gap-2">
      {isOffline ? (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />Offline Mode
        </span>
      ) : (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/20 border border-green-400/30 text-green-300 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />Online
        </span>
      )}
      <Link to="/help"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-white/20 text-xs font-medium transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        Help
      </Link>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}
