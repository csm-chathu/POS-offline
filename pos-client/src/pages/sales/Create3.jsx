/**
 * Interface 3 — Scan-and-Enter POS with numpad
 * Flow: scan/type → Enter → qty (numpad) → Enter → next row
 */
import { useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout, selectCurrentUser } from '../../features/auth/authSlice';
import { useCreateSaleMutation } from '../../features/sales/salesApi';
import useProductCache from '../../hooks/useProductCache';
import { useConnectivity } from '../../contexts/ConnectivityContext';
import { enqueueOfflineSale } from '../../services/offlineQueue';
import { api } from '../../app/baseApi';

const posApi = api.injectEndpoints({
  endpoints: b => ({
    getPOS3Settings: b.query({ query: () => '/settings' }),
  }),
  overrideExisting: false,
});

const fmt      = n => Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
const getPrice = p => p.our_price ?? p.promo_price ?? p.selling_price ?? 0;
function recalc(i) { return { ...i, total: Math.max(0, i.qty * i.unit_price - (i.discount || 0)) }; }

// Which field the numpad is currently feeding
// 'qty' | 'tendered' | 'discount'
let numpadTarget = 'qty';

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

  const [rows, setRows]           = useState([]);
  const [curSearch, setCurSearch] = useState('');
  const [curProduct, setCurProduct] = useState(null);
  const [curQty, setCurQty]         = useState('1');
  const [curPrice, setCurPrice]     = useState('');
  const [curLineDsc, setCurLineDsc] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug]     = useState(false);
  const [sugIdx, setSugIdx]       = useState(0);

  const [discount, setDiscount]   = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [tendered, setTendered]   = useState('');
  // numFocus: 'qty' | 'tendered' | 'discount' | { idx, field }
  const [numFocus, setNumFocus]   = useState('qty');
  // rowEdit: buffer for numpad editing a row cell
  const [rowEdit, setRowEdit]     = useState(null); // { idx, field, val: string }
  const [receipt, setReceipt]     = useState(null);
  const [error, setError]         = useState('');

  const searchRef   = useRef();
  const holdTimer   = useRef(null);
  const holdFired   = useRef(false);

  const startHold = () => {
    holdFired.current = false;
    holdTimer.current = setTimeout(() => {
      holdFired.current = true;
      confirmQty();
    }, 600);
  };
  const cancelHold = () => {
    clearTimeout(holdTimer.current);
  };

  const subtotal    = useMemo(() => rows.reduce((s, r) => s + r.total, 0), [rows]);
  const discountAmt = Math.min(parseFloat(discount) || 0, subtotal);
  const grandTotal  = Math.max(0, subtotal - discountAmt);
  const change      = Math.max(0, (parseFloat(tendered) || 0) - grandTotal);

  const focusRow = (idx, field) => {
    const row = rows[idx];
    const cur = field === 'unit_price' ? row.unit_price : (row.discount || 0);
    setRowEdit({ idx, field, val: String(Number(cur)) });
    setNumFocus({ idx, field });
  };

  const commitRowEdit = () => {
    if (!rowEdit) return;
    updateRow(rowEdit.idx, rowEdit.field, rowEdit.val);
    setRowEdit(null);
    setNumFocus('qty');
  };

  // Numpad press
  const numPress = key => {
    // row cell editing
    if (numFocus && typeof numFocus === 'object') {
      if (key === '⏎') { commitRowEdit(); return; }
      setRowEdit(prev => {
        if (!prev) return prev;
        let v = prev.val;
        if (key === 'C')  v = '0';
        else if (key === '←') v = v.length > 1 ? v.slice(0, -1) : '0';
        else if (v === '0' && key !== '.') v = key;
        else if (key === '.' && v.includes('.')) v = v;
        else v = v + key;
        // live-apply to row
        setRows(rs => rs.map((r, i) => i === prev.idx ? recalc({ ...r, [prev.field]: parseFloat(v) || 0 }) : r));
        return { ...prev, val: v };
      });
      return;
    }

    const setter = numFocus === 'tendered' ? setTendered : numFocus === 'discount' ? setDiscount : setCurQty;
    if (key === 'C')  { setter(''); return; }
    if (key === '←') { setter(v => v.slice(0, -1) || ''); return; }
    if (key === '⏎') {
      if (numFocus === 'qty') confirmQty();
      return;
    }
    setter(v => {
      if (v === '0' && key !== '.') return key;
      if (key === '.' && v.includes('.')) return v;
      return (v || '') + key;
    });
  };

  const handleSearchChange = e => {
    const val = e.target.value;
    setCurSearch(val);
    setCurProduct(null);
    setCurQty('1'); setCurPrice(''); setCurLineDsc('');
    if (val.trim().length < 1) { setSuggestions([]); setShowSug(false); return; }
    const q = val.toLowerCase();
    const matches = allProducts.filter(p =>
      p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.startsWith(val))
    ).slice(0, 8);
    setSuggestions(matches);
    setShowSug(matches.length > 0);
    setSugIdx(0);
  };

  const confirmProduct = useCallback(product => {
    setCurProduct(product);
    setCurSearch(product.name);
    setSuggestions([]); setShowSug(false);
    setCurQty('1');
    setCurPrice(String(getPrice(product)));
    setCurLineDsc('');
    setNumFocus('qty');
    setTimeout(() => document.getElementById('qty-input')?.focus(), 0);
  }, []);

  const handleSearchKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSugIdx(i => Math.min(i + 1, suggestions.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSugIdx(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Escape')    { setShowSug(false); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (showSug && suggestions.length > 0) { confirmProduct(suggestions[sugIdx]); return; }
    const exact = allProducts.find(p => p.barcode === curSearch.trim());
    const first = allProducts.find(p => p.name.toLowerCase().includes(curSearch.trim().toLowerCase()));
    const found = exact || first;
    if (found) confirmProduct(found);
  };

  const confirmQty = () => {
    if (!curProduct) return;
    const qty       = Math.max(0.001, parseFloat(curQty) || 1);
    const unitPrice = parseFloat(curPrice) || getPrice(curProduct);
    const lineDsc   = parseFloat(curLineDsc) || 0;
    setRows(prev => {
      const idx = prev.findIndex(r => r.product_id === curProduct.id);
      if (idx >= 0) {
        const upd = [...prev];
        upd[idx] = recalc({ ...upd[idx], qty: upd[idx].qty + qty, unit_price: unitPrice, discount: lineDsc });
        return upd;
      }
      return [...prev, recalc({ product_id: curProduct.id, product_name: curProduct.name, unit_price: unitPrice, qty, discount: lineDsc })];
    });
    setCurSearch(''); setCurProduct(null); setCurQty('1'); setCurPrice(''); setCurLineDsc('');
    setSuggestions([]); setShowSug(false);
    setNumFocus('qty');
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const removeRow = idx => setRows(prev => prev.filter((_, i) => i !== idx));

  const changeQty = (idx, delta) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const qty = Math.max(0, r.qty + delta);
      return qty === 0 ? null : recalc({ ...r, qty });
    }).filter(Boolean));
  };

  const updateRow = (idx, field, value) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const val = parseFloat(value) || 0;
      return recalc({ ...r, [field]: val });
    }));
  };

  async function completeSale() {
    if (rows.length === 0) { setError('No items added'); return; }
    if (payMethod === 'cash' && tendered && parseFloat(tendered) < grandTotal) {
      setError('Tendered less than total'); return;
    }
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
      setCurSearch(''); setCurProduct(null); setCurQty('1');
      setTimeout(() => searchRef.current?.focus(), 0);
    } catch (e) { setError(e?.data?.error || 'Sale failed'); }
  }

  const NUMPAD_KEYS = ['7','8','9','4','5','6','1','2','3','C','0','←'];

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-900 text-white overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-950 border-b border-slate-800 shrink-0">
        <button onClick={() => navigate('/dashboard')} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        </button>
        <span className="font-bold text-slate-200 shrink-0">{settings.shop_name || 'POS'}</span>
        <div className="flex-1" />
        <span className="text-xs text-slate-500">{user?.name}</span>
        <button onClick={() => dispatch(logout())} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-red-400 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">

        {/* Left: Entry table */}
        <div className="flex flex-col flex-1 min-w-0">

          {/* Table header */}
          <div className="grid grid-cols-[28px_1fr_88px_100px_88px_100px_28px] gap-x-3 px-3 py-2 bg-slate-800/50 border-b border-slate-700 text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">
            <span>#</span><span>Product</span><span className="text-center">Qty</span><span className="text-right">Price</span><span className="text-right">Disc</span><span className="text-right">Total</span><span/>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {rows.length === 0 && !curProduct && (
              <p className="text-center text-slate-700 text-sm mt-14">Scan a barcode or type product name below</p>
            )}
            {rows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[28px_1fr_88px_100px_88px_100px_28px] gap-x-3 px-3 py-2 border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors items-center">
                <span className="text-xs text-slate-600 font-mono">{idx + 1}</span>
                <span className="text-sm text-slate-200 font-medium truncate pr-2">{row.product_name}</span>

                {/* Qty */}
                <div className="flex items-center justify-center gap-1">
                  <button onClick={() => changeQty(idx, -1)} className="w-5 h-5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold flex items-center justify-center">−</button>
                  <input
                    type="number" min="0.001" step="1"
                    key={`qty-${idx}-${row.qty}`}
                    defaultValue={row.qty}
                    onFocus={e => e.target.select()}
                    onBlur={e => {
                      const qty = parseFloat(e.target.value);
                      if (!qty || qty <= 0) { e.target.value = String(row.qty); return; }
                      setRows(prev => prev.map((r, i) => i === idx ? recalc({ ...r, qty }) : r));
                    }}
                    onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                    className="w-16 text-center text-sm font-bold text-white bg-slate-800 border border-slate-600 rounded focus:border-blue-500 outline-none py-1"
                  />
                  <button onClick={() => changeQty(idx, +1)} className="w-5 h-5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold flex items-center justify-center">+</button>
                </div>

                {/* Price editable */}
                {(() => {
                  const isActive = numFocus?.idx === idx && numFocus?.field === 'unit_price';
                  const displayVal = isActive && rowEdit ? rowEdit.val : Number(row.unit_price).toFixed(2);
                  return (
                    <input
                      type="number" min="0" step="0.01"
                      value={displayVal}
                      onChange={e => updateRow(idx, 'unit_price', e.target.value)}
                      onFocus={() => focusRow(idx, 'unit_price')}
                      onBlur={commitRowEdit}
                      onKeyDown={e => e.key === 'Enter' && commitRowEdit()}
                      className={`w-full text-right text-sm font-semibold rounded px-1.5 py-1 outline-none transition-colors border ${isActive ? 'bg-amber-900/30 border-amber-500 text-amber-300' : 'bg-slate-800/60 border-transparent hover:border-slate-600 text-amber-300'}`}
                    />
                  );
                })()}

                {/* Discount editable */}
                {(() => {
                  const isActive = numFocus?.idx === idx && numFocus?.field === 'discount';
                  const displayVal = isActive && rowEdit ? rowEdit.val : (row.discount ? Number(row.discount).toFixed(2) : '');
                  return (
                    <input
                      type="number" min="0" step="0.01"
                      value={displayVal}
                      placeholder="0"
                      onChange={e => updateRow(idx, 'discount', e.target.value)}
                      onFocus={() => focusRow(idx, 'discount')}
                      onBlur={commitRowEdit}
                      onKeyDown={e => e.key === 'Enter' && commitRowEdit()}
                      className={`w-full text-right text-sm rounded px-1.5 py-1 outline-none transition-colors border placeholder-slate-700 ${isActive ? 'bg-green-900/30 border-green-500 text-green-300' : 'bg-slate-800/60 border-transparent hover:border-slate-600 text-slate-400'}`}
                    />
                  );
                })()}

                <span className="text-sm font-bold text-green-400 text-right">Rs. {fmt(row.total)}</span>

                <button onClick={() => removeRow(idx)} className="text-slate-700 hover:text-red-400 transition-colors flex items-center justify-center ml-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            ))}
          </div>

          {/* Search + Qty input row */}
          <div className="border-t border-slate-700 bg-slate-800/30 px-4 py-3 shrink-0">
            <div className="relative flex items-center gap-2">
              <span className="text-xs text-slate-600 font-mono w-6 text-right shrink-0">{rows.length + 1}</span>

              {/* Search / barcode */}
              <div className="relative" style={{flex:'2 1 0', minWidth:0}}>
                <input
                  ref={searchRef}
                  value={curSearch}
                  onChange={handleSearchChange}
                  onKeyDown={handleSearchKey}
                  onBlur={() => setTimeout(() => setShowSug(false), 150)}
                  onFocus={() => { suggestions.length > 0 && setShowSug(true); setNumFocus('qty'); }}
                  placeholder="Scan barcode or type product name…"
                  autoFocus
                  className={`w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-colors border ${
                    curProduct
                      ? 'bg-green-900/40 border-green-600 text-green-300 font-semibold'
                      : 'bg-slate-700 border-slate-600 text-white placeholder-slate-500 focus:border-blue-500'
                  }`}
                />
                {showSug && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden z-20 max-h-64 overflow-y-auto">
                    {suggestions.map((p, i) => (
                      <div key={p.id} onMouseDown={() => confirmProduct(p)}
                        className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors ${i === sugIdx ? 'bg-blue-600' : 'hover:bg-slate-700'}`}>
                        <div>
                          <p className="text-sm text-white font-medium">{p.name}</p>
                          {p.barcode && <p className="text-[10px] text-slate-400">{p.barcode}</p>}
                        </div>
                        <span className="text-sm font-bold text-green-400 ml-4 shrink-0">Rs. {fmt(getPrice(p))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Qty */}
              <input
                id="qty-input"
                value={curQty}
                onChange={e => setCurQty(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) startHold(); } }}
                onKeyUp={e => { if (e.key === 'Enter') { cancelHold(); if (!holdFired.current) document.getElementById('price-input')?.focus(); } }}
                onFocus={e => { e.target.select(); setNumFocus('qty'); }}
                disabled={!curProduct}
                placeholder="Qty"
                className="w-24 rounded-lg px-2 py-2.5 text-sm text-center font-bold outline-none transition-colors border bg-slate-700 border-slate-600 text-white placeholder-slate-500 focus:border-blue-500 disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
              />

              {/* Price override */}
              <input
                id="price-input"
                type="number" min="0" step="0.01"
                value={curPrice}
                onChange={e => setCurPrice(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) startHold(); } }}
                onKeyUp={e => { if (e.key === 'Enter') { cancelHold(); if (!holdFired.current) document.getElementById('disc-input')?.focus(); } }}
                onFocus={e => { e.target.select(); setNumFocus('qty'); }}
                disabled={!curProduct}
                placeholder="Price"
                className="w-36 rounded-lg px-2 py-2.5 text-sm text-right font-semibold outline-none transition-colors border bg-slate-700 border-slate-600 text-amber-300 placeholder-slate-500 focus:border-amber-500 disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
              />

              {/* Line discount */}
              <input
                id="disc-input"
                type="number" min="0" step="0.01"
                value={curLineDsc}
                onChange={e => setCurLineDsc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!e.repeat) startHold(); } }}
                onKeyUp={e => { if (e.key === 'Enter') { cancelHold(); if (!holdFired.current) confirmQty(); } }}
                onFocus={e => { e.target.select(); setNumFocus('qty'); }}
                disabled={!curProduct}
                placeholder="Disc"
                className="w-32 rounded-lg px-2 py-2.5 text-sm text-right outline-none transition-colors border bg-slate-700 border-slate-600 text-green-400 placeholder-slate-500 focus:border-green-500 disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
              />
            </div>
            {curProduct && (
              <p className="text-xs text-slate-500 mt-1.5 ml-8">
                <span className="text-green-400 font-semibold">{curProduct.name}</span>
                <span className="mx-1.5 text-slate-700">·</span>
                <span className="text-slate-600">Qty → Price → Disc → ↵ Enter to add</span>
              </p>
            )}
          </div>
        </div>

        {/* Right: Numpad + Payment */}
        <div className="w-80 xl:w-96 flex flex-col border-l border-slate-800 bg-slate-950 shrink-0">

          {/* Active display */}
          <div className="px-4 pt-4 pb-2 border-b border-slate-800 shrink-0">
            {curProduct ? (
              <div className="bg-green-900/30 border border-green-700 rounded-xl px-4 py-3 mb-3">
                <p className="text-xs text-green-500 font-semibold uppercase tracking-wide mb-0.5">Adding</p>
                <p className="text-sm text-green-300 font-bold truncate">{curProduct.name}</p>
                <p className="text-xs text-green-600 mt-0.5">Rs. {fmt(getPrice(curProduct))}</p>
              </div>
            ) : null}

            {/* Active display: Qty OR row field */}
            {numFocus && typeof numFocus === 'object' ? (
              <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border mb-2 ${numFocus.field === 'unit_price' ? 'border-amber-500 bg-amber-900/20' : 'border-green-500 bg-green-900/20'}`}>
                <span className="text-xs font-semibold text-slate-400 uppercase">
                  {numFocus.field === 'unit_price' ? `Row ${numFocus.idx + 1} Price` : `Row ${numFocus.idx + 1} Disc`}
                </span>
                <span className={`text-2xl font-extrabold ${numFocus.field === 'unit_price' ? 'text-amber-300' : 'text-green-300'}`}>
                  {rowEdit?.val || '0'}
                </span>
              </div>
            ) : (
              <div
                onClick={() => { setNumFocus('qty'); setRowEdit(null); }}
                className={`flex items-center justify-between px-4 py-2.5 rounded-xl cursor-pointer border transition-colors mb-2 ${numFocus === 'qty' ? 'border-blue-500 bg-blue-900/20' : 'border-slate-700 bg-slate-800/40'}`}>
                <span className="text-xs text-slate-500 font-semibold">QTY</span>
                <span className="text-2xl font-extrabold text-white">{curQty || '0'}</span>
              </div>
            )}
          </div>

          {/* Numpad */}
          <div className="px-4 py-3 border-b border-slate-800 shrink-0">
            <div className="grid grid-cols-3 gap-2">
              {NUMPAD_KEYS.map(k => (
                <button key={k} onClick={() => numPress(k)}
                  className={`py-3 rounded-xl text-base font-bold transition-all active:scale-95 ${
                    k === 'C'  ? 'bg-red-800/70 hover:bg-red-700 text-red-200' :
                    k === '←' ? 'bg-amber-800/70 hover:bg-amber-700 text-amber-200' :
                                'bg-slate-800 hover:bg-slate-700 text-slate-100'
                  }`}>
                  {k}
                </button>
              ))}
            </div>
            <button onClick={() => numPress('⏎')} disabled={!curProduct}
              className="w-full mt-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors active:scale-[0.98]">
              ↵ Add Item
            </button>
          </div>

          {/* Payment */}
          <div className="px-4 py-3 space-y-2.5 overflow-y-auto flex-1">

            <div className="flex items-center justify-between text-sm text-slate-500 mb-1">
              <span>{rows.length} item{rows.length !== 1 ? 's' : ''}</span>
              <span>Rs. {fmt(subtotal)}</span>
            </div>

            {/* Discount */}
            <div className={`flex items-center justify-between px-3 py-1.5 rounded-xl border transition-colors ${numFocus === 'discount' ? 'border-amber-500 bg-amber-900/20' : 'border-slate-700 bg-slate-800/40'}`}>
              <span className="text-xs text-slate-500 shrink-0 mr-2">Discount</span>
              <input
                type="number" min="0" step="0.01"
                value={discount}
                onChange={e => setDiscount(e.target.value)}
                onFocus={e => { e.target.select(); setNumFocus('discount'); }}
                onBlur={() => setNumFocus('qty')}
                placeholder="0"
                className="flex-1 bg-transparent text-right text-sm font-bold text-amber-400 outline-none placeholder-slate-600"
              />
            </div>

            <div className="flex items-center justify-between px-1 py-1">
              <span className="text-slate-400 font-semibold text-sm">Total</span>
              <span className="text-4xl font-extrabold text-green-400 tracking-tight">Rs. {fmt(grandTotal)}</span>
            </div>

            <div className="flex flex-col gap-2">
              {[
                ['cash','Cash',   'bg-[#1E40AF] hover:bg-blue-900',    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>],
                ['card','Card',   'bg-purple-700 hover:bg-purple-800',  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>],
                ['qr','QR Code',  'bg-[#15803D] hover:bg-green-900',   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12v.01M12 4h.01M4 4h4v4H4V4zm12 0h4v4h-4V4zM4 16h4v4H4v-4z"/></svg>],
              ].map(([val, lbl, color, icon]) => (
                <button key={val} onClick={() => setPayMethod(val)}
                  className={`group flex items-center gap-3 px-4 py-4 rounded-2xl text-white shadow-md hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 ${color} ${payMethod === val ? 'ring-2 ring-white/40' : 'opacity-60 hover:opacity-90'}`}>
                  <div className="w-11 h-11 rounded-xl bg-white/20 group-hover:bg-white/30 flex items-center justify-center shrink-0 transition-colors">
                    {icon}
                  </div>
                  <span className="flex-1 text-left font-bold text-[15px] tracking-tight leading-tight">{lbl}</span>
                  <svg className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              ))}
            </div>

            {payMethod === 'cash' && (
              <>
                <div className={`flex items-center justify-between px-3 py-1.5 rounded-xl border transition-colors ${numFocus === 'tendered' ? 'border-green-500 bg-green-900/20' : 'border-slate-700 bg-slate-800/40'}`}>
                  <span className="text-xs text-slate-500 shrink-0 mr-2">Tendered</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={tendered}
                    onChange={e => setTendered(e.target.value)}
                    onFocus={e => { e.target.select(); setNumFocus('tendered'); }}
                    onBlur={() => setNumFocus('qty')}
                    placeholder={fmt(grandTotal)}
                    className="flex-1 bg-transparent text-right text-sm font-bold text-white outline-none placeholder-slate-600"
                  />
                </div>
                {tendered && (
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-slate-500">Change</span>
                    <span className={`text-lg font-bold ${change >= 0 ? 'text-amber-400' : 'text-red-400'}`}>Rs. {fmt(change)}</span>
                  </div>
                )}
              </>
            )}

            {error && <p className="text-xs text-red-400 text-center">{error}</p>}

            <button onClick={completeSale} disabled={submitting || rows.length === 0}
              className="w-full py-3.5 rounded-xl bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-all">
              {submitting ? 'Processing…' : rows.length === 0 ? 'Complete Sale' : `Complete · Rs. ${fmt(grandTotal)}`}
            </button>
          </div>
        </div>
      </div>

      {/* Receipt */}
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
            <p className="text-center text-xs text-slate-500">{settings.receipt_footer || 'Thank you!'}</p>
            <button onClick={() => setReceipt(null)} className="w-full mt-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
