const LICENSE_SERVER = 'https://license.lumac.cc';
const STORE_KEY      = 'lmuc_license';
const DEVICE_ID_KEY  = 'lmuc_device_id';
const CHECK_KEY      = 'lmuc_last_check';
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

// ─── Machine ID ───────────────────────────────────────────────────────────────
export async function getMachineId() {
  if (window.electronAPI?.getMachineId) {
    try {
      const id = await window.electronAPI.getMachineId();
      if (id) return id;
    } catch {}
  }
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    id = 'WEB-' + rand;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function getDeviceName() {
  return navigator.userAgent.includes('Electron')
    ? `Electron — ${window.location.hostname}`
    : `Web — ${window.location.hostname}`;
}

// ─── Local storage ────────────────────────────────────────────────────────────
export function getStoredLicense() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
}

function storeLicense(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify({ ...data, storedAt: Date.now() }));
}

export function clearLicense() {
  localStorage.removeItem(STORE_KEY);
}

// ─── Validity ─────────────────────────────────────────────────────────────────
export function isLicenseValid(license) {
  if (!license)                   return false;
  if (license.status === 'revoked') return false;
  if (!license.expires_at)        return true; // lifetime
  return new Date(license.expires_at) > new Date();
}

export function daysLeft(license) {
  if (!license?.expires_at) return null;
  return Math.max(0, Math.ceil((new Date(license.expires_at) - Date.now()) / 86400000));
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function post(path, body) {
  const res = await fetch(`${LICENSE_SERVER}/api/license${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 401 && res.status !== 402 && res.status !== 403) {
    throw new Error(`Server error: ${res.status}`);
  }
  return res.json();
}

// Register device + get trial key — REQUIRES internet, throws if unreachable
export async function initLicense() {
  const deviceId   = await getMachineId();
  const deviceName = getDeviceName();
  const data = await post('/init', { deviceId, deviceName }); // throws on network error
  storeLicense({ ...data, deviceId });
  localStorage.setItem(CHECK_KEY, String(Date.now()));
  return data;
}

// Validate a key the user typed — REQUIRES internet
export async function activateLicense(key) {
  const deviceId = await getMachineId();
  const data     = await post('/activate', { deviceId, key: key.trim() }); // throws on network error
  if (data.valid) {
    storeLicense({ ...data, deviceId });
    localStorage.setItem(CHECK_KEY, String(Date.now()));
  }
  return data;
}

// Silent daily check — failure is ignored (doesn't block app)
async function silentCheck() {
  const lastCheck = parseInt(localStorage.getItem(CHECK_KEY) || '0');
  if (Date.now() - lastCheck < CHECK_INTERVAL) return;

  const stored = getStoredLicense();
  if (!stored?.deviceId) return;

  try {
    const data = await post('/check', { deviceId: stored.deviceId, key: stored.key });
    storeLicense({ ...stored, ...data });
    localStorage.setItem(CHECK_KEY, String(Date.now()));
    // If revoked, updated status is stored — next launch will block
  } catch {
    // Server unreachable — don't block, just skip
  }
}

// ─── Startup check ────────────────────────────────────────────────────────────
// Returns { status: 'valid'|'expired'|'revoked'|'no_license'|'no_internet', data }
export async function startupLicenseCheck() {
  const license = getStoredLicense();

  // ── No stored license: must reach server to get trial ─────────────────────
  if (!license) {
    try {
      const data = await initLicense(); // throws if no internet
      if (data.valid) return { status: 'valid', data };
      return { status: 'expired', data }; // shouldn't happen on init, but guard
    } catch (err) {
      // Network failed — no key issued yet — app cannot run
      return { status: 'no_internet', data: null };
    }
  }

  // ── Has stored license: validate locally, no server needed ────────────────
  if (license.status === 'revoked') return { status: 'revoked', data: license };
  if (!isLicenseValid(license))     return { status: 'expired',  data: license };

  // Valid — trigger silent background check (non-blocking, won't stop app)
  silentCheck().catch(() => {});

  return { status: 'valid', data: license };
}
