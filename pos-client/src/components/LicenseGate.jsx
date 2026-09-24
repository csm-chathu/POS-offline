import { useState, useEffect } from 'react';
import { startupLicenseCheck } from '../services/licenseService';
import Activate from '../pages/Activate';

export default function LicenseGate({ children }) {
  const [status, setStatus]   = useState('checking');
  const [license, setLicense] = useState(null);

  useEffect(() => {
    startupLicenseCheck().then(({ status: s, data }) => {
      setLicense(data);
      setStatus(s);
    });
    // No .catch() — startupLicenseCheck always resolves, never rejects
  }, []);

  function handleActivated(result) {
    setLicense(result);
    setStatus('valid');
  }

  // ── Checking ───────────────────────────────────────────────────────────────
  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg">
          <span className="text-3xl">🔑</span>
        </div>
        <svg className="w-6 h-6 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        <p className="text-slate-400 text-sm">Checking license…</p>
      </div>
    );
  }

  // ── No internet on first launch — cannot issue trial key ──────────────────
  if (status === 'no_internet') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-700 flex items-center justify-center mx-auto mb-6 shadow-lg">
            <span className="text-3xl">📡</span>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Internet Required</h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            A one-time internet connection is needed to activate your device and receive a trial license from the server.
          </p>
          <button
            onClick={() => { setStatus('checking'); startupLicenseCheck().then(({ status: s, data }) => { setLicense(data); setStatus(s); }); }}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors">
            Try Again
          </button>
          <p className="text-slate-600 text-xs mt-4">Once activated, the app works offline.</p>
        </div>
      </div>
    );
  }

  // ── Expired / revoked — show activation screen ────────────────────────────
  if (status === 'expired' || status === 'revoked') {
    return (
      <Activate
        reason={status}
        currentLicense={license}
        onActivated={handleActivated}
      />
    );
  }

  // ── Valid — render app ─────────────────────────────────────────────────────
  return children;
}
