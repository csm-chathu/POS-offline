import { useState, useEffect } from 'react';

export default function UpdateBanner() {
  const [state, setState] = useState(null); // null | 'available' | 'downloading' | 'downloaded' | 'backing-up'
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (!window.electronAPI?.onUpdateAvailable) return;

    window.electronAPI.onUpdateAvailable((info) => {
      setVersion(info.version);
      setState('available');
    });

    window.electronAPI.onUpdateDownloaded((info) => {
      setVersion(info.version);
      setState('downloaded');
    });

    return () => window.electronAPI.removeUpdateListeners?.();
  }, []);

  function handleDownload() {
    setState('downloading');
    window.electronAPI.downloadUpdate();
  }

  if (!state) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full">
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 flex items-start gap-3">
        <div className="mt-0.5 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          {state === 'available' && (
            <>
              <p className="text-sm font-semibold text-slate-800">Update available — v{version}</p>
              <p className="text-xs text-slate-500 mt-0.5">A new version is ready to download.</p>
              <button
                onClick={handleDownload}
                className="mt-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                Download Now
              </button>
            </>
          )}

          {state === 'downloading' && (
            <>
              <p className="text-sm font-semibold text-slate-800">Downloading v{version}…</p>
              <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full animate-pulse w-3/4" />
              </div>
              <p className="text-xs text-slate-400 mt-1">Please wait, do not close the app.</p>
            </>
          )}

          {state === 'backing-up' && (
            <>
              <p className="text-sm font-semibold text-slate-800">Backing up database…</p>
              <p className="text-xs text-slate-400 mt-0.5">Saving a copy of your data before update.</p>
            </>
          )}

          {state === 'downloaded' && (
            <>
              <p className="text-sm font-semibold text-slate-800">Update ready — v{version}</p>
              <p className="text-xs text-slate-500 mt-0.5">Downloaded and ready to install.</p>
              <button
                onClick={async () => {
                  setState('backing-up');
                  await window.electronAPI.backupDb?.();
                  window.electronAPI.installUpdate();
                }}
                className="mt-2 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors"
              >
                Restart &amp; Install
              </button>
            </>
          )}
        </div>

        {state !== 'downloading' && state !== 'backing-up' && (
          <button
            onClick={() => setState(null)}
            className="text-slate-400 hover:text-slate-600 mt-0.5 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
