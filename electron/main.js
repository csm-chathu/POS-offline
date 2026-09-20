const { app, BrowserWindow, ipcMain, globalShortcut, dialog, nativeImage } = require('electron');
const path = require('path');
const fs   = require('fs');
const net  = require('net');
const { spawn } = require('child_process');

const IS_OFFLINE_BUILD = !!require('./package.json').offline;

let _apiProcess = null;

app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('kiosk-printing');

const DEFAULT_APP_URL = process.env.APP_URL || 'http://localhost:5173';

let mainWindow;
let _configCache    = null;
let _printerCache   = null;
let _printerCacheAt = 0;
const PRINTER_CACHE_TTL = 30_000;

function getConfigPath() {
  return path.join(app.getPath('userData'), 'printer-config.json');
}

const DEFAULT_CONFIG = {
  app:     { url: DEFAULT_APP_URL, name: 'LMUC POS', icon: '' },
  default: { name: '' },
  barcode: { name: '', width: 30000, height: 20000 },
  pos:     { name: '', width: 72000, height: 1200000 },
  a5:      { name: '', width: 148000, height: 210000 },
};

function readPrinterConfig() {
  if (_configCache) return _configCache;
  const configPath = getConfigPath();
  let config;
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } else {
    const bundled = path.join(__dirname, 'printer-config.json');
    config = fs.existsSync(bundled) ? JSON.parse(fs.readFileSync(bundled, 'utf8')) : DEFAULT_CONFIG;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }
  if (!config.app) config.app = { ...DEFAULT_CONFIG.app };
  _configCache = config;
  return config;
}

function applyAppConfig(config) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { url, name, icon } = config.app || {};
  if (name) mainWindow.setTitle(name);
  if (icon && fs.existsSync(icon)) {
    try { mainWindow.setIcon(nativeImage.createFromPath(icon)); } catch (_) {}
  }
  const target = url || DEFAULT_APP_URL;
  if (mainWindow.webContents.getURL() !== target) mainWindow.loadURL(target);
}

let splashOpen = false;

function createSplashWindow() {
  const html = encodeURIComponent(`<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#1a1a2e;width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Segoe UI',Arial,sans-serif}
    .brand{font-size:52px;font-weight:800;letter-spacing:2px;line-height:1}
    .lu{color:#ffffff}.mac{color:#2563eb}
    .sub{margin-top:14px;font-size:15px;color:#94a3b8;letter-spacing:4px;text-transform:uppercase}
    .info{margin-top:28px;font-size:13px;color:#64748b;text-align:center;line-height:1.8;letter-spacing:1px}
  </style></head><body>
    <div class="brand"><span class="lu">LU</span><span class="mac">MAC</span></div>
    <div class="sub">Solutions</div>
    <div class="info">lumac.lk<br>076 464 3050</div>
  </body></html>`);

  const splash = new BrowserWindow({
    width: 420, height: 260,
    frame: false, resizable: false, center: true,
    show: false, skipTaskbar: true, alwaysOnTop: true,
    webPreferences: { contextIsolation: true },
  });
  splash.loadURL(`data:text/html;charset=utf-8,${html}`);
  splash.webContents.once('did-finish-load', () => splash.show());
  return splash;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    minWidth: 1024, minHeight: 720,
    show: false, autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (!splashOpen) mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('Failed to load:', code, desc);
  });

  const cfg     = readPrinterConfig();
  const appUrl  = (cfg.app && cfg.app.url)  || DEFAULT_APP_URL;
  const appName = (cfg.app && cfg.app.name) || 'LMUC POS';
  const appIcon = (cfg.app && cfg.app.icon) || '';

  mainWindow.setTitle(appName);
  if (appIcon && fs.existsSync(appIcon)) {
    try { mainWindow.setIcon(nativeImage.createFromPath(appIcon)); } catch (_) {}
  }
  mainWindow.loadURL(appUrl);
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function resolvePrinterName(wc, configuredName) {
  if (!configuredName) return '';
  if (!_printerCache || Date.now() - _printerCacheAt > PRINTER_CACHE_TTL) {
    _printerCache   = await wc.getPrintersAsync();
    _printerCacheAt = Date.now();
  }
  const names = _printerCache.map((p) => p.name);
  const lower = configuredName.toLowerCase();
  return (
    names.find((n) => n === configuredName) ||
    names.find((n) => n.toLowerCase() === lower) ||
    names.find((n) => n.toLowerCase().includes(lower)) ||
    names.find((n) => lower.includes(n.toLowerCase())) ||
    ''
  );
}

function buildOverlayScript(printers, config) {
  const appCfg      = config.app || {};
  const defaultName = (config.default && config.default.name) || '';
  const barcodeName = (config.barcode && config.barcode.name) || '';

  const printerOptions = printers.map((p) => {
    const sel = p.name === defaultName ? ' selected' : '';
    return `<option value="${p.name}"${sel}>${p.name}</option>`;
  }).join('');

  const barcodeOptions = printers.map((p) => {
    const sel = p.name === barcodeName ? ' selected' : '';
    return `<option value="${p.name}"${sel}>${p.name}</option>`;
  }).join('');

  const c = JSON.stringify(config);

  return `
(function() {
  if (document.getElementById('__ps-overlay')) return;
  const backdrop = document.createElement('div');
  backdrop.id = '__ps-overlay';
  backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
  backdrop.innerHTML = \`
    <div style="background:#fff;border-radius:12px;width:440px;max-width:94vw;max-height:90vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,.3)">
      <div style="padding:20px 24px 16px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;z-index:1">
        <span style="font-size:16px;font-weight:600;color:#111">Printer Settings</span>
        <button id="__ps-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#888">&#x2715;</button>
      </div>
      <div style="padding:20px 24px">
        <div style="font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">Application</div>
        <label style="display:block;margin-bottom:12px">
          <span style="display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:4px">App URL</span>
          <input id="ps-app-url" type="text" value="${appCfg.url || ''}" placeholder="http://localhost:5173"
            style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box">
        </label>
        <label style="display:block;margin-bottom:20px">
          <span style="display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:4px">App Name</span>
          <input id="ps-app-name" type="text" value="${appCfg.name || ''}" placeholder="LMUC POS"
            style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box">
        </label>
        <div style="font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px">Printer</div>
        <label style="display:block;margin-bottom:12px">
          <span style="display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:4px">Receipt Printer (80mm thermal)</span>
          <select id="ps-default-printer" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:13px;background:#fff">
            <option value="">— system default —</option>
            ${printerOptions}
          </select>
        </label>
        <label style="display:block;margin-bottom:24px">
          <span style="display:block;font-size:12px;font-weight:500;color:#555;margin-bottom:4px">Barcode Printer (label)</span>
          <select id="ps-barcode-printer" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:13px;background:#fff">
            <option value="">— same as receipt —</option>
            ${barcodeOptions}
          </select>
        </label>
        <div id="__ps-msg" style="font-size:13px;min-height:18px;margin-bottom:12px;color:green;text-align:center"></div>
        <div style="display:flex;gap:10px;align-items:center">
          <button id="__ps-clear" style="padding:8px 14px;border:1px solid #fca5a5;border-radius:7px;background:#fff;color:#dc2626;cursor:pointer;font-size:13px;margin-right:auto">Reset</button>
          <button id="__ps-cancel" style="padding:8px 18px;border:1px solid #ddd;border-radius:7px;background:#f5f5f5;cursor:pointer;font-size:14px">Cancel</button>
          <button id="__ps-save" style="padding:8px 22px;border:none;border-radius:7px;background:#2563eb;color:#fff;cursor:pointer;font-size:14px;font-weight:500">Save</button>
        </div>
      </div>
    </div>
  \`;

  function close() { backdrop.remove(); }
  backdrop.querySelector('#__ps-close').onclick = close;
  backdrop.querySelector('#__ps-cancel').onclick = close;
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector('#__ps-clear').onclick = async function() {
    if (!confirm('Reset all settings?')) return;
    await window.electronAPI.clearData();
  };

  backdrop.querySelector('#__ps-save').onclick = async function() {
    const config = ${c};
    if (!config.app)     config.app     = {};
    if (!config.default) config.default = {};
    config.app.url      = document.getElementById('ps-app-url').value.trim();
    config.app.name     = document.getElementById('ps-app-name').value.trim();
    const printer         = document.getElementById('ps-default-printer').value;
    const barcodePrinter  = document.getElementById('ps-barcode-printer').value;
    config.default.name   = printer;
    config.pos.name       = printer;
    config.a5.name        = printer;
    config.barcode.name   = barcodePrinter || printer;
    const btn = backdrop.querySelector('#__ps-save');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await window.electronAPI.savePrinterConfig(config);
      document.getElementById('__ps-msg').textContent = 'Saved!';
      setTimeout(close, 800);
    } catch(err) {
      document.getElementById('__ps-msg').style.color = 'red';
      document.getElementById('__ps-msg').textContent = 'Error: ' + err.message;
      btn.disabled = false; btn.textContent = 'Save';
    }
  };
  document.body.appendChild(backdrop);
})();
`;
}

function devLog(level, ...args) {
  const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.executeJavaScript(`console.${level}(${JSON.stringify(msg)})`).catch(() => {});
  }
}

function getActiveWebContents(sender) {
  const win = BrowserWindow.fromWebContents(sender);
  if (win && !win.isDestroyed()) return win.webContents;
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow.webContents;
  return sender;
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('app:is-electron', () => true);

ipcMain.handle('app:get-info', () => ({
  appName: app.getName(),
  appVersion: app.getVersion(),
  appUrl: (readPrinterConfig().app || {}).url || DEFAULT_APP_URL,
}));

ipcMain.handle('printers:get', async (event) => {
  const wc = getActiveWebContents(event.sender);
  const list = await wc.getPrintersAsync();
  return list.map((p) => ({
    name: p.name,
    displayName: p.displayName || p.name,
    description: p.description || '',
    status: p.status,
    isDefault: p.isDefault,
  }));
});

ipcMain.handle('printers:get-config', () => readPrinterConfig());

ipcMain.handle('printers:save-config', (event, config) => {
  _configCache = config;
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
  applyAppConfig(config);
  return { success: true };
});

ipcMain.handle('app:clear-data', () => {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  _configCache  = null;
  _printerCache = null;
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('app:select-icon', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select App Icon',
    filters: [{ name: 'Images', extensions: ['ico', 'png', 'jpg', 'jpeg'] }],
    properties: ['openFile'],
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('printers:print-receipt', async (event, printerTypeOrName, options = {}) => {
  const wc     = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : event.sender;
  const config = readPrinterConfig();
  const entry  = config[printerTypeOrName] ||
    Object.values(config).find((e) => e && typeof e === 'object' && e.name === printerTypeOrName) ||
    {};
  const defaultName    = (config.default && config.default.name) || '';
  const configuredName = entry.name || defaultName || (typeof printerTypeOrName === 'string' ? printerTypeOrName : '');
  const deviceName     = await resolvePrinterName(wc, configuredName);

  devLog('log', `[print-receipt] mode=${printerTypeOrName} configured="${configuredName}" resolved="${deviceName || '(default)'}"`);
  if (configuredName && !deviceName) {
    devLog('error', `[print-receipt] Printer not found: ${configuredName}`);
    return { success: false, error: `Printer not found: ${configuredName}` };
  }

  const printOptions = {
    silent: options.silent !== false,
    printBackground: options.printBackground !== false,
    deviceName: deviceName || undefined,
    margins: { marginType: 'none' },
    pageSize: { width: 80000, height: 297000 },
    scaleFactor: 105,
  };

  await wc.executeJavaScript(`
    (function() {
      if (!document.getElementById('__thermal-page')) {
        const s = document.createElement('style');
        s.id = '__thermal-page';
        s.textContent = '@page{size:80mm 297mm;margin:0 8mm 0 0}';
        document.head.appendChild(s);
      }
      const breaks = ['page-break-before','page-break-after','page-break-inside','break-before','break-after','break-inside'];
      document.querySelectorAll('*').forEach(function(el) {
        breaks.forEach(function(p) { el.style.setProperty(p, 'avoid', 'important'); });
        el.setAttribute('data-pbx', '1');
      });
    })()
  `).catch(() => {});

  return new Promise((resolve) => {
    wc.print(printOptions, (success, failureReason) => {
      wc.executeJavaScript(`
        (function() {
          const breaks = ['page-break-before','page-break-after','page-break-inside','break-before','break-after','break-inside'];
          document.querySelectorAll('[data-pbx]').forEach(function(el) {
            breaks.forEach(function(p) { el.style.removeProperty(p); });
            el.removeAttribute('data-pbx');
          });
          document.getElementById('__thermal-page')?.remove();
        })()
      `).catch(() => {});

      if (success) {
        devLog('log', `[print-receipt] sent to "${deviceName || '(default)'}"`);
        resolve({ success: true });
      } else {
        _printerCache = null;
        devLog('error', `[print-receipt] failed: ${failureReason}`);
        resolve({ success: false, error: failureReason || 'Unknown print failure' });
      }
    });
  });
});

ipcMain.handle('printers:print-barcode', async (event, html, options = {}) => {
  const wc      = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : event.sender;
  const config  = readPrinterConfig();
  const entry   = config.barcode || {};
  const copies  = Math.max(1, parseInt(options.copies) || 1);
  const pageSize = entry.width ? { width: entry.width, height: entry.height } : { width: 30000, height: 20000 };
  const configuredName = entry.name || '';
  const deviceName     = await resolvePrinterName(wc, configuredName);

  devLog('log', `[print-barcode] configured="${configuredName}" resolved="${deviceName || '(default)'}"`);
  if (configuredName && !deviceName) {
    return { success: false, error: `Barcode printer not found: ${configuredName}` };
  }

  const win = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { javascript: true, sandbox: false } });
  await win.loadURL('about:blank');
  await win.webContents.executeJavaScript(
    `document.open('text/html');document.write(${JSON.stringify(html)});document.close();`
  );
  // Wait for CDN script (JsBarcode) to load and render
  await new Promise(r => setTimeout(r, 1200));

  return new Promise((resolve) => {
    let settled = false;
    function finish(success, reason) {
      if (settled) return;
      settled = true;
      if (!win.isDestroyed()) win.destroy();
      devLog(success ? 'log' : 'error', `[print-barcode] ${success ? 'sent' : 'failed: ' + reason}`);
      resolve({ success, error: success ? null : reason });
    }
    const timeout = setTimeout(() => finish(false, 'timeout'), 20_000);
    win.webContents.print(
      { silent: true, printBackground: true, deviceName: deviceName || undefined, margins: { marginType: 'none' }, pageSize, landscape: false, copies },
      (success, reason) => { clearTimeout(timeout); finish(success, reason); }
    );
  });
});

ipcMain.handle('printers:print-receipt-html', async (event, html, options = {}) => {
  const config  = readPrinterConfig();
  const entry   = config.pos || {};
  const is80    = options.paperSize !== 'A4';
  const pageSize = is80
    ? 'A4'
    : 'A4';
  const configuredName = entry.name || '';
  const wc = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : event.sender;
  const deviceName = await resolvePrinterName(wc, configuredName);

  devLog('log', `[print-receipt-html] paper=${options.paperSize || '80mm'} configured="${configuredName}" resolved="${deviceName || '(default)'}"`);
  if (configuredName && !deviceName) {
    return { success: false, error: `Printer not found: ${configuredName}` };
  }

  const win = new BrowserWindow({
    show: false,
    width: is80 ? 340 : 820,
    height: 700,
    webPreferences: { javascript: true, sandbox: false },
  });

  await win.loadURL('about:blank');
  await win.webContents.executeJavaScript(
    `document.open('text/html');document.write(${JSON.stringify(html)});document.close();`
  );
  // Give Chromium time to parse, layout, and apply inline CSS before printing
  await new Promise(r => setTimeout(r, 800));

  return new Promise((resolve) => {
    let settled = false;
    function finish(success, reason) {
      if (settled) return;
      settled = true;
      if (!win.isDestroyed()) win.destroy();
      devLog(success ? 'log' : 'error',
        `[print-receipt-html] ${success ? 'sent to "' + (deviceName || 'default') + '"' : 'failed: ' + reason}`);
      resolve({ success, error: success ? null : reason });
    }
    const timeout = setTimeout(() => finish(false, 'timeout'), 20_000);
    win.webContents.print(
      { silent: true, printBackground: true, deviceName: deviceName || undefined, margins: { marginType: 'none' }, pageSize },
      (success, reason) => { clearTimeout(timeout); finish(success, reason); }
    );
  });
});

ipcMain.handle('printers:open-drawer', async (event, printerTypeOrName = 'pos') => {
  const { execFile } = require('child_process');
  const os   = require('os');
  const wc     = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : event.sender;
  const config = readPrinterConfig();
  const entry  = config[printerTypeOrName] ||
    Object.values(config).find((e) => e && typeof e === 'object' && e.name === printerTypeOrName) || {};
  const defaultName    = (config.default && config.default.name) || '';
  const configuredName = entry.name || defaultName || (typeof printerTypeOrName === 'string' ? printerTypeOrName : '');
  const deviceName     = await resolvePrinterName(wc, configuredName);

  if (!deviceName) {
    const msg = configuredName ? `Printer not found: ${configuredName}` : 'No printer configured';
    return { success: false, error: msg };
  }

  const scriptPath = path.join(os.tmpdir(), 'lumac_drawer.ps1');
  const psScript = String.raw`
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct DOC_INFO_1 { public string pDocName; public string pOutputFile; public string pDatatype; }
public class WS {
  [DllImport("winspool.Drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern int StartDocPrinter(IntPtr h, int l, ref DOC_INFO_1 d);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
}
'@
$printer = $args[0]
$h = [IntPtr]::Zero
if (-not [WS]::OpenPrinter($printer, [ref]$h, [IntPtr]::Zero)) { exit 1 }
$di = New-Object DOC_INFO_1; $di.pDocName = 'Drawer'; $di.pDatatype = 'RAW'
if ([WS]::StartDocPrinter($h, 1, [ref]$di) -eq 0) { [WS]::ClosePrinter($h); exit 2 }
[WS]::StartPagePrinter($h) | Out-Null
$bytes = [byte[]](0x1B, 0x40, 0x1B, 0x70, 0x00, 0x40, 0x50, 0x1B, 0x70, 0x01, 0x40, 0x50)
$w = 0
[WS]::WritePrinter($h, $bytes, $bytes.Length, [ref]$w) | Out-Null
[WS]::EndPagePrinter($h) | Out-Null; [WS]::EndDocPrinter($h) | Out-Null; [WS]::ClosePrinter($h) | Out-Null
if ($w -eq 0) { exit 3 }
`;
  fs.writeFileSync(scriptPath, psScript, 'utf8');

  return new Promise((resolve) => {
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, deviceName],
      { timeout: 15000 },
      (err, stdout, stderr) => {
        try { fs.unlinkSync(scriptPath); } catch (_) {}
        if (err) resolve({ success: false, error: stderr?.trim() || err.message });
        else resolve({ success: true });
      }
    );
  });
});

ipcMain.handle('printers:open-drawer-com', async (event, port) => {
  const config  = readPrinterConfig();
  const comPort = port || (config.drawer && config.drawer.port) || '';
  if (!comPort) return { success: false, error: 'No COM port configured' };

  const bytes = Buffer.from([0x1B, 0x70, 0x00, 0x40, 0xFF, 0x1B, 0x70, 0x01, 0x40, 0xFF]);
  const fss = require('fs');
  const portPath = `\\\\.\\${comPort}`;

  return new Promise((resolve) => {
    fss.open(portPath, 'w', (openErr, fd) => {
      if (openErr) return resolve({ success: false, error: openErr.message });
      fss.write(fd, bytes, 0, bytes.length, null, (writeErr) => {
        fss.close(fd, () => {});
        resolve(writeErr ? { success: false, error: writeErr.message } : { success: true });
      });
    });
  });
});

ipcMain.handle('printers:open-dialog', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false };
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    const config   = readPrinterConfig();
    const script   = buildOverlayScript(printers, config);
    await mainWindow.webContents.executeJavaScript(script);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Offline API process ───────────────────────────────────────────────────────

function waitForPort(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function attempt() {
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock.on('connect', () => { sock.destroy(); resolve(); });
      sock.on('error',   () => { sock.destroy(); retry(); });
      sock.on('timeout', () => { sock.destroy(); retry(); });
      sock.connect(port, '127.0.0.1');
    }
    function retry() {
      if (Date.now() - start > timeoutMs) return reject(new Error('API did not start in time'));
      setTimeout(attempt, 400);
    }
    attempt();
  });
}

function spawnOfflineApi() {
  const apiEntry = app.isPackaged
    ? path.join(process.resourcesPath, 'pos-api', 'src', 'app.js')
    : path.join(__dirname, '..', 'pos-api', 'src', 'app.js');

  const dbPath = path.join(app.getPath('userData'), 'pos.db');

  _apiProcess = spawn(process.execPath, [apiEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DIALECT: 'sqlite',
      PORT: '8000',
      DB_PATH: dbPath,
      JWT_SECRET: 'lumac_pos_offline_jwt_secret',
      NODE_ENV: 'production',
    },
    stdio: 'pipe',
  });

  _apiProcess.stdout.on('data', d => console.log('[api]', d.toString().trim()));
  _apiProcess.stderr.on('data', d => console.error('[api]', d.toString().trim()));
  _apiProcess.on('exit', code => console.log('[api] exited with code', code));
}

// ── Auto-updater ──────────────────────────────────────────────────────────────

const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = {
  info:  (...a) => { console.log('[updater]',  ...a); devLog('log',   '[updater] ' + a.join(' ')); },
  warn:  (...a) => { console.warn('[updater]', ...a); devLog('warn',  '[updater] ' + a.join(' ')); },
  error: (...a) => { console.error('[updater]',...a); devLog('error', '[updater] ' + a.join(' ')); },
  debug: () => {},
};

autoUpdater.on('checking-for-update', () => {
  devLog('log', `[updater] checking… current version: ${app.getVersion()}`);
});

autoUpdater.on('update-not-available', (info) => {
  devLog('log', `[updater] up to date (latest: ${info.version})`);
});

autoUpdater.on('update-available', (info) => {
  devLog('log', `[updater] update available: ${info.version}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:available', { version: info.version });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  devLog('log', `[updater] update downloaded: ${info.version}`);
  // Auto-backup DB before notifying renderer
  const dbPath = path.join(app.getPath('userData'), 'pos.db');
  if (fs.existsSync(dbPath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(app.getPath('userData'), `pos-backup-${ts}.db`);
    try { fs.copyFileSync(dbPath, backupPath); devLog('log', `[updater] DB backed up to ${backupPath}`); } catch (_) {}
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:downloaded', { version: info.version });
  }
});

autoUpdater.on('error', (err) => {
  devLog('error', `[updater] error: ${err.message}`);
});

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('update:check', () => {
  autoUpdater.checkForUpdates().catch(err => devLog('error', '[updater] manual check failed: ' + err.message));
});

ipcMain.handle('update:download', () => {
  autoUpdater.downloadUpdate().catch(err => devLog('error', '[updater] download failed: ' + err.message));
});

ipcMain.handle('db:backup', () => {
  const dbPath = path.join(app.getPath('userData'), 'pos.db');
  if (!fs.existsSync(dbPath)) return { success: false, error: 'No database found' };
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = path.join(app.getPath('userData'), `pos-backup-${ts}.db`);
  try {
    fs.copyFileSync(dbPath, backupPath);
    console.log('[db:backup] saved to', backupPath);
    return { success: true, path: backupPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ── Scale (network TCP) ───────────────────────────────────────────────────────

ipcMain.handle('scale:get-config', () => {
  const config = readPrinterConfig();
  return config.scale || { host: '', port: 8000 };
});

ipcMain.handle('scale:save-config', (event, scaleConfig) => {
  const config  = readPrinterConfig();
  config.scale  = scaleConfig;
  _configCache  = config;
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
  return { success: true };
});

ipcMain.handle('scale:check-connection', (event, host, port) => {
  return new Promise((resolve) => {
    if (!host || !port) return resolve({ connected: false, error: 'No host or port configured' });
    const socket  = new net.Socket();
    const timer   = setTimeout(() => {
      socket.destroy();
      resolve({ connected: false, error: 'Connection timed out' });
    }, 3000);
    socket.connect(parseInt(port, 10), host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ connected: true });
    });
    socket.on('error', (err) => {
      clearTimeout(timer);
      resolve({ connected: false, error: err.message });
    });
  });
});

ipcMain.handle('scale:read-weight', (event, host, port) => {
  return new Promise((resolve) => {
    if (!host || !port) return resolve({ success: false, error: 'No host or port configured' });
    const socket = new net.Socket();
    let   buf    = '';
    let   done   = false;

    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    }

    const timer = setTimeout(() => {
      finish({ success: false, error: 'Read timed out' });
    }, 5000);

    socket.connect(parseInt(port, 10), host, () => {
      socket.write(Buffer.from([0x05])); // ENQ — common weight-request command
    });

    socket.on('data', (data) => {
      buf += data.toString('ascii');
      const m = buf.match(/[+\-]?\s*(\d+\.?\d*)\s*(kg|g|lb)/i);
      if (m) finish({ success: true, weight: parseFloat(m[1]), unit: m[2].toLowerCase(), raw: buf.trim() });
    });

    socket.on('close', () => {
      if (!done) finish(buf ? { success: true, raw: buf.trim() } : { success: false, error: 'No data received' });
    });

    socket.on('error', (err) => finish({ success: false, error: err.message }));
  });
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  splashOpen = true;
  const splash = createSplashWindow();

  if (IS_OFFLINE_BUILD) {
    // Start the bundled API, then wait for it to be ready before showing window
    spawnOfflineApi();
    try {
      await waitForPort(8000);
    } catch (e) {
      console.error('[offline] API failed to start:', e.message);
    }
    // Override the URL to point at the local API
    if (!_configCache) readPrinterConfig();
    _configCache.app = { ...(_configCache.app || {}), url: 'http://localhost:8000' };
  }

  createMainWindow();

  setTimeout(() => {
    splashOpen = false;
    splash.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();

    // Check for updates 10 s after launch (packaged builds only)
    // Offline builds use channel "offline" so they only update to other offline builds
    if (app.isPackaged) {
      setTimeout(() => {
        devLog('log', `[updater] starting check, app version: ${app.getVersion()}`);
        autoUpdater.checkForUpdates().catch(err => devLog('log', '[updater] no update check (offline or no internet): ' + err.message));
      }, 10_000);
    }
  }, 3000);

  // Ctrl+Shift+P → printer settings overlay
  globalShortcut.register('CommandOrControl+Shift+P', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const printers = await mainWindow.webContents.getPrintersAsync();
    const config   = readPrinterConfig();
    const script   = buildOverlayScript(printers, config);
    mainWindow.webContents.executeJavaScript(script).catch(() => {});
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (_apiProcess && !_apiProcess.killed) _apiProcess.kill();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
