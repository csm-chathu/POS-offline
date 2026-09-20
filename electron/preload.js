const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron:        true,
  getAppInfo:        () => ipcRenderer.invoke('app:get-info'),
  getPrinters:       () => ipcRenderer.invoke('printers:get'),
  getPrinterConfig:  () => ipcRenderer.invoke('printers:get-config'),
  savePrinterConfig: (config) => ipcRenderer.invoke('printers:save-config', config),
  printReceipt:      (printerName, options = {}) => ipcRenderer.invoke('printers:print-receipt', printerName, options),
  printBarcode:      (html, options = {}) => ipcRenderer.invoke('printers:print-barcode', html, options),
  printReceiptHtml:  (html, options) => ipcRenderer.invoke('printers:print-receipt-html', html, options),
  selectIcon:        () => ipcRenderer.invoke('app:select-icon'),
  clearData:         () => ipcRenderer.invoke('app:clear-data'),
  openPrinterDialog: () => ipcRenderer.invoke('printers:open-dialog'),
  openCashDrawer:    (printerTypeOrName) => ipcRenderer.invoke('printers:open-drawer', printerTypeOrName),
  openCashDrawerCom: (port) => ipcRenderer.invoke('printers:open-drawer-com', port),
  // Auto-update
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_e, info) => cb(info)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_e, info) => cb(info)),
  installUpdate:     () => ipcRenderer.invoke('update:install'),
  checkForUpdates:   () => ipcRenderer.invoke('update:check'),
  downloadUpdate:    () => ipcRenderer.invoke('update:download'),
  backupDb:          () => ipcRenderer.invoke('db:backup'),
  reportSyncStatus:  () => {}, // no-op in offline mode
  readApiLog:        () => ipcRenderer.invoke('api:read-log'),
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update:available');
    ipcRenderer.removeAllListeners('update:downloaded');
  },
});

// Intercept window.print() → silent Electron print (no dialog)
window.addEventListener('DOMContentLoaded', () => {
  const script = document.createElement('script');
  script.textContent = `
    (() => {
      const originalPrint = window.print.bind(window);
      window.print = function silentPrint() {
        if (!window.electronAPI || typeof window.electronAPI.printReceipt !== 'function') {
          return originalPrint();
        }
        window.electronAPI.printReceipt('pos', { silent: true }).catch(() => originalPrint());
      };
    })();
  `;
  document.documentElement.appendChild(script);
  script.remove();
});
