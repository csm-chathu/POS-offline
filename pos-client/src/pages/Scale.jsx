import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { api } from '../app/baseApi';
import { selectToken } from '../features/auth/authSlice';
import { getApiUrl } from '../config/runtimeConfig';

const API = () => `${getApiUrl()}/api`;

const settingsApi = api.injectEndpoints({
  endpoints: build => ({
    getScaleSettings:  build.query({ query: () => '/settings', providesTags: ['Settings'] }),
    saveScaleSettings: build.mutation({
      query: body => ({ url: '/settings', method: 'POST', body }),
      invalidatesTags: ['Settings'],
    }),
  }),
  overrideExisting: false,
});

const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition';

function StatusBadge({ status, error }) {
  const map = {
    idle:         { dot: 'bg-slate-300', text: 'text-slate-500',  label: 'Not checked' },
    checking:     { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-600', label: 'Connecting…' },
    connected:    { dot: 'bg-green-500', text: 'text-green-700',  label: 'Connected' },
    disconnected: { dot: 'bg-red-500',   text: 'text-red-600',    label: 'Disconnected' },
  };
  const s = map[status] || map.idle;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${s.text}`}>
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} />
      {s.label}
      {error && <span className="font-normal text-slate-400 ml-1">— {error}</span>}
    </span>
  );
}

export default function Scale() {
  const token = useSelector(selectToken);
  const { data, isLoading } = settingsApi.useGetScaleSettingsQuery();
  const [save] = settingsApi.useSaveScaleSettingsMutation();

  // ── Connection config ─────────────────────────────────────────────────────
  const [host, setHost] = useState('');
  const [port, setPort] = useState('8000');
  const [connStatus,   setConnStatus]   = useState('idle');
  const [connError,    setConnError]    = useState('');
  const [lastChecked,  setLastChecked]  = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  // ── Network scan ──────────────────────────────────────────────────────────
  const [ifaces,      setIfaces]      = useState([]);   // [{name, address, subnet}]
  const [scanSubnet,  setScanSubnet]  = useState('');
  const [scanPort,    setScanPort]    = useState('8000');
  const [scanning,    setScanning]    = useState(false);
  const [scanResults, setScanResults] = useState(null);  // null | string[]
  const [scanProgress,setScanProgress]= useState('');
  const [scanError,   setScanError]   = useState('');

  // ── Payload inspector ─────────────────────────────────────────────────────
  const [reading,  setReading]  = useState(false);
  const [payload,  setPayload]  = useState(null);
  const [readErr,  setReadErr]  = useState('');
  const [duration, setDuration] = useState('2000');
  const [viewMode, setViewMode] = useState('ascii');

  useEffect(() => {
    if (data) {
      setHost(data.scale_host || '');
      setPort(data.scale_port || '8000');
    }
  }, [data]);

  // Auto-detect network interfaces on mount
  useEffect(() => {
    fetch(`${API()}/scale/interfaces`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.interfaces?.length) {
          setIfaces(d.interfaces);
          setScanSubnet(d.interfaces[0].subnet);
        }
      })
      .catch(() => {});
  }, [token]);

  // Auto-poll connection status every 10 s when a host is configured
  useEffect(() => {
    if (!host) return;
    const poll = async () => {
      try {
        const res = await fetch(`${API()}/scale/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await res.json();
        setConnStatus(d.connected ? 'connected' : 'disconnected');
        setConnError(d.error || '');
        setLastChecked(new Date());
      } catch { /* network down, keep last status */ }
    };
    poll(); // immediate first check
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  }, [host, token]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleTest() {
    setConnStatus('checking');
    setConnError('');
    try {
      const res = await fetch(`${API()}/scale/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setConnStatus(d.connected ? 'connected' : 'disconnected');
      setConnError(d.error || '');
      setLastChecked(new Date());
    } catch (e) {
      setConnStatus('disconnected');
      setConnError(e.message);
    }
  }

  async function handleSave() {
    setSaving(true);
    await save({ scale_host: host, scale_port: port }).unwrap().catch(() => {});
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleScan() {
    if (!scanSubnet) return;
    setScanning(true);
    setScanResults(null);
    setScanError('');
    setScanProgress(`Scanning ${scanSubnet}.1 – ${scanSubnet}.254 on port ${scanPort}…`);
    try {
      const res = await fetch(`${API()}/scale/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subnet: scanSubnet, port: parseInt(scanPort, 10) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Scan failed');
      setScanResults(d.found);
    } catch (e) {
      setScanError(e.message);
    } finally {
      setScanning(false);
      setScanProgress('');
    }
  }

  function useIp(ip) {
    setHost(ip);
    setPort(scanPort);
    setConnStatus('idle');
    setConnError('');
    setPayload(null);
  }

  async function handleRead() {
    if (!host || !port) return;
    setReading(true);
    setPayload(null);
    setReadErr('');
    try {
      const url = `${API()}/scale/read?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}&duration=${encodeURIComponent(duration)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error || 'Read failed');
      setPayload(d);
      setConnStatus(d.connected ? 'connected' : 'disconnected');
      setConnError(d.error || '');
    } catch (e) {
      setReadErr(e.message);
      setConnStatus('disconnected');
    } finally {
      setReading(false);
    }
  }

  if (isLoading) return <div className="p-8 text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="p-3 sm:p-6 max-w-2xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l9-3 9 3M3 6v12l9 3 9-3V6M12 3v18M3 12h18"/>
        </svg>
        Scale Configuration
      </h1>

      {/* ── 1. Find Scale on Network ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Find Scale on Network</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Scans all 254 hosts on a subnet and finds devices listening on the given port.
          </p>
        </div>
        <div className="p-5 space-y-4">

          {/* Detected interfaces */}
          {ifaces.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {ifaces.map(f => (
                <button key={f.address} type="button"
                  onClick={() => setScanSubnet(f.subnet)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                    scanSubnet === f.subnet
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                  {f.name} — {f.address}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Subnet</label>
              <div className="flex items-center gap-2">
                <input value={scanSubnet} onChange={e => setScanSubnet(e.target.value)}
                  placeholder="192.168.1" className={inputCls} />
                <span className="text-slate-400 text-sm shrink-0">.0/24</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Port</label>
              <input value={scanPort} onChange={e => setScanPort(e.target.value)}
                type="number" min="1" max="65535" className={inputCls} />
            </div>
          </div>

          <button type="button" onClick={handleScan}
            disabled={!scanSubnet || scanning}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm">
            {scanning ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                {scanProgress}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                </svg>
                Find Scale
              </>
            )}
          </button>

          {scanError && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{scanError}</div>
          )}

          {scanResults !== null && (
            scanResults.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-slate-500 bg-slate-50 rounded-xl">
                No devices found on port {scanPort} in {scanSubnet}.0/24
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {scanResults.length} device{scanResults.length !== 1 ? 's' : ''} found
                </p>
                {scanResults.map(ip => (
                  <div key={ip}
                    className="flex items-center justify-between px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                      <div>
                        <span className="text-sm font-mono font-bold text-slate-800">{ip}</span>
                        <span className="text-xs text-slate-400 ml-2">:{scanPort}</span>
                      </div>
                      {ip === host && (
                        <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">current</span>
                      )}
                    </div>
                    <button type="button" onClick={() => useIp(ip)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-green-300 text-xs font-semibold text-green-700 hover:bg-green-100 transition-colors">
                      Use this IP
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* ── 2. Connection ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-800">Connection</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {lastChecked
                ? `Last checked ${lastChecked.toLocaleTimeString()} · auto-refreshes every 10 s`
                : 'Auto-checks when IP is set'}
            </p>
          </div>
          <StatusBadge status={connStatus} error={connError} />
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">IP Address</label>
              <input value={host} onChange={e => { setHost(e.target.value); setConnStatus('idle'); }}
                placeholder="192.168.1.100" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Port</label>
              <input value={port} onChange={e => { setPort(e.target.value); setConnStatus('idle'); }}
                type="number" min="1" max="65535" className={inputCls} />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={handleTest}
              disabled={!host || connStatus === 'checking'}
              className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors">
              Test Connection
            </button>
            <div className="flex items-center gap-2 ml-auto">
              {saved && <span className="text-xs text-green-600 font-semibold">Saved!</span>}
              <button type="button" onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Payload Inspector ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Payload Inspector</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Capture raw bytes from the scale to inspect the data format.
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600 font-medium shrink-0">Capture for</label>
              <select value={duration} onChange={e => setDuration(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500">
                <option value="1000">1 s</option>
                <option value="2000">2 s</option>
                <option value="3000">3 s</option>
                <option value="5000">5 s</option>
                <option value="8000">8 s</option>
              </select>
            </div>
            <button type="button" onClick={handleRead}
              disabled={!host || reading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-50 transition-colors">
              {reading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Reading {duration / 1000}s…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  Read Scale Data
                </>
              )}
            </button>
          </div>

          {readErr && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{readErr}</div>
          )}

          {payload && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 px-3 py-2 bg-slate-50 rounded-xl text-xs">
                <span className={`flex items-center gap-1.5 font-semibold ${payload.connected ? 'text-green-700' : 'text-red-600'}`}>
                  <span className={`w-2 h-2 rounded-full ${payload.connected ? 'bg-green-500' : 'bg-red-500'}`} />
                  {payload.connected ? 'Connected' : 'Failed'}
                </span>
                <span className="text-slate-500">{payload.bytes} bytes</span>
                {payload.lines?.length > 0 && <span className="text-slate-500">{payload.lines.length} lines</span>}
              </div>

              {payload.bytes > 0 ? (
                <>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit text-xs font-medium">
                    {['ascii', 'hex', 'lines'].map(m => (
                      <button key={m} type="button" onClick={() => setViewMode(m)}
                        className={`px-3 py-1.5 capitalize transition-colors ${viewMode === m ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <pre className="bg-slate-900 text-green-400 rounded-xl p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-64">
                    {viewMode === 'ascii' && (payload.ascii || '(empty)')}
                    {viewMode === 'hex'   && (payload.hex   || '(empty)')}
                    {viewMode === 'lines' && (payload.lines?.join('\n') || '(no lines detected)')}
                  </pre>
                </>
              ) : (
                <div className="px-3 py-4 text-center text-sm text-slate-500 bg-slate-50 rounded-xl">
                  {payload.connected ? 'Connected but no data received.' : (payload.error || 'Could not connect.')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
