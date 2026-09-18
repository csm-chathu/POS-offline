import { useState, useCallback, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { selectToken } from '../../features/auth/authSlice';
import { getApiUrl } from '../../config/runtimeConfig';

const API = getApiUrl();

const FIELD = (label, key, opts = {}) => ({ label, key, ...opts });
const TENANT_FIELDS = [
  FIELD('Hostname',    'hostname',    { placeholder: 'newshop-pos.lumac.cc' }),
  FIELD('DB Name',     'db_name',     { placeholder: 'newshop_pos' }),
  FIELD('DB Host',     'db_host',     { placeholder: '127.0.0.1' }),
  FIELD('DB User',     'db_user',     { placeholder: 'pos_user' }),
  FIELD('DB Password', 'db_password', { placeholder: '••••••••', type: 'password' }),
];
const ADMIN_FIELDS = [
  FIELD('Admin Name',     'admin_name',     { placeholder: 'Admin' }),
  FIELD('Admin Email / Username', 'admin_email',    { placeholder: 'admin@shop.lk' }),
  FIELD('Admin Password', 'admin_password', { placeholder: '••••••••', type: 'password' }),
];

const DEFAULT = {
  hostname: '', db_name: '', db_host: '127.0.0.1', db_user: 'pos_user', db_password: '',
  admin_name: 'Admin', admin_email: '', admin_password: '',
  copy_products: true,
};

function slugify(hostname) {
  return hostname.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

const IconCheck  = <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>;
const IconError  = <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>;
const IconSpin   = <svg className="w-4 h-4 text-blue-400 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>;

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy} title="Copy"
      className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${copied ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function CredentialRow({ label, value, secret }) {
  const [show, setShow] = useState(false);
  const display = secret && !show ? '••••••••' : value;
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
        <p className="text-sm font-mono text-slate-800 truncate">{display}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {secret && (
          <button onClick={() => setShow(s => !s)}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
            {show ? 'Hide' : 'Show'}
          </button>
        )}
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function CredentialCard({ hostname, email, password }) {
  const url = `https://${hostname}`;
  return (
    <div className="border-t border-green-100 bg-green-50">
      <div className="px-5 py-3 border-b border-green-100 flex items-center gap-2">
        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
        <p className="text-sm font-bold text-green-700">Tenant ready — share these credentials</p>
      </div>
      <div className="bg-white">
        <CredentialRow label="URL" value={url} />
        <CredentialRow label="Email / Username" value={email} />
        <CredentialRow label="Password" value={password} secret />
      </div>
    </div>
  );
}

const EDIT_FIELDS = [
  { key: 'hostname',    label: 'Hostname' },
  { key: 'db_name',     label: 'DB Name' },
  { key: 'db_host',     label: 'DB Host' },
  { key: 'db_port',     label: 'Port' },
  { key: 'db_user',     label: 'DB User' },
  { key: 'db_password', label: 'DB Password', secret: true },
];

function TenantTable({ token }) {
  const [tenants, setTenants]   = useState([]);
  const [editId, setEditId]     = useState(null);
  const [editRow, setEditRow]   = useState({});
  const [saving, setSaving]     = useState(false);
  const [showPw, setShowPw]     = useState({});

  useEffect(() => { load(); }, []);

  async function load() {
    const r = await fetch(`${API}/api/tenants`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setTenants(await r.json());
  }

  function startEdit(t) {
    setEditId(t.id);
    setEditRow({ ...t });
  }

  async function saveEdit() {
    setSaving(true);
    await fetch(`${API}/api/tenants/${editId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(editRow),
    });
    setSaving(false);
    setEditId(null);
    load();
  }

  async function toggleActive(t) {
    await fetch(`${API}/api/tenants/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...t, active: !t.active }),
    });
    load();
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tenants</p>
        <button onClick={load} className="text-xs text-slate-400 hover:text-slate-600">Refresh</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              {['Hostname', 'DB Name', 'DB Host', 'Port', 'DB User', 'DB Password', 'Active', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {tenants.map(t => (
              <tr key={t.id} className={editId === t.id ? 'bg-blue-50' : 'hover:bg-slate-50'}>
                {EDIT_FIELDS.map(({ key, secret }) => (
                  <td key={key} className="px-4 py-2.5 whitespace-nowrap">
                    {editId === t.id ? (
                      <input
                        type={secret && !showPw[key] ? 'password' : 'text'}
                        value={editRow[key] ?? ''}
                        onChange={e => setEditRow(r => ({ ...r, [key]: e.target.value }))}
                        className="w-full min-w-[100px] border border-blue-300 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <span className="font-mono text-xs text-slate-700">
                        {secret ? '••••••••' : (t[key] ?? '—')}
                      </span>
                    )}
                  </td>
                ))}

                {/* Active toggle */}
                <td className="px-4 py-2.5">
                  <button onClick={() => toggleActive(t)}
                    className={`relative w-9 h-5 rounded-full transition-colors ${t.active ? 'bg-green-500' : 'bg-slate-200'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${t.active ? 'translate-x-4' : ''}`} />
                  </button>
                </td>

                {/* Actions */}
                <td className="px-4 py-2.5">
                  {editId === t.id ? (
                    <div className="flex items-center gap-1.5">
                      <button onClick={saveEdit} disabled={saving}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditId(null)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(t)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200">
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MigratePanel({ token }) {
  const [lines, setLines]     = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone]       = useState(false);

  async function runMigrations() {
    setLines([]);
    setDone(false);
    setRunning(true);
    try {
      const resp = await fetch(`${API}/api/tenants/migrate-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n');
        buf = parts.pop();
        for (const part of parts) {
          if (!part.startsWith('data:')) continue;
          const payload = JSON.parse(part.slice(5).trim());
          if (payload.status === 'done') { setDone(true); continue; }
          setLines(l => [...l, payload]);
        }
      }
    } catch (err) {
      setLines(l => [...l, { tenant: '', message: err.message, status: 'error' }]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Database Migrations</p>
          <p className="text-xs text-slate-400 mt-0.5">Run pending SQL migrations on all active tenant databases</p>
        </div>
        <button
          onClick={runMigrations}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {running && <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>}
          {running ? 'Running…' : 'Run Migrations'}
        </button>
      </div>

      {lines.length > 0 && (
        <ul className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
          {lines.map((l, i) => (
            <li key={i} className="flex items-start gap-3 px-5 py-2.5 text-xs">
              {l.status === 'error' ? IconError : IconCheck}
              <div>
                {l.tenant && <span className="font-semibold text-slate-600 mr-1.5">{l.tenant}</span>}
                <span className={l.status === 'error' ? 'text-red-600' : 'text-slate-600'}>{l.message}</span>
              </div>
            </li>
          ))}
          {done && (
            <li className="px-5 py-2.5 text-xs font-bold text-green-600 bg-green-50">All tenants processed.</li>
          )}
        </ul>
      )}

      {!lines.length && !running && (
        <div className="px-5 py-4 text-xs text-slate-400">
          Click "Run Migrations" to apply any pending SQL migration files to all active tenant databases.
        </div>
      )}
    </div>
  );
}

export default function ProvisionTenant() {
  const token = useSelector(selectToken);
  const [form, setForm]       = useState(DEFAULT);
  const [steps, setSteps]     = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone]       = useState(false);
  const [fatal, setFatal]     = useState('');
  const [tableKey, setTableKey] = useState(0); // bump to force TenantTable reload

  function set(key, val) {
    setForm(f => {
      const next = { ...f, [key]: val };
      if (key === 'hostname' && !f.db_name) next.db_name = slugify(val);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSteps([]);
    setDone(false);
    setFatal('');
    setRunning(true);

    try {
      const resp = await fetch(`${API}/api/tenants/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, db_port: 3306 }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        setFatal(err.error || `HTTP ${resp.status}`);
        setRunning(false);
        return;
      }

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = JSON.parse(line.slice(5).trim());
          if (payload.status === 'done') {
            setDone(true);
            setTableKey(k => k + 1);
          } else {
            setSteps(s => [...s, payload]);
          }
        }
      }
    } catch (err) {
      setFatal(err.message || 'Network error');
    } finally {
      setRunning(false);
    }
  }

  const hasError = steps.some(s => s.status === 'error');
  const showProgress = steps.length > 0 || running || fatal;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Provision New Tenant</h1>
        <p className="text-sm text-slate-400 mt-1">Creates the database, migrates tables, seeds roles & features, and copies the product catalog.</p>
      </div>

      <div className="flex gap-6 items-start">
        {/* ── Left: Form ───────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="flex-1 min-w-0 space-y-4">
          {/* Tenant DB */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tenant Database</p>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              {TENANT_FIELDS.map(({ label, key, placeholder, type = 'text' }) => (
                <div key={key} className={key === 'hostname' ? 'col-span-2' : ''}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
                  <input
                    type={type}
                    required={['hostname','db_name','db_password'].includes(key)}
                    value={form[key]}
                    placeholder={placeholder}
                    onChange={e => set(key, e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Admin user */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Admin User</p>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              {ADMIN_FIELDS.map(({ label, key, placeholder, type = 'text' }) => (
                <div key={key} className={key === 'admin_email' ? 'col-span-2' : ''}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
                  <input
                    type={type}
                    required
                    value={form[key]}
                    placeholder={placeholder}
                    onChange={e => set(key, e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Options */}
          <label className="flex items-center gap-3 px-5 py-4 bg-white rounded-2xl border border-slate-100 shadow-sm cursor-pointer">
            <div className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${form.copy_products ? 'bg-blue-500' : 'bg-slate-200'}`}>
              <input type="checkbox" className="sr-only" checked={form.copy_products} onChange={e => set('copy_products', e.target.checked)} />
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.copy_products ? 'translate-x-5' : ''}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Copy sample products</p>
              <p className="text-xs text-slate-400">Copy all categories and products from the master catalog</p>
            </div>
          </label>

          <button
            type="submit"
            disabled={running}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm disabled:opacity-60 hover:bg-blue-700 active:bg-blue-800 transition-colors shadow flex items-center justify-center gap-2"
          >
            {running && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>}
            {running ? 'Provisioning…' : 'Provision Tenant'}
          </button>
        </form>

        {/* ── Right: Progress ───────────────────────────────────────────── */}
        <div className="w-80 shrink-0 sticky top-6">
          {showProgress ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Progress</p>
                {done && !hasError && <span className="text-xs font-bold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">Complete</span>}
                {hasError && <span className="text-xs font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">Failed</span>}
                {running && !done && <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">Running…</span>}
              </div>
              <ul className="divide-y divide-slate-50">
                {steps.map((s, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-3 text-sm">
                    {s.status === 'error' ? IconError : IconCheck}
                    <span className={s.status === 'error' ? 'text-red-600' : 'text-slate-700'}>{s.step}</span>
                  </li>
                ))}
                {running && !done && (
                  <li className="flex items-center gap-3 px-5 py-3 text-sm text-slate-400">
                    {IconSpin}
                    <span>Working…</span>
                  </li>
                )}
              </ul>
              {fatal && (
                <div className="px-5 py-3 bg-red-50 border-t border-red-100 text-sm text-red-600 font-medium">{fatal}</div>
              )}
              {done && !hasError && (
                <CredentialCard hostname={form.hostname} email={form.admin_email} password={form.admin_password} />
              )}
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center">
              <p className="text-sm text-slate-400">Progress will appear here when you provision a tenant.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Migrations ────────────────────────────────────────────────── */}
      <div className="mt-8">
        <MigratePanel token={token} />
      </div>

      {/* ── Tenant list ───────────────────────────────────────────────── */}
      <div className="mt-6">
        <TenantTable key={tableKey} token={token} />
      </div>
    </div>
  );
}
