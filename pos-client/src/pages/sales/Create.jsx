import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout, selectCurrentUser, selectRole, selectToken } from '../../features/auth/authSlice';
import { useCreateSaleMutation, useReturnSaleMutation } from '../../features/sales/salesApi';
import useProductCache from '../../hooks/useProductCache';
import { useConnectivity } from '../../contexts/ConnectivityContext';
import { enqueueOfflineSale, getPendingCount, OFFLINE_LIMIT } from '../../services/offlineQueue';
import { getLocalCustomers } from '../../services/cacheSync';
import { useLocale } from '../../contexts/LocaleContext';
import { translations } from '../../i18n/translations';
import { api } from '../../app/baseApi';

const posApi = api.injectEndpoints({
  endpoints: b => ({
    quickAddCustomer: b.mutation({ query: body => ({ url: '/customers/quick-add', method: 'POST', body }) }),
    getPOSCustomers:  b.query({ query: () => ({ url: '/customers', params: { page: 1, limit: 500 } }) }),
    getPOSSettings:   b.query({ query: () => '/settings' }),
    searchSaleByInvoice: b.query({ query: no => `/sales?search=${encodeURIComponent(no)}&limit=1` }),
    getSaleForReturn:    b.query({ query: id => `/sales/${id}/return` }),
  }),
  overrideExisting: false,
});

const fmt    = n => Number(n || 0).toFixed(2);
const fmtAmt = n => 'Rs. ' + Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });

function itemKey(i) { return `${i.product_id ?? 'c'}-${i.variant_id ?? 'none'}-${i._custom_id ?? ''}`; }
function recalc(item) {
  return { ...item, total: Math.max(0, item.qty * item.unit_price - (item.discount || 0)) };
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  search: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>,
  barcode: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7V5a1 1 0 0 1 1-1h2M4 17v2a1 1 0 0 0 1 1h2M20 7V5a1 1 0 0 0-1-1h-2M20 17v2a1 1 0 0 1-1 1h-2M8 7h8M8 17h8M8 12h8"/></svg>,
  bag: <svg className="w-16 h-16" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0"/></svg>,
  cash: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2" strokeWidth={2}/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 12h.01M18 12h.01"/></svg>,
  card: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" strokeWidth={2}/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M1 10h22"/></svg>,
  credit: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/></svg>,
  split: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4M4 17h12m0 0l-4-4m4 4l-4 4"/></svg>,
  print: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6v-8z"/></svg>,
  pause: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6"/></svg>,
  save: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>,
  user: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z"/></svg>,
  lightning: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  retail: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 0 0-8 0v4M5 9h14l1 12H4L5 9z"/></svg>,
  tag: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 0 1 0 2.828l-7 7a2 2 0 0 1-2.828 0l-7-7A2 2 0 0 1 3 12V7a4 4 0 0 1 4-4z"/></svg>,
  sun: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" strokeWidth={2}/><path strokeLinecap="round" strokeWidth={2} d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  fullscreen: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5M20 8V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5M20 16v4m0 0h-4m4 0l-5-5"/></svg>,
  refresh: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15"/></svg>,
  logout: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1"/></svg>,
  back: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>,
  home: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7m-9-9v9m0 0h9M5 10v9a1 1 0 0 0 1 1h3m5-10v9a1 1 0 0 0-1 1h-3m0-4h4"/></svg>,
};

// ─── Product Dropdown ─────────────────────────────────────────────────────────
function ProductDropdown({ items, activeIdx, onSelect }) {
  const listRef = useRef(null);
  useEffect(() => { listRef.current?.children[activeIdx]?.scrollIntoView({ block: 'nearest' }); }, [activeIdx]);
  if (!items.length) return null;
  return (
    <div ref={listRef} className="absolute top-full left-0 right-0 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 max-h-72 overflow-y-auto mt-1">
      {items.map((p, i) => (
        <button key={p.id} onMouseDown={() => onSelect(p)}
          className={`w-full text-left px-4 py-2.5 border-b border-slate-50 last:border-0 transition-colors ${i === activeIdx ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800 text-sm">{p.name}</p>
              {p.name_si && <p className="text-xs text-slate-400">{p.name_si}</p>}
              {p.barcode && <p className="text-xs text-slate-300 font-mono">{p.barcode}</p>}
            </div>
            <div className="text-right ml-4 shrink-0">
              <p className="text-sm font-bold text-blue-700">Rs.{fmt(p.our_price ?? p.promo_price ?? p.selling_price)}</p>
              <p className={`text-xs ${p.stock_qty <= 0 ? 'text-red-500' : 'text-slate-400'}`}>Stock: {fmt(p.stock_qty)}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Size Picker Modal ────────────────────────────────────────────────────────
function SizePickerModal({ product, onSelect, onClose }) {
  const { t } = useLocale();
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0);
  const qtyRef = useRef(null);
  useEffect(() => { qtyRef.current?.focus(); qtyRef.current?.select(); }, []);
  function handleKey(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(product.sizes.length - 1, a + 1)); }
    if (e.key === 'Enter') { e.preventDefault(); onSelect(product.sizes[active], parseFloat(qty) || 1); }
    if (e.key === 'Escape') onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onKeyDown={handleKey}>
      <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-md">
        <h3 className="text-base font-bold text-slate-800 mb-3">{product.name} — {t('pos.select_size')}</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {product.sizes.map((s, i) => (
            <button key={s.id} onClick={() => setActive(i)} onDoubleClick={() => onSelect(s, parseFloat(qty) || 1)}
              className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${i === active ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-700 hover:border-blue-400'}`}>
              {s.label} — Rs.{fmt(s.price)}
            </button>
          ))}
        </div>
        <div className="mb-3">
          <label className="text-xs font-semibold text-slate-500 mb-1 block">{t('th.qty')}</label>
          <input ref={qtyRef} type="number" min="0.001" step="0.001" value={qty} onChange={e => setQty(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => onSelect(product.sizes[active], parseFloat(qty) || 1)}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">{t('btn.add')}</button>
          <button onClick={onClose} className="px-5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">{t('btn.cancel')}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Cart Item Zoom Modal ─────────────────────────────────────────────────────
function CartItemZoomModal({ item, onChange, onRemove, onClose }) {
  const { t } = useLocale();
  const [local, setLocal] = useState({ qty: item.qty, unit_price: item.unit_price, discount: item.discount || 0 });
  const total = Math.max(0, local.qty * local.unit_price - (local.discount || 0));

  function apply(changes) {
    const next = { ...local, ...changes };
    setLocal(next);
    onChange(next);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0 pr-2">
            <p className="font-bold text-slate-800 text-base leading-snug">{item.name}</p>
            {item.barcode && <p className="text-xs text-slate-400 font-mono mt-0.5">{item.barcode}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none shrink-0">&times;</button>
        </div>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">{t('th.qty')}</label>
            <input type="number" min="0.001" step="0.001" value={local.qty}
              onChange={e => apply({ qty: parseFloat(e.target.value) || local.qty })}
              onFocus={e => e.target.select()}
              onKeyDown={e => e.key === 'Enter' && onClose()}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-xl font-bold text-right outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">{t('th.price')}</label>
            <input type="number" min="0" step="0.01" value={local.unit_price}
              onChange={e => apply({ unit_price: parseFloat(e.target.value) || 0 })}
              onFocus={e => e.target.select()}
              onKeyDown={e => e.key === 'Enter' && onClose()}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-xl font-bold text-right outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">{t('lbl.discount')}</label>
            <input type="number" min="0" step="0.01" value={local.discount}
              onChange={e => apply({ discount: parseFloat(e.target.value) || 0 })}
              onFocus={e => e.target.select()}
              onKeyDown={e => e.key === 'Enter' && onClose()}
              placeholder="0"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-xl font-bold text-right outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="flex items-center justify-between py-3 border-t border-b border-slate-100 mb-4">
          <span className="text-sm font-semibold text-slate-500">{t('th.total')}</span>
          <span className="text-2xl font-bold text-slate-800">Rs.{fmt(total)}</span>
        </div>

        <div className="flex gap-3">
          <button onClick={() => { onRemove(); onClose(); }}
            className="flex-1 py-3 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 active:bg-red-700 transition-colors">
            {t('btn.delete')}
          </button>
          <button onClick={onClose}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 active:bg-blue-800 transition-colors">
            {t('btn.done')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cart Row ─────────────────────────────────────────────────────────────────
function CartRow({ item, onChange, onRemove, onZoom, onEnter, onArrow, highlight, isSinhala }) {
  const qtyRef = useRef(null);
  const [qtyStr, setQtyStr] = useState(String(item.qty));
  useEffect(() => { if (highlight) qtyRef.current?.focus(); }, [highlight]);
  useEffect(() => { setQtyStr(String(item.qty)); }, [item.qty]);

  const stockQty = parseFloat(item.stock_qty || 0);
  const overStock = stockQty > 0 && item.qty > stockQty;
  const priceOverridden = item.default_price != null && item.unit_price !== item.default_price;
  const navKey = e => {
    if (e.key === 'ArrowUp')   { e.preventDefault(); onArrow?.(-1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); onArrow?.(1); }
  };

  return (
    <div className={`grid items-center gap-2 px-4 py-2.5 text-sm transition-all duration-700 ${highlight ? 'bg-green-100 ring-2 ring-green-400' : overStock ? 'bg-orange-50' : 'bg-slate-100 hover:bg-slate-200'}`}
      style={{ gridTemplateColumns: 'minmax(0,1fr) 60px 88px 88px 72px 92px 24px' }}>
      <button type="button" onClick={onZoom} className="min-w-0 text-left">
        <p className="font-semibold text-slate-800 truncate leading-tight">{isSinhala && item.name_si ? item.name_si : item.name}</p>
        {item.barcode && <p className="text-xs text-slate-400 font-mono leading-tight">{item.barcode}</p>}
        {overStock && <p className="text-xs text-orange-500 font-semibold leading-tight">⚠ Exceeds stock ({stockQty})</p>}
      </button>
      <input ref={qtyRef} type="number" min="0.001" step="0.001" value={qtyStr}
        onChange={e => { setQtyStr(e.target.value); const v = parseFloat(e.target.value); if (v > 0) onChange({ qty: v }); }}
        onFocus={e => e.target.select()}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); } navKey(e); }}
        className={`cart-qty-input text-right rounded-lg border px-1.5 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500 w-full ${overStock ? 'border-orange-400 bg-orange-50' : 'border-slate-200'}`}
        title={overStock ? `Stock: ${stockQty}` : undefined} />
      <input type="number" min="0" step="0.01" value={item.selling_price || 0}
        onChange={e => onChange({ selling_price: parseFloat(e.target.value) || 0 })}
        onFocus={e => e.target.select()}
        onKeyDown={navKey}
        className="cart-cell-input text-right rounded-lg border border-slate-200 px-1.5 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500 w-full text-slate-500" />
      <input type="number" min="0" step="0.01" value={item.unit_price}
        onChange={e => onChange({ unit_price: parseFloat(e.target.value) || 0 })}
        onFocus={e => e.target.select()}
        onKeyDown={navKey}
        className={`cart-cell-input text-right rounded-lg border px-1.5 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500 w-full ${priceOverridden ? 'border-amber-400 bg-amber-50 font-semibold' : 'border-slate-200'}`} />
      <input type="text" inputMode="numeric" pattern="[0-9]*"
        value={Math.floor(item.discount || 0)}
        onChange={e => onChange({ discount: Math.floor(parseInt(e.target.value) || 0) })}
        onFocus={e => e.target.select()}
        onKeyDown={navKey}
        placeholder="0"
        className="cart-cell-input text-right rounded-lg border border-slate-200 px-1.5 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500 w-full" />
      <p className="text-right font-bold text-slate-800 text-base">{Number(item.total||0).toLocaleString('en-LK',{minimumFractionDigits:2})}</p>
      <button onClick={onRemove} className="text-red-400 hover:text-red-600 transition-colors flex items-center justify-center w-6 h-6">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </button>
    </div>
  );
}

// ─── Receipt ──────────────────────────────────────────────────────────────────
function Receipt({ sale, settings, user, onClose }) {
  const { t } = useLocale();
  const [printing, setPrinting] = useState(false);
  const printedRef = useRef(false);

  const f       = n => Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
  const fmtDate = s => new Date(s).toLocaleDateString('en-LK', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtTime = s => new Date(s).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', hour12: true });

  const payments   = sale.payments || [];
  const paidCash   = payments.filter(p => p.method === 'cash').reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const paidCard   = payments.filter(p => p.method === 'card').reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const paidCredit = payments.filter(p => p.method === 'credit').reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const change     = Math.max(0, parseFloat(sale.paid || 0) - parseFloat(sale.total || 0));
  const currency   = settings?.currency || 'Rs.';

  async function handlePrint() {
    if (printing) return;
    setPrinting(true);
    const paperSize   = '80mm';
    const receiptLang = settings?.receipt_language || 'en';
    const isSinhala   = receiptLang === 'si';
    const rl = key => (translations[receiptLang] || translations.en)[key] ?? translations.en[key];
    const minDelay = new Promise(r => setTimeout(r, 1200));

    let totalSaved = 0;
    const itemsHtml = (sale.items || []).map((item, idx) => {
      const qty = Number(item.qty || 0);
      const unit = parseFloat(item.unit_price || 0);
      const origPrice = parseFloat(item.original_price || 0) || unit;
      const lineDiscount = parseFloat(item.discount || 0);
      const originalLineTotal = qty * unit;
      const reducedLineTotal = Math.max(0, originalLineTotal - lineDiscount);
      const ourUnit = qty > 0 ? Math.max(0, reducedLineTotal / qty) : unit;
      if (origPrice > unit) totalSaved += (origPrice - unit) * qty;
      return `
      <div class="item-row">
        <div class="item-name">${idx + 1} ${isSinhala && item.name_si ? item.name_si : item.name}</div>
      </div>
      <div class="item-data">
        <span class="qty-col">${qty}</span>
        <span class="orig-col">${f(origPrice)}</span>
        <span class="our-col">${f(ourUnit)}</span>
        <span class="line-col">${f(reducedLineTotal)}</span>
      </div>
    `;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${sale.invoice_no}</title>
  ${isSinhala ? '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Sinhala:wght@700;800;900&display=swap" rel="stylesheet">' : ''}
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body {
      font-family: ${isSinhala ? "'Noto Sans Sinhala', sans-serif" : "'Courier New', Courier, monospace"};
      font-size: 13px;
      font-weight: 900;
      width: 80mm;
      max-width: 80mm;
      color: #000;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    body { padding: 5mm 4mm; }
    .logo { width:56px; height:56px; object-fit:contain; margin:0 auto 6px; display:block; border-radius:50%; }
    .shop-name { font-size:16px; font-weight:900; text-align:center; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:3px; word-break:break-word; }
    .shop-meta { font-size:12px; font-weight:900; text-align:center; line-height:1.6; word-break:break-word; }
    .divider { border:none; border-top:2px solid #000; margin:8px 0; }
    .row { display:flex; justify-content:space-between; gap:6px; padding:3px 0; font-size:12px; }
    .row span:first-child { flex-shrink:0; }
    .row span:last-child { text-align:right; word-break:break-word; min-width:0; }
    .col-header { display:flex; justify-content:flex-end; font-weight:900; padding:4px 0 3px; border-top:2px solid #000; border-bottom:2px solid #000; margin:6px 0; font-size:12px; }
    .col-head-prices { display:grid; grid-template-columns: 30px repeat(3, 1fr); gap:8px; min-width:168px; text-align:right; }
    .item-row { display:flex; justify-content:space-between; align-items:flex-start; gap:6px; font-weight:900; padding-top:5px; font-size:13px; }
    .item-name { flex:1; min-width:0; word-break:break-word; overflow-wrap:break-word; }
    .item-data { display:grid; grid-template-columns: 30px repeat(3, 1fr); gap:8px; text-align:right; padding:2px 0 5px; font-size:12px; font-weight:900; }
    .qty-col { text-align:left; }
    .orig-col, .our-col, .line-col { text-align:right; }
    .disc-box { border:2px solid #000; border-radius:4px; padding:3px 8px; display:flex; justify-content:space-between; gap:6px; margin:5px 0; }
    .total-row { display:flex; justify-content:space-between; align-items:baseline; gap:6px; font-weight:900; font-size:15px; padding:6px 0 4px; border-top:2px solid #000; margin-top:4px; }
    .paid-row { display:flex; justify-content:space-between; gap:6px; padding:3px 0; font-weight:900; font-size:12px; }
    .change-row { display:flex; justify-content:space-between; gap:6px; font-weight:900; padding:3px 0; font-size:13px; }
    .footer { text-align:center; margin-top:10px; font-size:12px; font-weight:900; line-height:1.8; word-break:break-word; }
    @media print {
      html, body { overflow: visible !important; height: auto !important; }
      @page { margin: 0; size: 80mm auto; }
      body { padding: 3mm 4mm; width: 80mm !important; }
    }
  </style>
</head>
<body>
  ${settings?.shop_logo ? `<img class="logo" src="${settings.shop_logo}" alt="logo">` : ''}
  <div class="shop-name">${settings?.shop_name || 'LMUC POS'}</div>
  <div class="shop-meta">
    ${settings?.address ? settings.address + '<br>' : ''}
    ${settings?.phone || ''}
  </div>
  <hr class="divider">
  <div class="row"><span>${rl('th.invoice')}</span><span>${sale.invoice_no}</span></div>
  <div class="row"><span>${rl('th.date')}</span><span>${fmtDate(sale.created_at)} ${fmtTime(sale.created_at)}</span></div>
  <div class="row"><span>${rl('lbl.cashier')}</span><span>${user?.name || '—'}</span></div>
  ${sale.customer_name ? `<div class="row"><span>${rl('lbl.customer')}</span><span>${sale.customer_name}</span></div>` : ''}
  <div class="col-header"><span class="col-head-prices"><span>${rl('th.qty')}</span><span>${rl('lbl.original_price')}</span><span>${rl('lbl.our_price')}</span><span>${rl('th.total')}</span></span></div>
  ${itemsHtml}
  <hr class="divider">
  ${totalSaved > 0 ? `<div class="disc-box"><span>${rl('lbl.you_saved')}</span><span>- ${f(totalSaved)}</span></div>` : ''}
  ${parseFloat(sale.discount) > 0 ? `<div class="disc-box"><span>${rl('lbl.earned_profit')}</span><span>- ${f(sale.discount)}</span></div>` : ''}
  <div class="total-row"><span>${rl('lbl.grand_total')}</span><span>${currency} ${f(sale.total)}</span></div>
  ${paidCash > 0  ? `<div class="paid-row"><span>${rl('lbl.cash_paid')} (${rl('lbl.cash')})</span><span>${f(paidCard === 0 && paidCredit === 0 ? parseFloat(sale.paid || 0) : paidCash)}</span></div>` : ''}
  ${paidCard > 0  ? `<div class="paid-row"><span>${rl('lbl.cash_paid')} (${rl('lbl.card')})</span><span>${f(paidCard)}</span></div>` : ''}
  ${paidCredit > 0 ? `<div class="paid-row"><span>${rl('lbl.credit')}</span><span>${f(paidCredit)}</span></div>` : ''}
  ${change > 0    ? `<div class="change-row"><span>${rl('lbl.change')}</span><span>${f(change)}</span></div>` : ''}
  <hr class="divider">
  <div class="footer">
    ${settings?.receipt_footer || 'Thank you for shopping with us!'}
    <br>lumac.lk
  </div>
</body>
</html>`;

    try {
      if (window.electronAPI?.printReceiptHtml) {
        const [r] = await Promise.all([window.electronAPI.printReceiptHtml(html, { paperSize }), minDelay]);
        if (r && !r.success) alert('Print failed: ' + (r.error || 'unknown error'));
      } else {
        const win = window.open('', '_blank', 'width=400,height=700,scrollbars=yes');
        if (win) { win.document.write(html); win.document.close(); win.onload = () => win.print(); }
        await minDelay;
      }
    } catch (err) {
      alert('Print error: ' + err.message);
    } finally {
      setPrinting(false);
    }
  }

  useEffect(() => {
    if (printedRef.current) return;
    printedRef.current = true;
    handlePrint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="px-8 py-7" style={{ fontFamily: "'Outfit', 'Noto Sans Sinhala', sans-serif" }}>
          <div className="text-center mb-5">
            {settings?.shop_logo ? (
              <img src={settings.shop_logo} alt="logo" className="w-24 h-24 object-contain mx-auto mb-3 rounded-full" />
            ) : (
              <div className="w-24 h-24 bg-slate-100 rounded-full mx-auto mb-3 flex items-center justify-center text-slate-400 text-4xl font-black">
                {(settings?.shop_name || 'L')[0]}
              </div>
            )}
            <p className="font-black text-black text-xl tracking-wide uppercase">{settings?.shop_name || 'LMUC POS'}</p>
            {settings?.address && <p className="text-black text-sm font-medium mt-0.5">{settings.address}</p>}
            {settings?.phone && <p className="text-black text-sm font-medium">{settings.phone}</p>}
          </div>

          <hr className="border-slate-200 mb-4" />

          <div className="space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-black font-semibold">{t('th.invoice')}</span><span className="font-bold text-black font-mono">{sale.invoice_no}</span></div>
            <div className="flex justify-between text-sm"><span className="text-black font-semibold">{t('th.date')}</span><span className="font-bold text-black">{fmtDate(sale.created_at || Date.now())} {fmtTime(sale.created_at || Date.now())}</span></div>
            <div className="flex justify-between text-sm"><span className="text-black font-semibold">{t('lbl.cashier')}</span><span className="font-bold text-black">{user?.name || '—'}</span></div>
            {sale.customer_name && <div className="flex justify-between text-sm"><span className="text-black font-semibold">{t('lbl.customer')}</span><span className="font-bold text-black">{sale.customer_name}</span></div>}
          </div>

          <hr className="border-slate-200 my-4" />

          <div className="mb-3">
            <div className="flex justify-end text-sm font-black text-black border-b-2 border-slate-200 pb-2 mb-3">
              <div className="grid grid-cols-[30px_repeat(3,minmax(0,1fr))] gap-2 min-w-[220px] text-right">
                <span>{t('th.qty')}</span>
                <span>{t('lbl.original_price')}</span>
                <span>{t('lbl.our_price')}</span>
                <span>{t('th.total')}</span>
              </div>
            </div>
            {(sale.items || []).map((item, idx) => {
              const qty = Number(item.qty || 0);
              const unit = parseFloat(item.unit_price || 0);
              const lineDiscount = parseFloat(item.discount || 0);
              const originalLineTotal = qty * unit;
              const reducedLineTotal = Math.max(0, originalLineTotal - lineDiscount);
              const ourUnit = qty > 0 ? Math.max(0, reducedLineTotal / qty) : unit;
              return (
              <div key={idx} className="mb-3">
                <div className="text-sm font-bold text-black">{idx + 1} {item.name}</div>
                <div className="grid grid-cols-[30px_repeat(3,minmax(0,1fr))] gap-2 text-sm text-black font-semibold pl-1 mt-0.5">
                  <span className="text-left">{qty}</span>
                  <span className="text-right">{f(unit)}</span>
                  <span className="text-right text-black">{f(ourUnit)}</span>
                  <span className="text-right">{f(reducedLineTotal)}</span>
                </div>
              </div>
            );
            })}
          </div>

          <hr className="border-slate-200 mb-4" />

          <div className="space-y-2">
            {parseFloat(sale.discount) > 0 && (
              <div className="flex justify-between items-center border-2 border-slate-300 rounded-lg px-3 py-1.5 bg-slate-50">
                <span className="text-black font-bold text-sm">{t('lbl.earned_profit')}</span>
                <span className="text-black font-extrabold text-sm">- {f(sale.discount)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-1 border-t border-slate-100">
              <span className="text-base font-black text-black">{t('lbl.grand_total')}</span>
              <span className="text-xl font-black text-black">{currency} {f(sale.total)}</span>
            </div>
            {paidCash > 0 && (
              <div className="flex justify-between text-sm"><span className="text-black font-semibold">{t('lbl.cash_paid')} ({t('lbl.cash')})</span><span className="font-bold text-black">{f(paidCash)}</span></div>
            )}
            {paidCard > 0 && (
              <div className="flex justify-between text-sm"><span className="text-black font-semibold">{t('lbl.cash_paid')} ({t('lbl.card')})</span><span className="font-bold text-black">{f(paidCard)}</span></div>
            )}
            {paidCredit > 0 && (
              <div className="flex justify-between text-sm"><span className="text-black font-semibold">{t('lbl.credit')}</span><span className="font-bold text-black">{f(paidCredit)}</span></div>
            )}
            {change > 0 && (
              <div className="flex justify-between text-sm font-bold text-black"><span>{t('lbl.change')}</span><span>{f(change)}</span></div>
            )}
          </div>

          <hr className="border-slate-200 my-5" />

          <div className="text-center leading-relaxed">
            <p className="text-sm font-semibold text-black">{settings?.receipt_footer || 'Thank you for shopping with us!'}</p>
            <p className="text-black font-bold text-sm mt-1">lumac.lk</p>
          </div>
        </div>

        <div className="flex gap-2 p-4 pt-0">
          <button onClick={handlePrint} disabled={printing}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {Icon.print} {printing ? t('lbl.loading') : t('btn.print')}
          </button>
          <button onClick={onClose}
            className="flex-1 py-3 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors">
            {t('btn.close')} &amp; {t('btn.new_sale')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Step Badge ───────────────────────────────────────────────────────────────
function Step({ n, label }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{n}</div>
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

// ─── Main POS ─────────────────────────────────────────────────────────────────
export default function SalesCreate() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const user     = useSelector(selectCurrentUser);
  const role     = useSelector(selectRole);
  const token    = useSelector(selectToken);

  const { t } = useLocale();
  const { products, ready, deductStock, invalidate } = useProductCache();
  const [createSale, { isLoading: submitting }] = useCreateSaleMutation();
  const [quickAdd] = posApi.useQuickAddCustomerMutation();
  const { isOnline } = useConnectivity();
  const { data: custData } = posApi.useGetPOSCustomersQuery(undefined, { skip: !isOnline });
  const [localCustomers, setLocalCustomers] = useState([]);
  useEffect(() => {
    if (!isOnline) getLocalCustomers().then(setLocalCustomers);
    else setLocalCustomers([]);
  }, [isOnline]);
  const { data: settings } = posApi.useGetPOSSettingsQuery();
  const isSinhala = (settings?.receipt_language || 'en') === 'si';

  // Search
  const searchRef   = useRef(null);
  const [query, setQuery]     = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const [activeIdx, setActive]  = useState(-1);

  // Barcode scan detection (search input)
  const keyIntervals = useRef([]);
  const lastKeyTime  = useRef(0);
  const isScan       = useRef(false);

  // Cart input barcode interception
  const csBuffer    = useRef('');
  const csTimes     = useRef([]);
  const csLast      = useRef(0);
  const csActive    = useRef(false);
  const csPreBuf    = useRef([]);
  const csOrigVal   = useRef(null);
  const addToCartRef = useRef(null);

  // Cart
  const [cart, setCart]         = useState([]);
  const [highlights, setHl]     = useState({});
  const [sizePicker, setSizePicker] = useState(null);
  const [priceMode, setPriceMode]   = useState('retail');
  const [billDiscount, setBillDisc] = useState('');
  const [discType, setDiscType]     = useState('amount');
  const [customItem, setCustom]     = useState(null);
  const [zoomedItem, setZoomed]     = useState(null);
  const [err, setErr]           = useState('');
  const [custErr, setCustErr]   = useState('');
  const [scanNotFound, setScanNotFound] = useState('');
  const [outOfStock, setOutOfStock]     = useState('');

  // Payment (inline)
  const [payMethod, setPayMethod] = useState('cash');
  const [cashPaid, setCashPaid]   = useState('');
  const [shakeInput, setShakeInput] = useState(false);
  const [cardRef, setCardRef]     = useState('');
  const [splitCash, setSplitCash] = useState('');
  const [splitCardRef, setSplitCardRef] = useState('');
  const [splitMode, setSplitMode] = useState('card'); // 'card' | 'credit'
  const cashInputRef = useRef(null);

  // Customer
  const [customer, setCustomer]   = useState(null);
  const [custQuery, setCustQuery] = useState('');
  const [showCustDrop, setShowCust] = useState(false);
  const [qcForm, setQcForm]       = useState(null);
  const [extraCustomers, setExtraCustomers] = useState([]);

  // Hold
  const [heldBills, setHeld]       = useState(() => JSON.parse(localStorage.getItem('pos_held') || '[]'));
  const [showHeld, setShowHeld]     = useState(false);
  const [holdNote, setHoldNote]     = useState('');
  const [showHoldModal, setHoldModal] = useState(false);

  // Receipt
  const [receipt, setReceipt] = useState(null);

  // Qty multiplier shortcut (e.g. "3*cola")
  const [qtyMultiplier, setQtyMultiplier] = useState(1);

  // Category filter
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Return modal
  const [showReturn, setShowReturn] = useState(false);
  const [returnInvoiceNo, setReturnInvoiceNo] = useState('');
  const [returnSaleId, setReturnSaleId] = useState(null);
  const [returnSaleData, setReturnSaleData] = useState(null);
  const [returnItemQtys, setReturnItemQtys] = useState({});
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnErr, setReturnErr] = useState('');
  const [returnDone, setReturnDone] = useState(null);
  const [doReturn] = useReturnSaleMutation();

  const returnInFlight = useRef(false);
  async function loadReturnSale() {
    if (!returnInvoiceNo.trim() || returnInFlight.current) return;
    returnInFlight.current = true;
    setReturnLoading(true); setReturnErr(''); setReturnSaleData(null); setReturnItemQtys({});
    try {
      // Step 1: find sale ID by invoice_no
      const listRes = await fetch(`/api/sales?search=${encodeURIComponent(returnInvoiceNo.trim())}&limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listData = await listRes.json();
      const found = (listData.data || []).find(s => s.invoice_no === returnInvoiceNo.trim());
      if (!found) { setReturnErr('Invoice not found'); return; }
      // Step 2: fetch with items
      const detailRes = await fetch(`/api/sales/${found.id}/return`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!detailRes.ok) { setReturnErr('Failed to load invoice details'); return; }
      const detail = await detailRes.json();
      setReturnSaleData(detail); setReturnSaleId(found.id);
    } catch (e) { setReturnErr(e?.message || 'Network error'); }
    finally { setReturnLoading(false); returnInFlight.current = false; }
  }

  // Mobile tab: 'cart' | 'pay'
  const [mobileTab, setMobileTab] = useState('cart');

  // ─── Derived ─────────────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const map = new Map();
    products.forEach(p => { if (p.category_id && p.category?.name) map.set(p.category_id, p.category.name); });
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const dropdownItems = useMemo(() => {
    let base = selectedCategory ? products.filter(p => p.category_id === selectedCategory) : products;
    const q = query.trim().toLowerCase();
    if (!q) return base.slice(0, 20);
    return base.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.name_si && p.name_si.includes(q)) ||
      (p.barcode && p.barcode.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [query, products, selectedCategory]);

  const fastProducts = useMemo(() => {
    const base = selectedCategory ? products.filter(p => p.category_id === selectedCategory) : products;
    const fast = base.filter(p => p.is_fast_moving);
    return (fast.length > 0 ? fast : base).slice(0, 6);
  }, [products, selectedCategory]);

  const subtotal    = cart.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const lineDisc    = cart.reduce((s, i) => s + (i.discount || 0), 0);
  const billDiscAmt = useMemo(() => {
    const v = parseFloat(billDiscount) || 0;
    if (discType === 'percent') return Math.min((subtotal - lineDisc) * Math.min(v, 70) / 100, subtotal - lineDisc);
    return Math.min(v, subtotal - lineDisc);
  }, [billDiscount, discType, subtotal, lineDisc]);
  const totalDisc = lineDisc + billDiscAmt;
  const total     = Math.max(0, subtotal - totalDisc);

  const cashNum   = parseFloat(cashPaid) || 0;
  const change    = cashNum - total;

  const customers = useMemo(() => {
    const base = isOnline ? (custData?.data || []) : localCustomers;
    return [...base, ...extraCustomers.filter(e => !base.find(b => b.id === e.id))];
  }, [custData, localCustomers, extraCustomers, isOnline]);

  const filteredCusts = useMemo(() => {
    const q = custQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 15);
    return customers.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(custQuery.trim())).slice(0, 15);
  }, [custQuery, customers]);

  // ─── Focus helper ──────────────────────────────────────────────────────────
  const refocus = useCallback(() => setTimeout(() => searchRef.current?.focus(), 50), []);
  useEffect(() => { searchRef.current?.focus(); }, []);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = e => {
      if (document.activeElement?.tagName === 'INPUT' && e.key !== 'F10' && e.key !== 'F11') return;
      if (e.key === 'F1')  { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F2')  { e.preventDefault(); setPayMethod('cash');   setTimeout(() => cashInputRef.current?.focus(), 50); }
      if (e.key === 'F3')  { e.preventDefault(); setPayMethod('card'); }
      if (e.key === 'F4')  { e.preventDefault(); setPayMethod('credit'); }
      if (e.key === 'F5')  { e.preventDefault(); setPayMethod('split'); }
      if (e.key === 'F10') { e.preventDefault(); if (cart.length > 0) handleCompleteSale(false, true); }
      if (e.key === 'F11') { e.preventDefault(); if (cart.length > 0) handleCompleteSale(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cart, total, payMethod, cashPaid, cardRef, splitCash, splitCardRef, customer]);

  // ─── Global barcode capture — redirect keystrokes to search when unfocused ─
  useEffect(() => {
    const onGlobalKey = e => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      searchRef.current?.focus();
      setQuery(prev => prev + e.key);
      // Don't open dropdown — let onSearchKeyDown decide after scan detection
    };
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, []);

  // ─── Capture original value + reset raw buffer when a cart input gains focus ─
  useEffect(() => {
    const onFocusIn = e => {
      const el = e.target;
      const isCart = el.classList.contains('cart-qty-input') || el.classList.contains('cart-cell-input');
      csOrigVal.current  = isCart ? el.value : null;
      csBuffer.current   = '';
      csTimes.current    = [];
      csLast.current     = 0;
    };
    document.addEventListener('focusin', onFocusIn, true);
    return () => document.removeEventListener('focusin', onFocusIn, true);
  }, []);

  // ─── Barcode scan interception for cart inputs (qty / price / discount) ───
  // Key insight: number inputs strip leading zeros and letters, so we CANNOT use
  // el.value as the barcode. Instead we buffer raw keystrokes separately.
  // On Enter: if raw buffer ≥6 chars AND last 4 inter-key gaps were all fast
  // (the cold-start gap is at position -5 or earlier, so slice(-4) skips it), add to cart.
  useEffect(() => {
    const T = 60, MIN = 4;

    const handler = e => {
      const el = document.activeElement;
      if (!el || el === searchRef.current) return;
      const isCart = el.classList.contains('cart-qty-input') || el.classList.contains('cart-cell-input');
      if (!isCart) {
        csBuffer.current = '';
        csTimes.current  = [];
        csLast.current   = 0;
        return;
      }

      const now = Date.now();

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const gap = csLast.current > 0 ? now - csLast.current : 9999;
        csLast.current = now;
        csTimes.current.push(gap);
        if (csTimes.current.length > 20) csTimes.current.shift();
        csBuffer.current += e.key; // raw char — preserves letters & leading zeros
        return; // let the char reach the input normally
      }

      if (e.key === 'Backspace') {
        csBuffer.current = csBuffer.current.slice(0, -1);
        csLast.current   = 0; // break any scan sequence
        return;
      }

      if (e.key === 'Enter') {
        const buf       = csBuffer.current;
        const recentFast = csTimes.current.length >= MIN &&
          csTimes.current.slice(-MIN).every(g => g < T);

        // Reset state regardless of outcome
        csBuffer.current = '';
        csTimes.current  = [];
        csLast.current   = 0;

        if (buf.length >= 6 && recentFast) {
          e.preventDefault();
          e.stopPropagation();

          // Restore the input to the value it had when focused
          const orig   = csOrigVal.current ?? '';
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, orig);
          el.dispatchEvent(new Event('input', { bubbles: true }));

          const hit = products.find(p => p.barcode === buf);
          if (hit) addToCartRef.current?.(hit, null, false);
          else setScanNotFound(buf);
          searchRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [products]);

  // ─── Auto-add product when navigated here with a scanned barcode ─────────
  useEffect(() => {
    if (!scanNotFound) return;
    const t = setTimeout(() => setScanNotFound(''), 5000);
    return () => clearTimeout(t);
  }, [scanNotFound]);
  useEffect(() => {
    if (!outOfStock) return;
    const t = setTimeout(() => setOutOfStock(''), 3000);
    return () => clearTimeout(t);
  }, [outOfStock]);

  const autoBarcodeDone = useRef(false);
  useEffect(() => {
    const bc = location.state?.barcode;
    if (!bc || !ready || autoBarcodeDone.current) return;
    autoBarcodeDone.current = true;
    const hit = products.find(p => p.barcode === bc);
    if (hit) addToCart(hit, null, false);
    else setScanNotFound(bc);
    navigate(location.pathname, { replace: true, state: {} });
  }, [ready, location.state?.barcode]);

  // ─── Cart helpers ─────────────────────────────────────────────────────────
  function flash(key) {
    setHl(h => ({ ...h, [key]: true }));
    setTimeout(() => setHl(h => { const n = { ...h }; delete n[key]; return n; }), 2000);
  }

  function addToCart(product, qty = null, focusQty = true) {
    setErr('');
    if (product.sizes?.length > 0) { setSizePicker({ product }); setQuery(''); return; }
    if ((product.stock_qty ?? 0) <= 0) { setOutOfStock(product.name_si || product.name); refocus(); return; }
    const variantId = product.variant_id || null;
    const key       = itemKey({ product_id: product.id, variant_id: variantId });
    setCart(prev => {
      const idx = prev.findIndex(i => i.product_id === product.id && i.variant_id === variantId);
      if (idx >= 0) {
        const item = prev[idx];
        const newQ = Math.min(item.qty + 1, item.stock_qty > 0 ? item.stock_qty : Infinity);
        flash(key);
        return prev.map((i, j) => j === idx ? recalc({ ...i, qty: newQ }) : i);
      }
      const ws    = parseFloat(product.wholesale_price) || 0;
      const promo = (product.our_price ? parseFloat(product.our_price) : null) ?? (product.promo_price ? parseFloat(product.promo_price) : null);
      const base  = promo ?? (parseFloat(product.selling_price) || 0);
      const price = priceMode === 'wholesale' && ws > 0 ? ws : base;
      flash(key);
      return [...prev, recalc({
        product_id: product.id, variant_id: variantId,
        name: product.name, name_si: product.name_si || '',
        barcode: product.barcode || '', qty: qty ?? 1, unit_price: price, default_price: price,
        selling_price: parseFloat(product.selling_price) || 0, promo_price: promo,
        wholesale_price: ws, discount: 0, total: 0,
        unit: product.unit || 'pcs', stock_qty: product.stock_qty || 0,
        image: product.image || null,
      })];
    });
    setQuery(''); setShowDrop(false); setActive(-1);
    if (focusQty) setTimeout(() => {
      const inputs = document.querySelectorAll('.cart-qty-input');
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
    }, 20);
  }
  addToCartRef.current = addToCart;

  function onSizeSelect(size, qty) {
    const p = sizePicker.product;
    setSizePicker(null);
    addToCart({ ...p, variant_id: size.id, name: `${p.name} - ${size.label}`,
      name_si: null, selling_price: size.price, wholesale_price: size.price,
      promo_price: null, sizes: [] }, qty, false);
    refocus();
  }

  function onSearchKeyDown(e) {
    const now = Date.now();
    if (e.key.length === 1 && /[0-9A-Za-z]/.test(e.key)) {
      const gap = lastKeyTime.current > 0 ? now - lastKeyTime.current : 9999;
      lastKeyTime.current = now;
      keyIntervals.current.push(gap);
      if (keyIntervals.current.length > 6) keyIntervals.current.shift();
      isScan.current = keyIntervals.current.length >= 3 && keyIntervals.current.slice(-3).every(g => g < 60);
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, dropdownItems.length - 1)); setShowDrop(true); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === 'Escape')    { setShowDrop(false); setQuery(''); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isScan.current && query.trim()) {
        const bc = query.trim();
        isScan.current = false; keyIntervals.current = []; lastKeyTime.current = 0;
        const hit = products.find(p => p.barcode === bc);
        if (hit) addToCart(hit, qtyMultiplier, false);
        else setScanNotFound(bc);
        setQtyMultiplier(1); setQuery(''); setShowDrop(false); refocus(); return;
      }
      const items = dropdownItems;
      if (activeIdx >= 0 && items[activeIdx]) { addToCart(items[activeIdx], qtyMultiplier); setQtyMultiplier(1); return; }
      const q = query.trim().toLowerCase();
      const found = items.find(p => p.barcode?.toLowerCase() === q) || items[0];
      if (found) { addToCart(found, qtyMultiplier); setQtyMultiplier(1); }
    }
  }

  // ─── Complete sale ────────────────────────────────────────────────────────
  async function handleCompleteSale(saveOnly = false, redirectAndPrint = false) {
    setErr('');

    // Block if too many unsynced offline invoices
    if (!isOnline) {
      const pending = await getPendingCount();
      if (pending >= OFFLINE_LIMIT) {
        setErr(`Sync required: ${pending} unsynced invoices. Please connect to internet to sync first.`);
        return;
      }
    }

    if (payMethod === 'credit' && !customer) { setCustErr(t('lbl.credit_warn')); return; }
    if (payMethod === 'split' && splitMode === 'credit' && !customer) { setCustErr(t('lbl.credit_warn')); return; }
    if (payMethod === 'cash' && !saveOnly && cashNum < total) {
      setErr('Cash paid is less than total');
      cashInputRef.current?.focus();
      setShakeInput(true);
      setTimeout(() => setShakeInput(false), 500);
      return;
    }

    const payments = [];
    if (payMethod === 'cash')   payments.push({ method: 'cash',   amount: total,      reference: null });
    else if (payMethod === 'card')   payments.push({ method: 'card',   amount: total,      reference: cardRef });
    else if (payMethod === 'qr')     payments.push({ method: 'qr',     amount: total,      reference: null });
    else if (payMethod === 'credit') payments.push({ method: 'credit', amount: total,      reference: null });
    else if (payMethod === 'split') {
      const sc        = parseFloat(splitCash) || 0;
      const remaining = Math.max(0, total - sc);
      payments.push({ method: 'cash', amount: sc, reference: null });
      if (splitMode === 'credit') {
        payments.push({ method: 'credit', amount: remaining, reference: null });
      } else {
        payments.push({ method: 'card', amount: remaining, reference: splitCardRef });
      }
    }

    const paid = payMethod === 'cash' ? cashNum : total;
    const items = cart.map(i => ({
      product_id: i.product_id, variant_id: i.variant_id || null,
      product_name: isSinhala && i.name_si ? i.name_si : i.name, unit_price: i.unit_price,
      original_price: i.promo_price ? i.selling_price : 0,
      cost_price: 0, qty: i.qty, discount: i.discount || 0, total: i.total,
    }));
    const salePayload = {
      items, payments, customer_id: customer?.id || null,
      subtotal, discount: totalDisc, tax: 0, extra_charges: 0,
      total, paid, balance: Math.max(0, total - paid), status: 'completed',
    };

    // ── Offline path ──────────────────────────────────────────────────────────
    if (!isOnline) {
      try {
        const cartSnapshot = cart.map(i => ({ name: i.name, qty: i.qty, unit_price: i.unit_price, discount: i.discount || 0, total: i.total }));
        const offlineResult = await enqueueOfflineSale(salePayload);
        cart.forEach(item => { if (item.product_id) deductStock(item.product_id, item.qty); });
        setCart([]); setCustomer(null); setCustQuery(''); setBillDisc(''); setCashPaid('');
        if (!saveOnly) {
          setReceipt({
            ...offlineResult,
            items: cartSnapshot,
            payments,
            subtotal, discount: totalDisc, total, paid, customer_name: customer?.name,
          });
        }
      } catch (e) {
        setErr('Failed to save offline: ' + (e.message || 'unknown error'));
      }
      return;
    }

    // ── Online path ───────────────────────────────────────────────────────────
    try {
      const result = await createSale(salePayload).unwrap();

      cart.forEach(item => { if (item.product_id) deductStock(item.product_id, item.qty); });
      invalidate();

      setCart([]); setCustomer(null); setCustQuery(''); setBillDisc(''); setCashPaid('');
      if (!saveOnly) {
        if (redirectAndPrint && result?.id) {
          navigate('/sales/' + result.id, { state: { autoPrint: true } });
        } else {
          setReceipt({
            ...result,
            items: cart.map(i => ({ name: i.name, qty: i.qty, unit_price: i.unit_price, discount: i.discount || 0, total: i.total })),
            payments,
            subtotal, discount: totalDisc, total, paid, customer_name: customer?.name,
          });
        }
      }
    } catch (e) {
      setErr(e?.data?.error || 'Failed to save sale');
    }
  }

  function confirmHold() {
    const updated = [...heldBills, { id: Date.now(), note: holdNote, cart, customer, createdAt: new Date().toISOString() }];
    localStorage.setItem('pos_held', JSON.stringify(updated));
    setHeld(updated); setCart([]); setCustomer(null); setCustQuery(''); setBillDisc(''); setHoldNote(''); setHoldModal(false); refocus();
  }

  function resumeHeld(idx) {
    const bill = heldBills[idx];
    setCart(bill.cart || []); setCustomer(bill.customer || null);
    const updated = heldBills.filter((_, i) => i !== idx);
    localStorage.setItem('pos_held', JSON.stringify(updated));
    setHeld(updated); setShowHeld(false); refocus();
  }

  function addCustomItem() {
    if (!customItem?.name?.trim() || !customItem?.price) return;
    const price = parseFloat(customItem.price);
    if (!price || price <= 0) return;
    setCart(prev => [...prev, recalc({
      product_id: null, variant_id: null, _custom_id: Date.now(),
      name: customItem.name.trim(), barcode: '', qty: 1,
      unit_price: price, selling_price: price, promo_price: null, wholesale_price: 0,
      discount: 0, total: price, unit: 'pcs', stock_qty: 9999, is_custom: true,
    })]);
    setCustom(null); refocus();
  }

  async function saveQuickCustomer() {
    if (!qcForm?.name?.trim()) return;
    try {
      const res = await quickAdd({ name: qcForm.name.trim(), phone: qcForm.phone || null }).unwrap();
      const c = res.customer;
      setExtraCustomers(prev => [...prev, c]);
      setCustomer(c); setCustQuery(c.name); setQcForm(null); refocus();
    } catch (e) { setErr(e?.data?.error || 'Failed to add customer'); }
  }

  const newSale = () => { setCart([]); setCustomer(null); setCustQuery(''); setBillDisc(''); setQuery(''); setReceipt(null); setCashPaid(''); refocus(); };
  const handleLogout = () => { dispatch(logout()); navigate('/login'); };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-slate-100 min-h-0 overflow-hidden">

      {/* Out of stock full-screen flash */}
      {outOfStock && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 select-none"
          onClick={() => setOutOfStock('')}>
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-80 flex flex-col items-center text-center">
            <div className="text-9xl mb-3">📦</div>
            <p className="text-orange-500 text-2xl font-black mb-1">තොගය අවසන්</p>
            <p className="text-slate-700 text-base font-semibold mb-1">{outOfStock}</p>
            <p className="text-slate-400 text-xs mb-6">Out of Stock</p>
            <button onClick={() => setOutOfStock('')}
              className="w-full py-3 rounded-2xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-700 transition-colors">
              හරි
            </button>
          </div>
        </div>
      )}

      {/* Barcode not found full-screen flash */}
      {scanNotFound && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 select-none">
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-80 flex flex-col items-center text-center">
            <div className="text-9xl mb-3">⚠️</div>
            <p className="text-yellow-500 text-2xl font-black mb-1">හාණ්ඩය හමු නොවීය</p>
            <p className="text-slate-500 text-sm font-mono mb-6">{scanNotFound}</p>
            <div className="flex flex-col gap-2 w-full">
              {cart.length > 0 && (
                <button
                  onClick={() => {
                    const updated = [...heldBills, { id: Date.now(), note: `බාකෝඩ්: ${scanNotFound}`, cart, customer, createdAt: new Date().toISOString() }];
                    localStorage.setItem('pos_held', JSON.stringify(updated));
                    setHeld(updated); setCart([]); setCustomer(null); setCustQuery(''); setBillDisc('');
                    setScanNotFound('');
                    navigate('/products/intake', { state: { barcode: scanNotFound } });
                  }}
                  className="w-full py-3 rounded-2xl bg-yellow-400 text-black text-sm font-black shadow hover:bg-yellow-300 transition-colors">
                  ⏸ බිල් රඳවා හාණ්ඩය සාදන්න
                </button>
              )}
              <button
                onClick={() => {
                  const bc = scanNotFound;
                  setScanNotFound('');
                  navigate('/products/intake', { state: { barcode: bc } });
                }}
                className="w-full py-3 rounded-2xl bg-slate-800 text-white text-sm font-bold hover:bg-slate-700 transition-colors">
                + හාණ්ඩය සාදන්න
              </button>
              <button onClick={() => setScanNotFound('')}
                className="w-full py-2 rounded-2xl text-slate-400 text-sm font-semibold hover:text-slate-600 transition-colors">
                නැවත යන්න
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Top header bar ── */}
      <div className="bg-slate-900 border-b border-slate-700 px-3 h-12 flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => navigate('/sales')} className="text-slate-400 hover:text-white transition-colors">{Icon.back}</button>
          <button onClick={() => navigate('/dashboard')} title="Home" className="text-slate-400 hover:text-white transition-colors">{Icon.home}</button>
          <h1 className="font-bold text-white text-sm hidden sm:block">{t('page.new_sale')}</h1>
        </div>

        {/* Shortcut pills — desktop only */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs">
          {[['F1', t('btn.search')],['F2', t('lbl.cash')],['F3', t('lbl.card')],['F4', t('lbl.credit')],['F5','Split'],['F10', t('btn.complete')]].map(([k,l]) => (
            <span key={k} className="bg-slate-800 text-slate-300 rounded px-1.5 py-0.5 font-medium">
              <span className="text-slate-500">{k} </span>{l}
            </span>
          ))}
        </div>

        {/* Mobile tab switcher */}
        <div className="flex lg:hidden rounded-lg border border-slate-700 overflow-hidden text-xs font-bold">
          <button onClick={() => setMobileTab('cart')}
            className={`px-4 py-1.5 transition-colors ${mobileTab === 'cart' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
            {t('pos.add_products')}
          </button>
          <button onClick={() => setMobileTab('pay')}
            className={`px-4 py-1.5 transition-colors border-l border-slate-700 ${mobileTab === 'pay' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
            {t('pos.payment_method_label')}
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Day End */}
          <button className="hidden sm:flex items-center gap-1.5 bg-blue-500 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg hover:bg-blue-400 transition-colors">
            {Icon.sun} <span className="hidden md:inline">{t('rep.day_end')}</span>
          </button>

          {/* Return */}
          <button onClick={() => { setShowReturn(true); setReturnInvoiceNo(''); setReturnSaleId(null); setReturnSaleData(null); setReturnErr(''); setReturnDone(null); }}
            className="hidden sm:flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/20 transition-colors">
            ↩ Return
          </button>

          {/* Held bills badge */}
          {heldBills.length > 0 && (
            <button onClick={() => setShowHeld(true)} className="relative bg-orange-500/20 text-orange-300 text-xs font-bold px-2.5 py-1.5 rounded-lg hover:bg-orange-500/30 transition-colors">
              Held ({heldBills.length})
            </button>
          )}

          <button onClick={invalidate} className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-700 rounded-lg transition-colors" title="Refresh products">{Icon.refresh}</button>

          {/* User avatar */}
          <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-700">
            <div className="w-7 h-7 rounded-full bg-green-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <button onClick={handleLogout} className="text-slate-400 hover:text-white p-1 hover:bg-slate-700 rounded-lg transition-colors">{Icon.logout}</button>
          </div>
        </div>
      </div>

      {/* ── Main body ── */}
      <div className="flex flex-1 min-h-0 gap-0">

        {/* ═══ LEFT PANEL (Cart / Products) ════════════════════════════════════ */}
        <div className={`flex flex-col min-w-0 overflow-hidden
          w-full lg:w-[60%]
          ${mobileTab === 'pay' ? 'hidden lg:flex' : 'flex'}`}>

          {/* Section header + search + tabs */}
          <div className="px-4 pt-3 pb-2 space-y-2 shrink-0">
            <Step n="1" label={t('pos.add_products').toUpperCase()} />

            {/* Search bar + mode tabs inline */}
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{Icon.search}</span>
                <input
                  ref={searchRef}
                  value={qtyMultiplier > 1 ? `${qtyMultiplier}*${query}` : query}
                  onChange={e => {
                    const val = e.target.value;
                    const m = val.match(/^(\d+)\*(.*)$/);
                    if (m) { setQtyMultiplier(parseInt(m[1])); setQuery(m[2]); }
                    else { setQtyMultiplier(1); setQuery(val); }
                    if (!isScan.current) { setShowDrop(true); setActive(-1); }
                  }}
                  onFocus={() => { if (!isScan.current) setShowDrop(ready && dropdownItems.length > 0); }}
                  onBlur={() => setTimeout(() => setShowDrop(false), 150)}
                  onKeyDown={onSearchKeyDown}
                  placeholder={ready ? t('pos.search_product') : t('lbl.loading')}
                  readOnly={!ready}
                  autoFocus
                  className="w-full pl-9 pr-16 py-2 rounded-xl border border-slate-400 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-slate-500 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md transition-colors">
                  {Icon.barcode} <span>Scan</span>
                </button>
                {showDrop && (
                  <ProductDropdown items={dropdownItems} activeIdx={activeIdx}
                    onSelect={p => { addToCart(p, qtyMultiplier); setQtyMultiplier(1); setShowDrop(false); }} />
                )}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => setPriceMode('retail')}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    priceMode === 'retail' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-300'}`}>
                  {Icon.retail} {t('pos.retail_mode')}
                </button>
                <button onClick={() => setPriceMode('wholesale')}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    priceMode === 'wholesale' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-300'}`}>
                  {Icon.tag} {t('pos.wholesale_mode')}
                </button>
                <button onClick={() => setCustom({ name: '', price: '' })}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-white text-slate-600 hover:bg-slate-50 border border-slate-300 transition-colors">
                  + Custom
                </button>
              </div>
            </div>
            {/* Qty multiplier badge */}
            {qtyMultiplier > 1 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-semibold text-blue-700">
                <span>×{qtyMultiplier} qty — next product will be added with this quantity</span>
                <button onClick={() => setQtyMultiplier(1)} className="text-blue-400 hover:text-blue-600 font-bold">&times;</button>
              </div>
            )}

            {/* Category chips */}
            {categories.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                <button onClick={() => setSelectedCategory(null)}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${!selectedCategory ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'}`}>
                  All
                </button>
                {categories.map(c => (
                  <button key={c.id} onClick={() => setSelectedCategory(selectedCategory === c.id ? null : c.id)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${selectedCategory === c.id ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'}`}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {err && (
              <div className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-medium rounded-lg">{err}</div>
            )}

            {/* Custom item row */}
            {customItem && (
              <div className="flex gap-2 items-center bg-yellow-50 rounded-xl p-2 border border-yellow-200">
                <input value={customItem.name} onChange={e => setCustom(c => ({ ...c, name: e.target.value }))}
                  placeholder="Item name" autoFocus
                  className="flex-1 rounded-lg border border-slate-400 px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-500 bg-white" />
                <input type="number" value={customItem.price} onChange={e => setCustom(c => ({ ...c, price: e.target.value }))}
                  placeholder="Price" className="w-24 rounded-lg border border-slate-400 px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-500 bg-white text-right" />
                <button onClick={addCustomItem} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">Add</button>
                <button onClick={() => setCustom(null)} className="px-2 py-1.5 text-slate-500 hover:text-slate-700 text-lg leading-none">&times;</button>
              </div>
            )}
          </div>

          {/* Cart area */}
          <div className="flex-1 min-h-0 overflow-y-auto mx-4 mb-2 bg-white rounded-xl shadow-sm border border-slate-300">
            {cart.length > 0 ? (
              <>
                {/* Cart header */}
                <div className="grid gap-2 px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-300 sticky top-0 bg-white"
                  style={{ gridTemplateColumns: '40px minmax(0,1fr) 60px 88px 88px 72px 92px 24px' }}>
                  <span></span>
                  <span>{t('th.product')}</span>
                  <span className="text-right">{t('th.qty')}</span>
                  <span className="text-right">{t('th.sell_price')}</span>
                  <span className="text-right">{t('lbl.our_price')}</span>
                  <span className="text-right">{t('lbl.discount')}</span>
                  <span className="text-right">{t('th.total')}</span>
                  <span></span>
                </div>
                <div className="py-1 space-y-0.5">
                  {cart.map((item, i) => (
                    <CartRow key={itemKey(item)} item={item}
                      highlight={!!highlights[itemKey(item)]}
                      isSinhala={isSinhala}
                      onChange={changes => setCart(prev => prev.map((it, j) => j === i ? recalc({ ...it, ...changes }) : it))}
                      onRemove={() => setCart(prev => prev.filter((_, j) => j !== i))}
                      onZoom={() => setZoomed({ item, idx: i })}
                      onEnter={() => searchRef.current?.focus()}
                      onArrow={dir => {
                        const inputs = document.querySelectorAll('.cart-qty-input');
                        const arr = Array.from(inputs);
                        const idx2 = arr.indexOf(document.activeElement);
                        if (idx2 >= 0 && arr[idx2 + dir]) { arr[idx2 + dir].focus(); arr[idx2 + dir].select(); }
                        else if (idx2 + dir < 0) searchRef.current?.focus();
                      }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-16 text-slate-300">
                {Icon.bag}
                <p className="mt-4 text-base font-semibold text-slate-400">{t('pos.cart_empty')}</p>
                <p className="text-sm text-slate-300 mt-1">{t('pos.add_products')}</p>
              </div>
            )}
          </div>

          {/* ⚡ Fast products */}
          {fastProducts.length > 0 && (
            <div className="shrink-0 px-4 pb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-yellow-500">{Icon.lightning}</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('pos.fast_moving')}</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {fastProducts.map(p => (
                  <button key={p.id} onMouseDown={() => addToCart(p)}
                    className="shrink-0 w-24 bg-white rounded-xl border border-slate-300 shadow-sm p-2 text-left hover:border-blue-400 hover:shadow-md transition-all">
                    <div className="w-full aspect-square bg-slate-100 rounded-lg mb-1.5 flex items-center justify-center overflow-hidden">
                      {p.image ? (
                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-200 text-blue-700 text-2xl font-black">
                          {p.name?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-slate-700 truncate leading-tight">{p.name}</p>
                    <p className="text-xs font-bold text-blue-600 mt-0.5">Rs. {fmt(p.our_price ?? p.promo_price ?? p.selling_price)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ═══ RIGHT PANEL (Payment) ═══════════════════════════════════════════ */}
        <div className={`bg-slate-50 border-l border-slate-200 flex-col shrink-0 overflow-y-auto
          w-full lg:w-[40%]
          ${mobileTab === 'cart' ? 'hidden lg:flex' : 'flex'}`}>

          {/* Discount + Grand Total */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-300">
            {/* Discount row */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold text-orange-500 w-20 shrink-0">{t('lbl.discount')}</span>
              <input type="number" min="0" step="0.01" value={billDiscount}
                onChange={e => setBillDisc(e.target.value)} placeholder="0"
                className="w-20 rounded-lg border border-slate-400 px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-orange-400 text-right" />
              <button onClick={() => setDiscType('amount')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${discType === 'amount' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Rs</button>
              {[0, 5, 10, 15, 20].map(pct => (
                <button key={pct} onClick={() => { if (pct === 0) { setBillDisc('0'); setDiscType('percent'); } else { setDiscType('percent'); setBillDisc(String(pct)); } }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${discType === 'percent' && billDiscount === String(pct) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {pct === 0 ? '0' : `${pct}%`}
                </button>
              ))}
            </div>

            {totalDisc > 0 && (
              <div className="flex justify-between text-xs text-red-500 mt-1 px-1">
                <span>Discount applied</span><span>- {fmtAmt(totalDisc)}</span>
              </div>
            )}
          </div>

          {/* Payment method */}
          <div className="px-4 py-3 border-b border-slate-300">
            <Step n="2" label={t('pos.payment_method_label').toUpperCase()} />
            <div className="flex rounded-2xl border-2 border-slate-300 overflow-hidden bg-white">
              {[
                { id: 'cash',   label: t('lbl.cash'),   shortcut: 'F2', icon: Icon.cash,   active: 'bg-green-500 text-white' },
                { id: 'card',   label: t('lbl.card'),   shortcut: 'F3', icon: Icon.card,   active: 'bg-blue-500 text-white' },
                { id: 'credit', label: t('lbl.credit'), shortcut: 'F4', icon: Icon.credit, active: 'bg-orange-500 text-white' },
                { id: 'split',  label: 'Split',          shortcut: null,  icon: Icon.split,  active: 'bg-violet-500 text-white' },
              ].map((m, i, arr) => (
                <button key={m.id} onClick={() => setPayMethod(m.id)}
                  className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 lg:py-4 text-sm font-semibold transition-all
                    ${i < arr.length - 1 ? 'border-r border-slate-300' : ''}
                    ${payMethod === m.id
                      ? `${m.active} shadow-inner`
                      : 'text-slate-500 hover:bg-slate-50'
                    }`}>
                  {m.icon}
                  <span className="flex items-center gap-1">
                    {m.label}
                    {m.shortcut && <span className="text-[10px] opacity-60">[{m.shortcut}]</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Cash paid / customer */}
          <div className="px-4 py-3 border-b border-slate-300">
            <Step n="3" label={payMethod === 'cash' ? t('pos.cash_paid_label').toUpperCase() : payMethod === 'card' ? 'CARD DETAILS' : payMethod === 'credit' ? t('lbl.credit').toUpperCase() : 'SPLIT PAYMENT'} />

            {/* Customer + Cash paid */}
            {payMethod === 'cash' ? (
              <div className="space-y-2 mb-2">
                {/* Customer */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('lbl.customer')}</span>
                    <button onClick={() => setQcForm({ name: '', phone: '' })}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold transition-colors">
                      {Icon.user} {t('cust.quick_add')}
                    </button>
                  </div>
                  <div className="relative">
                    <input value={custQuery}
                      onChange={e => { setCustQuery(e.target.value); setShowCust(true); }}
                      onFocus={() => setShowCust(true)}
                      onBlur={() => setTimeout(() => setShowCust(false), 150)}
                      placeholder={t('lbl.select_customer')}
                      className="w-full rounded-lg border border-slate-400 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
                    {customer && (
                      <button onClick={() => { setCustomer(null); setCustQuery(''); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg">&times;</button>
                    )}
                    {showCustDrop && filteredCusts.length > 0 && (
                      <div className="absolute bottom-full left-0 right-0 z-40 bg-white rounded-xl shadow-xl border border-slate-200 max-h-40 overflow-y-auto mb-1">
                        {filteredCusts.map(c => (
                          <button key={c.id} onMouseDown={() => { setCustomer(c); setCustQuery(c.name); setShowCust(false); setCustErr(''); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-50 last:border-0">
                            <p className="font-semibold">{c.name}</p>
                            {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {custErr && <p className="text-xs text-red-500 mt-1 font-medium">{custErr}</p>}
                </div>

                {/* Grand total + Cash paid inline */}
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <span className="text-sm font-black text-slate-700 uppercase tracking-wide block mb-1">{t('lbl.grand_total')} (Rs.)</span>
                    <div className="flex items-center justify-end bg-black rounded-xl px-3 py-3.5">
                      <span className="text-3xl font-extrabold text-white">{Number(total||0).toLocaleString('en-LK',{minimumFractionDigits:2})}</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">{t('pos.cash_paid_label')}</span>
                    <input ref={cashInputRef} type="number" min="0" step="0.01" value={cashPaid}
                      onChange={e => { setCashPaid(e.target.value); setShakeInput(false); }}
                      onFocus={e => e.target.select()}
                      onKeyDown={e => { if (e.key === 'Enter') handleCompleteSale(false, true); }}
                      placeholder="0.00"
                      className={`w-full rounded-xl border-2 px-3 py-3.5 text-3xl font-bold text-right outline-none transition-colors ${shakeInput ? 'shake border-red-500 bg-red-50' : 'border-green-500 bg-green-50 focus:border-green-600'}`} />
                    {change > 0 && <p className="text-xs font-bold text-green-600 text-right mt-1">{t('lbl.change')}: Rs.{fmt(change)}</p>}
                    {change < 0 && cashNum > 0 && <p className="text-base font-black text-red-500 text-right mt-1">අඩු: Rs.{Number(Math.abs(change)).toLocaleString('en-LK',{minimumFractionDigits:2})}</p>}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Customer (non-cash modes) */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('lbl.customer')}</span>
                  <button onClick={() => setQcForm({ name: '', phone: '' })}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold transition-colors">
                    {Icon.user} {t('cust.quick_add')}
                  </button>
                </div>
                <div className="relative mb-3">
                  <input value={custQuery}
                    onChange={e => { setCustQuery(e.target.value); setShowCust(true); }}
                    onFocus={() => setShowCust(true)}
                    onBlur={() => setTimeout(() => setShowCust(false), 150)}
                    placeholder={t('lbl.select_customer')}
                    className="w-full rounded-lg border border-slate-400 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
                  {customer && (
                    <button onClick={() => { setCustomer(null); setCustQuery(''); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg">&times;</button>
                  )}
                  {showCustDrop && filteredCusts.length > 0 && (
                    <div className="absolute bottom-full left-0 right-0 z-40 bg-white rounded-xl shadow-xl border border-slate-200 max-h-40 overflow-y-auto mb-1">
                      {filteredCusts.map(c => (
                        <button key={c.id} onMouseDown={() => { setCustomer(c); setCustQuery(c.name); setShowCust(false); setCustErr(''); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-50 last:border-0">
                          <p className="font-semibold">{c.name}</p>
                          {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {custErr && <p className="text-xs text-red-500 mt-1 font-medium">{custErr}</p>}
              </>
            )}

            {/* Quick-amount buttons for cash */}
            {payMethod === 'cash' && (
              <>
                <div className="flex gap-1.5 flex-wrap mb-1">
                  {[100, 500, 1000, 2000, 5000].map(v => (
                    <button key={v} onClick={() => setCashPaid(String(v))}
                      className="flex-1 py-1.5 border-2 border-slate-300 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 rounded-lg text-xs font-bold text-slate-600 transition-colors min-w-0">
                      {v}
                    </button>
                  ))}
                </div>
                {total > 0 && (
                  <button onClick={() => setCashPaid(fmt(total))}
                    className="w-full py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs font-semibold text-blue-700 transition-colors">
                    Exact: {fmtAmt(total)}
                  </button>
                )}
              </>
            )}

            {/* Card input */}
            {payMethod === 'card' && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Card Reference No.</label>
                <input autoFocus type="text" value={cardRef} onChange={e => setCardRef(e.target.value)} placeholder="Optional"
                  className="w-full rounded-lg border border-slate-400 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            {/* Credit */}
            {payMethod === 'credit' && (
              <p className="text-sm text-slate-500 bg-orange-50 rounded-xl p-3 text-center">
                Amount will be added to customer's credit balance.
                {!customer && <span className="block mt-1 text-red-500 font-semibold text-xs">⚠ {t('pos.credit_warn_msg')}</span>}
              </p>
            )}

            {/* Split */}
            {payMethod === 'split' && (
              <div className="space-y-2">
                {/* Mode toggle */}
                <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                  {[['card', 'Cash + Card'], ['credit', 'Cash + Credit']].map(([mode, label]) => (
                    <button key={mode} type="button" onClick={() => setSplitMode(mode)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${splitMode === mode ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Cash Amount</label>
                  <input autoFocus type="number" min="0" step="0.01" value={splitCash} onChange={e => setSplitCash(e.target.value)}
                    onFocus={e => e.target.select()}
                    className="w-full rounded-lg border border-slate-400 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                {splitMode === 'card' ? (
                  <>
                    <p className="text-sm text-slate-600">
                      Card: <strong className="text-blue-700">{fmtAmt(Math.max(0, total - (parseFloat(splitCash) || 0)))}</strong>
                    </p>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Card Reference</label>
                      <input type="text" value={splitCardRef} onChange={e => setSplitCardRef(e.target.value)}
                        className="w-full rounded-lg border border-slate-400 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-2">
                    <span className="text-xs font-semibold text-slate-500">Credit Balance</span>
                    <span className="font-bold text-red-600">{fmtAmt(Math.max(0, total - (parseFloat(splitCash) || 0)))}</span>
                  </div>
                )}
              </div>
            )}
          </div>


          {/* Complete Sale */}
          <div className="px-4 py-4 mt-auto sticky bottom-0 bg-white border-t border-slate-300 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
            <div className="flex gap-2 mb-2">
              {/* Main button */}
              <button
                disabled={cart.length === 0 || submitting}
                onClick={() => handleCompleteSale(false, true)}
                className="flex-1 flex items-center justify-center gap-2 py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-xl font-bold text-sm transition-colors shadow-lg ring-1 ring-blue-300/60"
              >
                {Icon.print}
                <span>{t('pos.complete_sale')}</span>
                <span className="hidden lg:inline ml-1 bg-white/20 text-white text-xs px-1.5 py-0.5 rounded font-bold">F10</span>
              </button>

              {/* Save only */}
              <button
                disabled={cart.length === 0 || submitting}
                onClick={() => handleCompleteSale(true)}
                className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 border-2 border-slate-300 hover:border-slate-400 disabled:opacity-40 text-slate-600 rounded-xl text-xs font-semibold transition-colors shadow-md"
              >
                {Icon.save}
                <span>{t('btn.save')}</span>
                <span className="hidden lg:block text-slate-400 font-normal">F11</span>
              </button>
            </div>

            {/* Hold Bill */}
            <button
              disabled={cart.length === 0}
              onClick={() => setHoldModal(true)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-amber-400 hover:bg-amber-500 disabled:bg-amber-100 disabled:text-amber-400 disabled:cursor-not-allowed text-amber-900 rounded-xl font-bold text-sm transition-colors shadow-lg ring-1 ring-amber-300/60"
            >
              {Icon.pause} {t('pos.hold_btn')}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ MODALS ══════════════════════════════════════════════════════════ */}

      {sizePicker && (
        <SizePickerModal product={sizePicker.product} onSelect={onSizeSelect}
          onClose={() => { setSizePicker(null); refocus(); }} />
      )}

      {receipt && (
        <Receipt
          sale={receipt}
          settings={settings}
          user={user}
          onClose={newSale}
        />
      )}

      {/* ── Return modal ── */}
      {showReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-800">Process Return</h2>
                <p className="text-xs text-slate-400 mt-0.5">Enter invoice number to load items</p>
              </div>
              <button onClick={() => setShowReturn(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-4 overflow-y-auto flex-1">
              {/* Invoice lookup */}
              {!returnDone && (
                <div className="flex gap-2 mb-4">
                  <input value={returnInvoiceNo} onChange={e => setReturnInvoiceNo(e.target.value)}
                    placeholder="Invoice No (e.g. INV-00123)"
                    onKeyDown={e => e.key === 'Enter' && loadReturnSale()}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400" />
                  <button onClick={loadReturnSale}
                    disabled={!returnInvoiceNo.trim()}
                    className="px-4 py-2 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-40 transition-colors">
                    Load
                  </button>
                </div>
              )}

              {returnLoading && !returnSaleData && <p className="text-sm text-slate-400 text-center py-6">Loading…</p>}
              {returnErr && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{returnErr}</p>}

              {returnDone && (
                <div className="text-center py-8">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                  </div>
                  <p className="font-bold text-slate-800 text-lg">Return Processed</p>
                  <p className="text-xs text-slate-400 mt-1">Ref: {returnDone.return_no}</p>
                  <p className="text-sm text-green-600 font-semibold mt-1">Stock has been restored</p>
                  <button onClick={() => setShowReturn(false)} className="mt-4 px-6 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-slate-700">Close</button>
                </div>
              )}

              {returnSaleData && !returnDone && (
                <>
                  <div className="bg-slate-50 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400">Invoice</p>
                      <p className="font-bold text-slate-800 text-sm">{returnSaleData.invoice_no}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Total</p>
                      <p className="font-bold text-slate-800">Rs. {fmt(returnSaleData.total)}</p>
                    </div>
                  </div>

                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select items & qty to return</p>
                  <div className="space-y-2 mb-4">
                    {(returnSaleData.items || []).map(item => (
                      <div key={item.id} className="flex items-center gap-3 py-2 border-b border-slate-100">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{item.product_name}</p>
                          <p className="text-xs text-slate-400">{parseFloat(item.qty)} × Rs. {fmt(item.unit_price)}</p>
                        </div>
                        <input type="number" min="0" max={parseFloat(item.qty)} step="1"
                          value={returnItemQtys[item.id] ?? ''}
                          onChange={e => setReturnItemQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="0"
                          className="w-20 text-right rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-red-400" />
                      </div>
                    ))}
                  </div>

                  {/* Return summary */}
                  {(() => {
                    const returnItems = (returnSaleData.items || []).filter(i => parseFloat(returnItemQtys[i.id]) > 0);
                    const returnTotal = returnItems.reduce((s, i) => s + parseFloat(returnItemQtys[i.id]) * parseFloat(i.unit_price), 0);
                    return returnItems.length > 0 ? (
                      <div className="bg-red-50 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
                        <span className="text-sm font-semibold text-red-700">{returnItems.length} item(s) to return</span>
                        <span className="font-bold text-red-700">Rs. {fmt(returnTotal)}</span>
                      </div>
                    ) : null;
                  })()}

                  <button
                    disabled={returnLoading || !(returnSaleData.items || []).some(i => parseFloat(returnItemQtys[i.id]) > 0)}
                    onClick={async () => {
                      const items = (returnSaleData.items || [])
                        .filter(i => parseFloat(returnItemQtys[i.id]) > 0)
                        .map(i => ({ product_id: i.product_id, product_name: i.product_name, qty: parseFloat(returnItemQtys[i.id]), unit_price: parseFloat(i.unit_price) }));
                      setReturnLoading(true); setReturnErr('');
                      try {
                        const res = await doReturn({ id: returnSaleData.id, items, total: items.reduce((s, i) => s + i.qty * i.unit_price, 0) }).unwrap();
                        setReturnDone(res);
                      } catch (e) { setReturnErr(e?.data?.error || 'Return failed'); }
                      finally { setReturnLoading(false); }
                    }}
                    className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-colors">
                    {returnLoading ? 'Processing…' : 'Confirm Return & Restore Stock'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hold modal */}
      {showHoldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="font-bold text-slate-800">{t('pos.hold_title')}</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t('pos.hold_note_label')}</label>
              <input autoFocus value={holdNote} onChange={e => setHoldNote(e.target.value)} placeholder={t('pos.hold_placeholder')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setHoldModal(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">{t('btn.cancel')}</button>
              <button onClick={confirmHold} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600">{t('btn.hold')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Held bills */}
      {showHeld && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800">{t('pos.held_bills')} ({heldBills.length})</h2>
              <button onClick={() => setShowHeld(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            {heldBills.length === 0 && <p className="text-slate-400 text-sm text-center py-4">{t('pos.no_held')}</p>}
            {heldBills.map((b, i) => (
              <div key={b.id} className="border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{b.note || `Bill ${i + 1}`}</p>
                  <p className="text-xs text-slate-400">{b.cart?.length} items · {new Date(b.createdAt).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => resumeHeld(i)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">{t('btn.view')}</button>
                  <button onClick={() => { const u = heldBills.filter((_, j) => j !== i); localStorage.setItem('pos_held', JSON.stringify(u)); setHeld(u); }}
                    className="px-3 py-1.5 border border-red-300 text-red-500 rounded-lg text-xs hover:bg-red-50">{t('btn.delete')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cart item zoom */}
      {zoomedItem && (
        <CartItemZoomModal
          item={zoomedItem.item}
          onChange={changes => setCart(prev => prev.map((it, j) => j === zoomedItem.idx ? recalc({ ...it, ...changes }) : it))}
          onRemove={() => setCart(prev => prev.filter((_, j) => j !== zoomedItem.idx))}
          onClose={() => setZoomed(null)}
        />
      )}

      {/* Quick add customer */}
      {qcForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-3">
            <h2 className="font-bold text-slate-800">{t('cust.quick_add')}</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t('cust.name')} *</label>
              <input autoFocus value={qcForm.name} onChange={e => setQcForm(f => ({ ...f, name: e.target.value }))} required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t('cust.phone')}</label>
              <input value={qcForm.phone} onChange={e => setQcForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setQcForm(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">{t('btn.cancel')}</button>
              <button onClick={saveQuickCustomer} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">{t('btn.add')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
