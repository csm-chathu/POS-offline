import { useState, useEffect } from 'react';
import { getMachineId, activateLicense, daysLeft } from '../services/licenseService';

const PLAN_LABELS = {
  trial:    { label: 'Trial',    color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' },
  monthly:  { label: 'Monthly',  color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  yearly:   { label: 'Yearly',   color: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
  lifetime: { label: 'Lifetime', color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
};

export default function Activate({ reason = 'expired', currentLicense, onActivated }) {
  const [deviceId, setDeviceId]   = useState('');
  const [key, setKey]             = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState(null);
  const [copied, setCopied]       = useState(false);

  useEffect(() => {
    getMachineId().then(setDeviceId);
  }, []);

  async function handleActivate() {
    if (!key.trim()) { setError('Enter your license key'); return; }
    setLoading(true);
    setError('');
    try {
      const result = await activateLicense(key.trim());
      if (result.valid) {
        setSuccess(result);
        setTimeout(() => onActivated(result), 1500);
      } else if (result.revoked) {
        setError('This device has been revoked. Contact support.');
      } else if (result.expired) {
        setError('License key has expired. Contact support for renewal.');
      } else {
        setError(result.error || 'Invalid license key. Please check and try again.');
      }
    } catch {
      setError('Cannot reach license server. Check your internet connection.');
    } finally {
      setLoading(false);
    }
  }

  function copyDeviceId() {
    navigator.clipboard.writeText(deviceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const days = currentLicense ? daysLeft(currentLicense) : null;

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-3xl">🔑</span>
          </div>
          <h1 className="text-2xl font-bold text-white">LMUC POS</h1>
          <p className="text-slate-400 text-sm mt-1">License Activation</p>
        </div>

        {/* Status banner */}
        {reason === 'expired' && (
          <div className="bg-red-900/40 border border-red-700 rounded-2xl px-4 py-3 mb-6 flex items-center gap-3">
            <span className="text-2xl">⏰</span>
            <div>
              <p className="text-red-300 font-semibold text-sm">
                {currentLicense?.plan === 'trial' ? '3-day trial ended' : 'License expired'}
              </p>
              <p className="text-red-400 text-xs mt-0.5">Enter a valid license key to continue using LMUC POS.</p>
            </div>
          </div>
        )}
        {reason === 'revoked' && (
          <div className="bg-red-900/40 border border-red-700 rounded-2xl px-4 py-3 mb-6 flex items-center gap-3">
            <span className="text-2xl">🚫</span>
            <div>
              <p className="text-red-300 font-semibold text-sm">Device revoked</p>
              <p className="text-red-400 text-xs mt-0.5">Contact support to reinstate your license.</p>
            </div>
          </div>
        )}
        {reason === 'no_internet' && (
          <div className="bg-amber-900/40 border border-amber-700 rounded-2xl px-4 py-3 mb-6 flex items-center gap-3">
            <span className="text-2xl">📡</span>
            <div>
              <p className="text-amber-300 font-semibold text-sm">Internet required for first activation</p>
              <p className="text-amber-400 text-xs mt-0.5">Connect to the internet and relaunch the app.</p>
            </div>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* Device ID section */}
          <div className="bg-slate-50 border-b border-slate-100 px-6 py-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Your Device ID</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2 select-all">
                {deviceId || 'Loading…'}
              </code>
              <button onClick={copyDeviceId}
                className="px-3 py-2 text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl transition-colors shrink-0">
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Send this ID to <span className="font-semibold text-slate-600">support@lumac.cc</span> to get your license key.
            </p>
          </div>

          <div className="p-6 space-y-4">
            {success ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                  </svg>
                </div>
                <p className="font-bold text-slate-800 text-lg">Activated!</p>
                <div className={`inline-flex items-center gap-2 mt-2 px-4 py-1.5 rounded-full border text-sm font-semibold ${PLAN_LABELS[success.plan]?.bg} ${PLAN_LABELS[success.plan]?.color}`}>
                  {PLAN_LABELS[success.plan]?.label} Plan
                  {success.days_left !== null && ` · ${success.days_left} days`}
                </div>
                <p className="text-slate-400 text-xs mt-3">Launching app…</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">License Key</label>
                  <input
                    value={key}
                    onChange={e => { setKey(e.target.value); setError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleActivate()}
                    placeholder="LMUC-XXXX-XXXX-XXXX-XXXX"
                    className="w-full font-mono border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition placeholder:font-sans placeholder:text-slate-400"
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                    <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <button onClick={handleActivate} disabled={loading || !key.trim()}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Activating…
                    </>
                  ) : 'Activate License'}
                </button>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          Need a license? Contact <span className="text-slate-300 font-medium">support@lumac.cc</span>
        </p>
      </div>
    </div>
  );
}
