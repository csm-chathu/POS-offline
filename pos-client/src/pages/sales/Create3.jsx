/**
 * Interface 3 — Aronium-style POS  (light / dark)
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout, selectCurrentUser } from '../../features/auth/authSlice';
import { useCreateSaleMutation } from '../../features/sales/salesApi';
import useProductCache from '../../hooks/useProductCache';
import { useConnectivity } from '../../contexts/ConnectivityContext';
import { useTheme } from '../../contexts/ThemeContext';
import { enqueueOfflineSale } from '../../services/offlineQueue';
import { api } from '../../app/baseApi';

const posApi = api.injectEndpoints({
  endpoints: b => ({
    getPOS3Settings: b.query({ query: () => '/settings' }),
    getRecentSales:  b.query({ query: date => `/sales?per_page=200&page=1&date=${date}`, providesTags: ['Sales'] }),
  }),
  overrideExisting: false,
});

const fmt      = n => Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
const getPrice = p => p.our_price ?? p.promo_price ?? p.selling_price ?? 0;
function recalc(i) { return { ...i, total: Math.max(0, i.qty * i.unit_price - (i.discount || 0)) }; }

// ── Theme tokens ──────────────────────────────────────────────────────────────
const DARK = {
  root:        'bg-[#1c1c1c] text-white',
  topBar:      'bg-[#141414] border-[#2a2a2a]',
  topIcon:     'text-slate-400 hover:text-white hover:bg-[#2a2a2a]',
  search:      'bg-[#252525] border-[#333] text-white placeholder-slate-500 focus:border-[#555]',
  sugBox:      'bg-[#252525] border-[#333]',
  sugItem:     'hover:bg-[#2a2a2a]',
  sugHi:       'bg-[#1E40AF]',
  tblHdr:      'text-slate-200 bg-[#1c1c1c] border-[#2a2a2a]',
  emptyIcon:   'text-[#2a2a2a]',
  emptyTxt:    'text-slate-600',
  row:         'hover:bg-[#252525] border-[#2a2a2a]',
  rowSel:      'bg-[#1E40AF]/20 border-[#1E40AF]/40',
  rowTxt:      'text-slate-200',
  rowTxtSel:   'text-blue-300',
  qtyBtn:      'bg-[#333] hover:bg-[#444] text-slate-300',
  qtyInput:    'text-white bg-[#1c1c1c] border-[#333]',
  cellInput:   'text-orange-300 border-transparent hover:border-[#333] focus:border-blue-500',
  discInput:   'text-slate-400 border-transparent hover:border-[#333] focus:border-blue-500 placeholder-slate-600',
  pendRow:     'border-blue-800/40 bg-blue-900/10',
  pendInput:   'text-white bg-blue-900/30 border-blue-600',
  footer:      'bg-[#141414] border-[#2a2a2a] text-slate-400',
  footerTotal: 'text-white',
  right:       'bg-[#1a1a1a] border-[#2a2a2a]',
  actBtn:      'bg-[#1a1a1a] hover:bg-[#252525] text-slate-300 hover:text-white',
  actKey:      'text-slate-600',
  actLbl:      'text-slate-400',
  payBar:      'bg-[#141414] border-[#2a2a2a]',
  payKey:      'text-slate-600',
  payOff:      'text-slate-500 hover:text-slate-200',
  payOn:       'text-white',
  inpBox:      'bg-[#141414] border-[#2a2a2a] text-slate-400',
  inpVal:      'text-white',
  inpDisc:     'text-orange-400',
  totBox:      'bg-[#141414] border-[#2a2a2a]',
  totLbl:      'text-slate-400',
  totVal:      'text-white',
  savBtn:      'bg-[#1a1a1a] hover:bg-[#252525] text-slate-300 hover:text-white',
  savKey:      'text-slate-600',
  savLbl:      'text-slate-400',
  backBtn:     'bg-[#1a1a1a] hover:bg-[#252525] text-slate-400 hover:text-white',
  backLbl:     'text-slate-500',
  retBtn:      'bg-[#1a1a1a] hover:bg-[#252525] text-slate-400 hover:text-white',
  retLbl:      'text-slate-500',
  voidBtn:     'bg-red-900/40 hover:bg-red-800/60 text-red-400 hover:text-red-300',
  divider:     'bg-[#2a2a2a]',
};

const LIGHT = {
  root:        'bg-[#F3F4F6] text-slate-800',
  topBar:      'bg-white border-slate-300',
  topIcon:     'text-slate-500 hover:text-slate-800 hover:bg-slate-100',
  search:      'bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:border-blue-500',
  sugBox:      'bg-white border-slate-300 shadow-xl',
  sugItem:     'hover:bg-slate-50',
  sugHi:       'bg-blue-600',
  tblHdr:      'text-slate-500 bg-slate-50 border-slate-300',
  emptyIcon:   'text-slate-200',
  emptyTxt:    'text-slate-300',
  row:         'hover:bg-slate-50 border-slate-300',
  rowSel:      'bg-blue-50 border-blue-400',
  rowTxt:      'text-slate-700',
  rowTxtSel:   'text-blue-700',
  qtyBtn:      'bg-slate-200 hover:bg-slate-300 text-slate-600',
  qtyInput:    'text-slate-800 bg-white border-slate-300',
  cellInput:   'text-orange-600 border-transparent hover:border-slate-300 focus:border-blue-500',
  discInput:   'text-slate-500 border-transparent hover:border-slate-300 focus:border-blue-500 placeholder-slate-300',
  pendRow:     'border-blue-300 bg-blue-50',
  pendInput:   'text-slate-800 bg-blue-100 border-blue-400',
  footer:      'bg-white border-slate-300 text-slate-500',
  footerTotal: 'text-slate-800',
  right:       'bg-white border-slate-300',
  actBtn:      'bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border-b border-slate-200',
  actKey:      'text-slate-400',
  actLbl:      'text-slate-500',
  payBar:      'bg-slate-50 border-slate-300',
  payKey:      'text-slate-400',
  payOff:      'text-slate-500 hover:text-slate-800',
  payOn:       'text-slate-800',
  inpBox:      'bg-white border-slate-300 text-slate-500',
  inpVal:      'text-slate-800',
  inpDisc:     'text-orange-500',
  totBox:      'bg-slate-50 border-slate-300',
  totLbl:      'text-slate-500',
  totVal:      'text-slate-800',
  savBtn:      'bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900',
  savKey:      'text-slate-400',
  savLbl:      'text-slate-500',
  backBtn:     'bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900',
  backLbl:     'text-slate-500',
  retBtn:      'bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900',
  retLbl:      'text-slate-500',
  voidBtn:     'bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-600',
  divider:     'bg-slate-300',
};

export default function SalesCreate3() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user     = useSelector(selectCurrentUser);
  const { isOnline } = useConnectivity();

  const { data: settingsRaw } = posApi.endpoints.getPOS3Settings.useQuery();
  const settings = useMemo(() => {
    if (!settingsRaw) return {};
    if (Array.isArray(settingsRaw)) return Object.fromEntries(settingsRaw.map(s => [s.key, s.value]));
    return settingsRaw;
  }, [settingsRaw]);

  const { products: allProducts = [] } = useProductCache();
  const [createSale, { isLoading: submitting }] = useCreateSaleMutation();

  // Theme — shared with the rest of the app via ThemeContext
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  const T = isDark ? DARK : LIGHT;
  function toggleTheme() { setTheme(isDark ? 'light' : 'dark'); }

  const [rows, setRows]             = useState([]);
  const [curSearch, setCurSearch]   = useState('');
  const [curProduct, setCurProduct] = useState(null);
  const [curQty, setCurQty]         = useState('1');
  const [curPrice, setCurPrice]     = useState('');
  const [curLineDsc, setCurLineDsc] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug]       = useState(false);
  const [sugIdx, setSugIdx]         = useState(0);
  const [discount, setDiscount]     = useState('');
  const [payMethod, setPayMethod]   = useState('cash');
  const [tendered, setTendered]     = useState('');
  const [receipt, setReceipt]       = useState(null);
  const [error, setError]           = useState('');
  const [selectedRow, setSelectedRow] = useState(null);
  const [showSalesDrawer, setShowSalesDrawer] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);
  const [productModalSearch, setProductModalSearch] = useState('');
  const productModalRef = useRef();

  const todayDate = new Date().toISOString().slice(0, 10);
  const { data: recentSalesData } = posApi.endpoints.getRecentSales.useQuery(todayDate, { skip: !showSalesDrawer });

  const searchRef = useRef();
  const holdTimer = useRef(null);
  const holdFired = useRef(false);

  const subtotal    = useMemo(() => rows.reduce((s, r) => s + r.total, 0), [rows]);
  const discountAmt = Math.min(parseFloat(discount) || 0, subtotal);
  const grandTotal  = Math.max(0, subtotal - discountAmt);
  const change      = Math.max(0, (parseFloat(tendered) || 0) - grandTotal);

  useEffect(() => {
    const h = e => {
      if (e.key === 'F3')  { e.preventDefault(); setShowProductModal(true); setProductModalSearch(''); setTimeout(() => productModalRef.current?.focus(), 50); }
      if (e.key === 'F8')  { e.preventDefault(); newSale(); }
      if (e.key === 'F10') { e.preventDefault(); completeSale(); }
      if (e.key === 'F12') { e.preventDefault(); setPayMethod(m => m === 'cash' ? 'card' : m === 'card' ? 'qr' : 'cash'); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [rows, grandTotal, payMethod, tendered]);

  const startHold = () => { holdFired.current = false; holdTimer.current = setTimeout(() => { holdFired.current = true; confirmQty(); }, 600); };
  const cancelHold = () => clearTimeout(holdTimer.current);

  const handleSearchChange = e => {
    const val = e.target.value;
    setCurSearch(val); setCurProduct(null); setCurQty('1'); setCurPrice(''); setCurLineDsc('');
    if (val.trim().length < 1) { setSuggestions([]); setShowSug(false); return; }
    const q = val.toLowerCase();
    const matches = allProducts.filter(p => p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.startsWith(val))).slice(0, 8);
    setSuggestions(matches); setShowSug(matches.length > 0); setSugIdx(0);
  };

  const confirmProduct = useCallback(product => {
    setCurProduct(product); setCurSearch(product.name);
    setSuggestions([]); setShowSug(false);
    setCurQty('1'); setCurPrice(String(getPrice(product))); setCurLineDsc('');
    setTimeout(() => document.getElementById('qty-input')?.focus(), 0);
  }, []);

  const handleSearchKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSugIdx(i => Math.min(i + 1, suggestions.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSugIdx(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Escape')    { setShowSug(false); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!curSearch.trim()) return;
    if (showSug && suggestions.length > 0) { confirmProduct(suggestions[sugIdx]); return; }
    const exact = allProducts.find(p => p.barcode === curSearch.trim());
    const first = allProducts.find(p => p.name.toLowerCase().includes(curSearch.trim().toLowerCase()));
    if (exact || first) confirmProduct(exact || first);
  };

  const confirmQty = () => {
    if (!curProduct) return;
    const qty = Math.max(0.001, parseFloat(curQty) || 1);
    const unitPrice = parseFloat(curPrice) || getPrice(curProduct);
    const lineDsc   = parseFloat(curLineDsc) || 0;
    setRows(prev => {
      const idx = prev.findIndex(r => r.product_id === curProduct.id);
      if (idx >= 0) { const u = [...prev]; u[idx] = recalc({ ...u[idx], qty: u[idx].qty + qty, unit_price: unitPrice, discount: lineDsc }); return u; }
      return [...prev, recalc({ product_id: curProduct.id, product_name: curProduct.name, unit_price: unitPrice, qty, discount: lineDsc })];
    });
    setCurSearch(''); setCurProduct(null); setCurQty('1'); setCurPrice(''); setCurLineDsc('');
    setSuggestions([]); setShowSug(false);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const removeRow = idx => { setRows(prev => prev.filter((_, i) => i !== idx)); setSelectedRow(null); };
  const deleteSelected = () => { if (selectedRow !== null) removeRow(selectedRow); };
  const changeQty = (idx, delta) => setRows(prev => prev.map((r, i) => { if (i !== idx) return r; const qty = Math.max(0, r.qty + delta); return qty === 0 ? null : recalc({ ...r, qty }); }).filter(Boolean));
  const updateRow = (idx, field, value) => setRows(prev => prev.map((r, i) => i !== idx ? r : recalc({ ...r, [field]: parseFloat(value) || 0 })));

  function newSale() {
    if (rows.length > 0 && !window.confirm('Clear current sale?')) return;
    setRows([]); setDiscount(''); setTendered('');
    setCurSearch(''); setCurProduct(null); setCurQty('1');
    setSelectedRow(null); setError('');
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  async function completeSale() {
    if (rows.length === 0) { setError('No items added'); return; }
    if (payMethod === 'cash' && tendered && parseFloat(tendered) < grandTotal) { setError('Tendered less than total'); return; }
    setError('');
    const saleData = {
      items: rows.map(r => ({ product_id: r.product_id, variant_id: r.variant_id || null, qty: r.qty, unit_price: r.unit_price, discount: r.discount || 0, total: r.total, product_name: r.product_name })),
      subtotal, discount: discountAmt, total: grandTotal,
      payment_method: payMethod,
      tendered: payMethod === 'cash' ? (parseFloat(tendered) || grandTotal) : grandTotal,
      change:   payMethod === 'cash' ? change : 0,
      status: 'completed',
    };
    try {
      let res;
      if (isOnline) res = await createSale(saleData).unwrap();
      else { enqueueOfflineSale(saleData); res = { ...saleData, invoice_number: `OFF-${Date.now()}`, created_at: new Date().toISOString() }; }
      setReceipt(res);
      setRows([]); setDiscount(''); setTendered('');
      setCurSearch(''); setCurProduct(null); setCurQty('1'); setSelectedRow(null);
      setTimeout(() => searchRef.current?.focus(), 0);
    } catch (e) { setError(e?.data?.error || 'Sale failed'); }
  }

  const PAY_METHODS = [
    { val: 'cash',  label: 'Cash',  line: 'border-green-500', lineDim: 'border-green-700'  },
    { val: 'card',  label: 'Card',  line: 'border-blue-400',  lineDim: 'border-blue-800'   },
    { val: 'check', label: 'Check', line: 'border-amber-400', lineDim: 'border-amber-800'  },
  ];

  const cols = '1fr 90px 110px 90px 90px 28px';

  return (
    <div className={`fixed inset-0 flex flex-col overflow-hidden select-none ${T.root}`}>

      {/* ── Top bar ── */}
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b shrink-0 ${T.topBar}`}>
        <button onClick={() => navigate('/dashboard')} className={`p-2 rounded transition-colors ${T.topIcon}`} title="Dashboard">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </button>
        <button onClick={() => { setShowProductModal(true); setProductModalSearch(''); setTimeout(() => productModalRef.current?.focus(), 50); }}
          className={`p-2 rounded transition-colors ${T.topIcon}`} title="Product list">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h1v12H4zm3 0h1v12H7zm3 0h2v12h-2zm4 0h1v12h-1zm3 0h2v12h-2z"/></svg>
        </button>
        <button className={`p-2 rounded transition-colors ${T.topIcon}`} title="Invoice #">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"/></svg>
        </button>
        <button className={`p-2 rounded transition-colors ${T.topIcon}`} title="Tag">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A2 2 0 013 10V5a2 2 0 012-2z"/></svg>
        </button>

        {/* Search */}
        <div className="relative flex-1 mx-2">
          <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-[#555]' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
          </svg>
          <input ref={searchRef} value={curSearch} onChange={handleSearchChange} onKeyDown={handleSearchKey}
            onBlur={() => setTimeout(() => setShowSug(false), 150)}
            onFocus={() => suggestions.length > 0 && setShowSug(true)}
            placeholder="Search products by name, code or barcode" autoFocus
            className={`w-full border rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none transition-colors ${T.search}`} />
          {showSug && (
            <div className={`absolute top-full left-0 right-0 mt-1 border rounded overflow-hidden z-50 max-h-64 overflow-y-auto ${T.sugBox}`}>
              {suggestions.map((p, i) => (
                <div key={p.id} onMouseDown={() => confirmProduct(p)}
                  className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${i === sugIdx ? T.sugHi + ' text-white' : T.sugItem}`}>
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    {p.barcode && <p className={`text-[10px] ${isDark ? 'text-[#666]' : 'text-slate-400'}`}>{p.barcode}</p>}
                  </div>
                  <span className="text-sm font-bold text-green-500 ml-4 shrink-0">Rs. {fmt(getPrice(p))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* View Sales */}
        <button onClick={() => setShowSalesDrawer(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors shrink-0 ${isDark ? 'bg-[#252525] hover:bg-[#2a2a2a] text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
          Sales
        </button>

        {/* Theme toggle */}
        <button onClick={toggleTheme} className={`p-1.5 rounded transition-colors ${T.topIcon}`} title={isDark ? 'Switch to light' : 'Switch to dark'}>
          {isDark
            ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" strokeWidth={2}/><path strokeLinecap="round" strokeWidth={2} d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          }
        </button>

        <span className={`text-sm hidden sm:block font-medium ${isDark ? 'text-white' : 'text-slate-700'}`}>{settings.shop_name || 'POS'}</span>
        <span className={`text-sm hidden sm:block ${isDark ? 'text-slate-500' : 'text-slate-300'}`}>·</span>
        <span className={`text-sm hidden sm:block font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{user?.name}</span>
        <button onClick={() => { dispatch(logout()); dispatch(api.util.resetApiState()); }}
          className={`p-1.5 rounded ml-1 transition-colors ${isDark ? 'text-[#555] hover:text-red-400 hover:bg-red-900/20' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`} title="Logout">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── LEFT ── */}
        <div className="flex flex-col flex-1 min-w-0">

          {/* Table header */}
          <div className={`grid px-5 py-3 border-b text-sm font-bold uppercase tracking-widest shrink-0 ${T.tblHdr}`}
            style={{ gridTemplateColumns: cols, columnGap: '14px' }}>
            <span>Product Name</span>
            <span className="text-center">Quantity</span>
            <span className="text-right">Price</span>
            <span className="text-right">Discount</span>
            <span className="text-right">Amount</span>
            <span/>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {rows.length === 0 && (
              <div className={`flex flex-col items-center justify-center h-full ${T.emptyTxt}`}>
                <svg className={`w-16 h-16 mb-3 ${T.emptyIcon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
                <p className="text-sm">Scan or search a product to begin</p>
              </div>
            )}

            {rows.map((row, idx) => (
              <div key={idx} onClick={() => setSelectedRow(idx === selectedRow ? null : idx)}
                className={`grid px-5 py-3.5 cursor-pointer transition-colors border-b items-center ${selectedRow === idx ? T.rowSel : T.row}`}
                style={{ gridTemplateColumns: cols, columnGap: '14px' }}>
                <div className="min-w-0">
                  <p className={`text-base font-semibold truncate ${selectedRow === idx ? T.rowTxtSel : T.rowTxt}`}>{row.product_name}</p>
                </div>
                <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => changeQty(idx, -1)} className={`w-7 h-7 rounded text-sm font-bold flex items-center justify-center ${T.qtyBtn}`}>−</button>
                  <input type="number" min="0.001" step="1" key={`qty-${idx}-${row.qty}`} defaultValue={row.qty}
                    onFocus={e => e.target.select()}
                    onBlur={e => { const qty = parseFloat(e.target.value); if (!qty || qty <= 0) { e.target.value = String(row.qty); return; } setRows(prev => prev.map((r, i) => i === idx ? recalc({ ...r, qty }) : r)); }}
                    onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                    className={`w-14 text-center text-base font-bold border rounded focus:border-blue-500 outline-none py-1 ${T.qtyInput}`} />
                  <button onClick={() => changeQty(idx, +1)} className={`w-7 h-7 rounded text-sm font-bold flex items-center justify-center ${T.qtyBtn}`}>+</button>
                </div>
                <div onClick={e => e.stopPropagation()}>
                  <input type="number" min="0" step="0.01" value={row.unit_price}
                    onChange={e => updateRow(idx, 'unit_price', e.target.value)}
                    onFocus={e => e.target.select()}
                    className={`w-full text-right text-sm bg-transparent border rounded px-1.5 py-0.5 outline-none ${T.cellInput}`} />
                </div>
                <div onClick={e => e.stopPropagation()}>
                  <input type="number" min="0" step="0.01" value={row.discount || ''} placeholder="0"
                    onChange={e => updateRow(idx, 'discount', e.target.value)}
                    onFocus={e => e.target.select()}
                    className={`w-full text-right text-sm bg-transparent border rounded px-1.5 py-0.5 outline-none ${T.discInput}`} />
                </div>
                <p className={`text-right text-base font-bold ${selectedRow === idx ? T.rowTxtSel : T.rowTxt}`}>{fmt(row.total)}</p>
                <button onClick={e => { e.stopPropagation(); removeRow(idx); }}
                  className={`flex items-center justify-center transition-colors ${isDark ? 'text-slate-600 hover:text-red-400' : 'text-slate-300 hover:text-red-400'}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            ))}

            {/* Pending item row */}
            {curProduct && (
              <div className={`grid px-4 py-2 items-center border-b border-dashed ${T.pendRow}`}
                style={{ gridTemplateColumns: cols, columnGap: '14px' }}>
                <p className="text-sm text-blue-500 font-medium truncate">{curProduct.name}</p>
                <div className="flex justify-center">
                  <input id="qty-input" value={curQty} onChange={e => setCurQty(e.target.value)}
                    onFocus={e => e.target.select()}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) startHold(); } }}
                    onKeyUp={e => { if (e.key === 'Enter') { cancelHold(); if (!holdFired.current) document.getElementById('price-input')?.focus(); } }}
                    className={`w-14 text-center text-sm font-bold border rounded outline-none py-0.5 ${T.pendInput}`} />
                </div>
                <input id="price-input" type="number" min="0" step="0.01" value={curPrice}
                  onChange={e => setCurPrice(e.target.value)} onFocus={e => e.target.select()}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) startHold(); } }}
                  onKeyUp={e => { if (e.key === 'Enter') { cancelHold(); if (!holdFired.current) document.getElementById('disc-input')?.focus(); } }}
                  className={`w-full text-right text-sm bg-transparent border-transparent focus:border-blue-400 border rounded px-1.5 py-0.5 outline-none ${T.cellInput}`} />
                <input id="disc-input" type="number" min="0" step="0.01" value={curLineDsc}
                  onChange={e => setCurLineDsc(e.target.value)} onFocus={e => e.target.select()}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) startHold(); } }}
                  onKeyUp={e => { if (e.key === 'Enter') { cancelHold(); if (!holdFired.current) confirmQty(); } }}
                  placeholder="0"
                  className={`w-full text-right text-sm bg-transparent border-transparent focus:border-blue-400 border rounded px-1.5 py-0.5 outline-none ${T.discInput}`} />
                <span className="text-right text-sm text-blue-500 font-bold">
                  {fmt(Math.max(0, (parseFloat(curQty)||1) * (parseFloat(curPrice)||0) - (parseFloat(curLineDsc)||0)))}
                </span>
                <button onClick={confirmQty} className="text-blue-500 hover:text-blue-400 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                </button>
              </div>
            )}
          </div>

          {/* Summary footer */}
          <div className={`border-t px-6 py-4 shrink-0 space-y-1.5 ${T.footer}`}>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Subtotal</span><span>Rs. {fmt(subtotal)}</span>
            </div>
            {discountAmt > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span>Discount</span><span className="text-orange-500">− Rs. {fmt(discountAmt)}</span>
              </div>
            )}
            <div className={`flex items-center justify-between font-bold ${T.footerTotal}`}>
              <span className="text-base">Total</span>
              <span className="text-2xl tracking-tight">Rs. {fmt(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div className={`w-[480px] flex flex-col border-l shrink-0 ${T.right}`}>

          {/* Action buttons */}
          <div className={`grid grid-cols-4 shrink-0 border-b ${isDark ? 'border-[#383838] divide-x divide-[#383838]' : 'border-slate-300 divide-x divide-slate-300'}`}>
            {[
              { label: 'Delete',   key: null, danger: true, action: deleteSelected,
                icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg> },
              { label: 'Search',   key: 'F3',  action: () => { setShowProductModal(true); setProductModalSearch(''); setTimeout(() => productModalRef.current?.focus(), 50); },
                icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg> },
              { label: 'Quantity', key: 'F4',  action: () => document.getElementById('qty-input')?.focus(),
                icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg> },
              { label: 'New sale', key: 'F8',  action: newSale,
                icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg> },
            ].map(({ label, key, action, icon, danger }) => (
              <button key={label} onClick={action}
                className={`flex flex-col items-center justify-center gap-2 py-5 transition-colors ${danger ? (isDark ? 'bg-[#1a1a1a] hover:bg-[#252525] text-red-400 hover:text-red-300' : 'bg-white hover:bg-red-50 text-red-400 hover:text-red-500') : T.actBtn}`}>
                {key && <span className={`text-xs font-bold leading-none ${T.actKey}`}>{key}</span>}
                <span className="[&>svg]:w-7 [&>svg]:h-7">{icon}</span>
                <span className={`text-sm font-medium ${T.actLbl}`}>{label}</span>
              </button>
            ))}
          </div>

          {/* Payment tabs */}
          <div className={`flex shrink-0 border-b ${isDark ? 'border-[#383838] divide-x divide-[#383838]' : 'border-slate-300 divide-x divide-slate-300'}`}>

            {PAY_METHODS.map(m => (
              <button key={m.val} onClick={() => setPayMethod(m.val)}
                className={`flex-1 py-4 text-base font-semibold transition-colors border-b-[3px] ${payMethod === m.val
                  ? `${T.payOn} ${m.line} ${isDark ? 'bg-[#252525]' : 'bg-slate-100'}`
                  : `${T.payOff} ${isDark ? m.lineDim : 'border-slate-200'}`}`}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Info area */}
          <div className="flex-1 flex flex-col px-5 py-5 space-y-3 overflow-y-auto">

            <div className="flex gap-3">
              <div className={`flex-1 flex flex-col gap-1 rounded-xl px-4 py-3 ${isDark ? 'bg-blue-950/60 border border-blue-900/60' : 'bg-blue-50 border border-blue-200'}`}>
                <span className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-blue-400/70' : 'text-blue-400'}`}>Discount</span>
                <input type="number" min="0" step="0.01" value={discount}
                  onChange={e => setDiscount(e.target.value)} onFocus={e => e.target.select()} placeholder="0"
                  style={{ backgroundColor: 'transparent', borderColor: 'transparent' }}
                  className={`w-full bg-transparent text-2xl font-bold outline-none appearance-none ${isDark ? 'text-orange-400 placeholder-blue-900' : 'text-orange-500 placeholder-blue-200'}`} />
              </div>

              {payMethod === 'cash' && (
                <div className={`flex-1 flex flex-col gap-1 rounded-xl px-4 py-3 ${isDark ? 'bg-blue-950/60 border border-blue-900/60' : 'bg-blue-50 border border-blue-200'}`}>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-blue-400/70' : 'text-blue-400'}`}>Tendered</span>
                  <input type="number" min="0" step="0.01" value={tendered}
                    onChange={e => setTendered(e.target.value)} onFocus={e => e.target.select()}
                    placeholder={fmt(grandTotal)}
                    style={{ backgroundColor: 'transparent', borderColor: 'transparent' }}
                    className={`w-full bg-transparent text-2xl font-bold outline-none appearance-none ${isDark ? 'text-white placeholder-blue-900' : 'text-slate-800 placeholder-blue-200'}`} />
                </div>
              )}
            </div>

            {payMethod === 'cash' && tendered && (
              <div className="flex items-center justify-between px-1">
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Change</span>
                <span className={`text-xl font-bold ${change >= 0 ? 'text-yellow-500' : 'text-red-400'}`}>Rs. {fmt(change)}</span>
              </div>
            )}

            <div className={`border-2 rounded-lg px-4 py-4 mt-auto ${T.totBox}`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs ${T.totLbl}`}>{rows.length} item{rows.length !== 1 ? 's' : ''}</span>
                <div className="text-right">
                  <p className={`text-xs ${T.totLbl}`}>Total</p>
                  <p className={`text-2xl font-extrabold tracking-tight ${T.totVal}`}>Rs. {fmt(grandTotal)}</p>
                </div>
              </div>
            </div>

            {error && <p className="text-xs text-red-400 text-center">{error}</p>}
          </div>

          {/* Bottom buttons */}
          <div className={`shrink-0 border-t ${isDark ? 'border-[#383838]' : 'border-slate-300'}`}>
            <div className={`grid grid-cols-2 divide-x ${isDark ? 'divide-[#383838]' : 'divide-slate-300'}`}>
              <button className={`flex flex-col items-center justify-center py-6 transition-colors ${T.savBtn}`}>
                <span className={`text-xs font-bold leading-none ${T.savKey}`}>F9</span>
                <svg className="w-8 h-8 mt-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1-4l-3 3m0 0l-3-3m3 3V4"/></svg>
                <span className={`text-sm font-semibold mt-1.5 ${T.savLbl}`}>Save sale</span>
              </button>
              <button onClick={completeSale} disabled={submitting || rows.length === 0}
                className="flex flex-col items-center justify-center py-6 bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors">
                <span className="text-xs font-bold text-green-300/70 leading-none">F10</span>
                <svg className="w-8 h-8 mt-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                <span className="text-sm font-bold mt-1.5">{submitting ? 'Processing…' : 'Payment'}</span>
              </button>
            </div>
            <div className={`grid grid-cols-3 divide-x border-t ${isDark ? 'divide-[#383838] border-[#383838]' : 'divide-slate-300 border-slate-300'}`}>
              <button onClick={() => navigate('/dashboard')} className={`flex flex-col items-center justify-center py-5 transition-colors ${T.backBtn}`}>
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                <span className={`text-sm font-semibold mt-1 ${T.backLbl}`}>Back</span>
              </button>
              <button onClick={() => navigate('/sales')} className={`flex flex-col items-center justify-center py-5 transition-colors ${T.retBtn}`}>
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                <span className={`text-sm font-semibold mt-1 ${T.retLbl}`}>Return</span>
              </button>
              <button onClick={newSale} className={`flex flex-col items-center justify-center py-5 transition-colors ${T.voidBtn}`}>
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                <span className="text-sm font-semibold mt-1">Void order</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Receipt ── */}
      {/* ── Product List Modal ── */}
      {showProductModal && (() => {
        const q = productModalSearch.toLowerCase();
        const filtered = q.length < 1 ? allProducts : allProducts.filter(p =>
          p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))
        );
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
            onClick={() => setShowProductModal(false)}>
            <div className={`slide-up relative w-full max-w-3xl max-h-[80vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${isDark ? 'bg-[#141414]' : 'bg-white'}`}
              onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className={`flex items-center gap-3 px-5 py-4 border-b shrink-0 ${isDark ? 'border-[#2a2a2a]' : 'border-slate-200'}`}>
                <svg className={`w-5 h-5 shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                <input ref={productModalRef} value={productModalSearch} onChange={e => setProductModalSearch(e.target.value)}
                  placeholder="Search products by name or barcode…"
                  onKeyDown={e => { if (e.key === 'Escape') setShowProductModal(false); if (e.key === 'Enter' && filtered.length > 0) { confirmProduct(filtered[0]); setShowProductModal(false); } }}
                  className={`flex-1 text-base bg-transparent outline-none ${isDark ? 'text-white placeholder-slate-500' : 'text-slate-800 placeholder-slate-400'}`} />
                <span className={`text-xs shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{filtered.length} items</span>
                <button onClick={() => setShowProductModal(false)} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-[#252525] text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              {/* List */}
              <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className={`text-sm text-center py-12 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No products found</p>
                ) : filtered.map(p => (
                  <button key={p.id} onMouseDown={() => { confirmProduct(p); setShowProductModal(false); }}
                    className={`w-full flex items-center justify-between px-5 py-3.5 border-b transition-colors text-left ${isDark ? 'border-[#2a2a2a] hover:bg-[#1e1e1e]' : 'border-slate-100 hover:bg-slate-50'}`}>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{p.name}</p>
                      {p.barcode && <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{p.barcode}</p>}
                    </div>
                    <span className="text-base font-bold text-green-500 ml-6 shrink-0">Rs. {fmt(getPrice(p))}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Sales Drawer ── */}
      {showSalesDrawer && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setShowSalesDrawer(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className={`slide-up relative w-full h-[calc(100vh-48px)] flex flex-col rounded-t-2xl shadow-2xl overflow-hidden ${isDark ? 'bg-[#141414]' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className={`flex items-center gap-4 px-6 py-4 border-b shrink-0 ${isDark ? 'border-[#2a2a2a]' : 'border-slate-200'}`}>
              <p className="font-bold text-base shrink-0">Today's Sales</p>
              <div className="relative flex-1">
                <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                <input autoFocus value={drawerSearch} onChange={e => setDrawerSearch(e.target.value)}
                  placeholder="Search invoice, cashier…"
                  className={`w-full pl-9 pr-4 py-2 text-sm rounded-lg border outline-none transition-colors ${isDark ? 'bg-[#252525] border-[#333] text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
              </div>
              <button onClick={() => { setShowSalesDrawer(false); setDrawerSearch(''); }}
                className={`p-1.5 rounded-lg shrink-0 ${isDark ? 'hover:bg-[#252525] text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            {/* Table head */}
            <div className={`grid px-6 py-2 text-xs font-bold uppercase tracking-widest shrink-0 ${isDark ? 'text-slate-400 bg-[#1a1a1a] border-b border-[#2a2a2a]' : 'text-slate-500 bg-slate-50 border-b border-slate-200'}`}
              style={{ gridTemplateColumns: '1fr 140px 120px 110px 100px' }}>
              <span>Invoice</span><span>Date</span><span>Cashier</span><span className="text-right">Total</span><span className="text-right">Method</span>
            </div>
            {/* Rows */}
            <div className="flex-1 overflow-y-auto">
              {(() => {
                const q = drawerSearch.toLowerCase();
                const filtered = (recentSalesData?.data || []).filter(s =>
                  !q || (s.invoice_no || s.invoice_number || '').toLowerCase().includes(q)
                    || (s.user_name || '').toLowerCase().includes(q)
                    || String(s.total).includes(q)
                );
                if (!filtered.length) return (
                  <p className={`text-sm text-center py-10 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No sales found</p>
                );
                return filtered.map(s => (
                <div key={s.id} className={`grid px-6 py-3 border-b items-center transition-colors cursor-default ${isDark ? 'border-[#2a2a2a] hover:bg-[#1a1a1a]' : 'border-slate-100 hover:bg-slate-50'}`}
                  style={{ gridTemplateColumns: '1fr 140px 120px 110px 100px' }}>
                  <span className="text-sm font-semibold text-blue-500 truncate">{s.invoice_no || s.invoice_number}</span>
                  <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{new Date(s.created_at).toLocaleString('en-LK', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{s.user_name || '—'}</span>
                  <span className="text-sm font-bold text-green-500 text-right">Rs. {fmt(s.total)}</span>
                  <span className={`text-xs text-right capitalize ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{s.payment_method || '—'}</span>
                </div>
              ));
              })()}
            </div>
          </div>
        </div>
      )}

      {receipt && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setReceipt(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 max-h-[90vh] overflow-y-auto text-slate-900" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-3">
              <p className="font-bold text-lg">{settings.shop_name || 'POS'}</p>
              <p className="text-xs text-slate-500">{receipt.invoice_number}</p>
              <p className="text-xs text-slate-400">{new Date(receipt.created_at).toLocaleString()}</p>
            </div>
            <div className="border-t border-dashed border-slate-300 my-2" />
            {(receipt.items || []).map((item, i) => (
              <div key={i} className="flex justify-between text-sm py-0.5">
                <span className="flex-1 pr-2">{item.product_name} × {item.qty}</span>
                <span>Rs. {fmt(item.total)}</span>
              </div>
            ))}
            <div className="border-t border-dashed border-slate-300 my-2" />
            {receipt.discount > 0 && <div className="flex justify-between text-sm text-green-700"><span>Discount</span><span>− Rs. {fmt(receipt.discount)}</span></div>}
            <div className="flex justify-between font-bold text-base mt-1"><span>Total</span><span>Rs. {fmt(receipt.total)}</span></div>
            {receipt.change > 0 && <div className="flex justify-between text-sm text-slate-500 mt-0.5"><span>Change</span><span>Rs. {fmt(receipt.change)}</span></div>}
            <div className="border-t border-dashed border-slate-300 my-2" />
            <p className="text-center text-xs text-slate-500">{settings.receipt_footer || 'Thank you for shopping with us!'}</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setReceipt(null)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold transition-colors">Close</button>
              <button
                onClick={() => {
                  const itemRows = (receipt.items || []).map(item =>
                    `<div class="row"><span>${item.product_name} × ${item.qty}</span><span>Rs. ${fmt(item.total)}</span></div>`
                  ).join('');
                  const win = window.open('', '_blank', 'width=400,height=600');
                  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title><style>
                    *{margin:0;padding:0;box-sizing:border-box}
                    body{font-family:'Courier New',monospace;font-size:12px;color:#000;padding:12px;width:300px}
                    .shop{text-align:center;margin-bottom:8px}
                    .shop h1{font-size:15px;font-weight:700}
                    .shop p{font-size:11px;color:#555;margin-top:2px}
                    .dashed{border-top:1px dashed #999;margin:8px 0}
                    .row{display:flex;justify-content:space-between;padding:2px 0;font-size:12px}
                    .total{display:flex;justify-content:space-between;font-weight:700;font-size:14px;margin-top:4px}
                    .change{display:flex;justify-content:space-between;font-size:11px;color:#555;margin-top:2px}
                    .discount{display:flex;justify-content:space-between;font-size:11px;color:green}
                    .footer{text-align:center;font-size:11px;color:#555;margin-top:8px}
                    @media print{body{width:100%}}
                  </style></head><body>
                    <div class="shop">
                      <h1>${settings.shop_name || 'POS'}</h1>
                      <p>${receipt.invoice_number || ''}</p>
                      <p>${new Date(receipt.created_at).toLocaleString()}</p>
                    </div>
                    <div class="dashed"></div>
                    ${itemRows}
                    <div class="dashed"></div>
                    ${receipt.discount > 0 ? `<div class="discount"><span>Discount</span><span>- Rs. ${fmt(receipt.discount)}</span></div>` : ''}
                    <div class="total"><span>Total</span><span>Rs. ${fmt(receipt.total)}</span></div>
                    ${receipt.change > 0 ? `<div class="change"><span>Change</span><span>Rs. ${fmt(receipt.change)}</span></div>` : ''}
                    <div class="dashed"></div>
                    <div class="footer">${settings.receipt_footer || 'Thank you for shopping with us!'}</div>
                  </body></html>`);
                  win.document.close();
                  win.focus();
                  setTimeout(() => { win.print(); win.close(); }, 300);
                }}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
