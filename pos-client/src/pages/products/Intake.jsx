import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGetProductsQuery, useUpdateProductMutation, useCreateProductMutation } from '../../features/products/productsApi';
import { useSelector } from 'react-redux';
import { selectToken } from '../../features/auth/authSlice';
import { getApiUrl } from '../../config/runtimeConfig';
import { clearProductCache } from '../../hooks/useProductCache';

const API = getApiUrl();

export default function ProductIntake() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const token      = useSelector(selectToken);
  const barcodeRef    = useRef(null);
  const searchRef     = useRef(null);
  const fStockRef     = useRef(null);
  const fCostRef      = useRef(null);
  const fSellRef      = useRef(null);
  const fOurRef       = useRef(null);
  const fExpiryRef    = useRef(null);
  const fNameSiRef    = useRef(null);
  const fSaveRef      = useRef(null);
  const fNext = ref => e => { if (e.key === 'Enter') { e.preventDefault(); ref.current?.focus(); } };

  const [barcode,    setBarcode]    = useState('');
  const [product,    setProduct]    = useState(null);
  const [notFound,   setNotFound]   = useState(false);
  const [looking,    setLooking]    = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [lastSaved,  setLastSaved]  = useState('');
  const [form, setForm] = useState({ stock_qty: '', cost_price: '', selling_price: '', our_price: '', expiry_date: '', name_si: '' });

  const [browseOpen,  setBrowseOpen]  = useState(false);
  const [browseSearch, setBrowseSearch] = useState('');
  const [browsePage,  setBrowsePage]  = useState(1);

  const { data: browseData, isFetching: browseFetching } = useGetProductsQuery(
    { search: browseSearch, page: browsePage, limit: 20 },
    { skip: !browseOpen }
  );

  const [updateProduct, { isLoading: saving }] = useUpdateProductMutation();
  const [createProduct, { isLoading: creating }] = useCreateProductMutation();

  const [qcOpen, setQcOpen] = useState(false);
  const EMPTY_QC = { name: '', name_si: '', barcode: '', cost_price: '', selling_price: '', our_price: '', stock_qty: '', unit: 'pcs' };
  const [qcForm, setQcForm] = useState(EMPTY_QC);
  const qcNameRef     = useRef(null);
  const qcNameSiRef   = useRef(null);
  const qcBarcodeRef  = useRef(null);
  const qcCostRef     = useRef(null);
  const qcSellRef     = useRef(null);
  const qcOurRef      = useRef(null);
  const qcStockRef    = useRef(null);
  const qcUnitRef     = useRef(null);
  const qcSubmitRef   = useRef(null);
  const qcNext = ref => e => { if (e.key === 'Enter') { e.preventDefault(); ref.current?.focus(); } };
  useEffect(() => { if (qcOpen) setTimeout(() => qcNameRef.current?.focus(), 50); }, [qcOpen]);
  useEffect(() => { if (product) setTimeout(() => fStockRef.current?.focus(), 50); }, [product]);
  useEffect(() => {
    const bc = location.state?.barcode;
    if (!bc) return;
    setBarcode(bc);
    navigate(location.pathname, { replace: true, state: {} });
    setTimeout(() => lookup(bc), 100);
  }, []);

  useEffect(() => {
    if (browseOpen) setTimeout(() => searchRef.current?.focus(), 50);
  }, [browseOpen]);

  useEffect(() => {
    setBrowsePage(1);
  }, [browseSearch]);

  const lastSearchRef = useRef('');

  async function lookup(bc) {
    const q = bc.trim();
    if (!q) return;
    lastSearchRef.current = q;
    setBarcode('');
    setLooking(true);
    setNotFound(false);
    setProduct(null);
    try {
      const res = await fetch(`${API}/api/products/intake-lookup?barcode=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        setNotFound(true);
      } else {
        const data = await res.json();
        selectProduct(data);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLooking(false);
    }
  }

  function selectProduct(data) {
    setBarcode('');
    setProduct(data);
    setForm({
      stock_qty:     String(data.stock_qty    ?? ''),
      cost_price:    String(data.cost_price   ?? ''),
      selling_price: String(data.selling_price ?? ''),
      our_price:     String(data.our_price ?? ''),
      expiry_date:   data.expiry_date ?? '',
      name_si:       data.name_si ?? '',
    });
    setBrowseOpen(false);
    setBrowseSearch('');
  }

  function handleBarcodeKey(e) {
    if (e.key === 'Enter') lookup(barcode);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!product) return;
    await updateProduct({
      id:            product.id,
      stock_qty:     form.stock_qty,
      cost_price:    form.cost_price,
      selling_price: form.selling_price,
      our_price:     form.our_price || null,
      expiry_date:   form.expiry_date || null,
      name_si:       form.name_si || null,
      active:        true,
    }).unwrap();
    clearProductCache();
    setSavedCount(c => c + 1);
    setLastSaved(product.name);
    reset();
  }

  async function handleQuickCreate(e) {
    e.preventDefault();
    try {
      const created = await createProduct({
        name:          qcForm.name,
        name_si:       qcForm.name_si || null,
        barcode:       qcForm.barcode || null,
        cost_price:    parseFloat(qcForm.cost_price) || 0,
        selling_price: parseFloat(qcForm.selling_price) || 0,
        our_price:     parseFloat(qcForm.our_price) || null,
        stock_qty:     parseFloat(qcForm.stock_qty) || 0,
        unit:          qcForm.unit || 'pcs',
        active:        true,
      }).unwrap();
      clearProductCache();
      setNotFound(false);
      setQcOpen(false);
      setQcForm(EMPTY_QC);
      selectProduct(created);
    } catch {}
  }

  function reset() {
    setProduct(null);
    setBarcode('');
    setNotFound(false);
    setForm({ stock_qty: '', cost_price: '', selling_price: '', our_price: '', expiry_date: '', name_si: '' });
    setTimeout(() => barcodeRef.current?.focus(), 50);
  }

  const browseRows = browseData?.data || [];

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Stock Intake — තොගය ඇතුල් කිරීම</h1>
          <p className="text-sm text-slate-400 mt-0.5">බාකෝඩ් හොයන්න → විස්තර ඇතුල් කරන්න → සුරකින්න</p>
        </div>
        <button onClick={() => navigate('/products')}
          className="text-sm text-slate-500 hover:text-slate-700 transition-colors mt-1">
          ← Back
        </button>
      </div>

      {/* Saved counter */}
      {savedCount > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <p className="text-sm font-bold text-green-700">{savedCount} item{savedCount > 1 ? 's' : ''} activated this session</p>
            <p className="text-xs text-green-600 truncate">Last: {lastSaved}</p>
          </div>
        </div>
      )}

      {/* Barcode scanner */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
        <label className="block text-sm font-semibold text-slate-600">Barcode</label>
        <div className="flex gap-2">
          <input
            ref={barcodeRef}
            autoFocus
            value={barcode}
            onChange={e => setBarcode(e.target.value)}
            onFocus={e => e.target.select()}
            onKeyDown={handleBarcodeKey}
            placeholder="Scan or type barcode, press Enter…"
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
          />
          <button type="button" onClick={() => lookup(barcode)}
            disabled={looking || !barcode.trim()}
            className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50 hover:bg-blue-700 transition-colors">
            {looking ? '…' : 'Go'}
          </button>
          <button type="button" onClick={() => setBrowseOpen(true)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
            Browse
          </button>
        </div>
      </div>

      {/* Not found */}
      {notFound && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-red-600">"{lastSearchRef.current}" බාකෝඩ් එකට හාණ්ඩයක් හමු නොවීය</span>
          <button type="button"
            onClick={() => { setQcForm({ ...EMPTY_QC, barcode: lastSearchRef.current }); setQcOpen(true); }}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors">
            + නව හාණ්ඩයක් සාදන්න
          </button>
        </div>
      )}

      {/* Product form */}
      {product && (
        <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-slate-800 text-base leading-snug">{product.name}</p>
              {product.active
                ? <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Active</span>
                : <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">Inactive</span>
              }
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
              {product.category?.name && <span>{product.category.name}</span>}
              {product.barcode && <span className="font-mono">{product.barcode}</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">තොගය</label>
              <input type="number" step="0.001" min="0" required value={form.stock_qty}
                ref={fStockRef}
                onChange={e => setForm(f => ({ ...f, stock_qty: e.target.value }))}
                onFocus={e => e.target.select()}
                onKeyDown={fNext(fCostRef)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">මිලදී ගැනීමේ මිල</label>
              <input type="number" step="0.01" min="0" required value={form.cost_price}
                ref={fCostRef}
                onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))}
                onFocus={e => e.target.select()}
                onKeyDown={fNext(fSellRef)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">විකිණුම් මිල</label>
              <input type="number" step="0.01" min="0" required value={form.selling_price}
                ref={fSellRef}
                onChange={e => setForm(f => ({ ...f, selling_price: e.target.value }))}
                onFocus={e => e.target.select()}
                onKeyDown={fNext(fOurRef)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">අපේ මිල</label>
              <input type="number" step="0.01" min="0" value={form.our_price}
                ref={fOurRef}
                onChange={e => setForm(f => ({ ...f, our_price: e.target.value }))}
                onFocus={e => e.target.select()}
                onKeyDown={fNext(fExpiryRef)}
                placeholder="ප්‍රවර්ධන මිල"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">කල් ඉකුත් දිනය</label>
              <input type="date" value={form.expiry_date}
                ref={fExpiryRef}
                onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))}
                onFocus={e => e.target.showPicker?.()}
                onClick={e => e.target.showPicker?.()}
                onKeyDown={fNext(fNameSiRef)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">සිංහල නම</label>
            <input type="text" value={form.name_si}
              ref={fNameSiRef}
              onChange={e => setForm(f => ({ ...f, name_si: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fSaveRef.current?.click(); } }}
              placeholder="Enter Sinhala name"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              style={{ fontFamily: "'Noto Sans Sinhala', sans-serif" }} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={reset}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
              Skip
            </button>
            <button type="submit" ref={fSaveRef} disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold disabled:opacity-60 hover:bg-green-700 transition-colors">
              {saving ? 'Saving…' : '✓  Save & Next'}
            </button>
          </div>
        </form>
      )}

      {/* Quick Create modal */}
      {qcOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setQcOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">නව හාණ්ඩයක් සාදන්න</h2>
              <button onClick={() => setQcOpen(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleQuickCreate} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">හාණ්ඩයේ නම *</label>
                <input required type="text" value={qcForm.name}
                  ref={qcNameRef}
                  onChange={e => setQcForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={qcNext(qcNameSiRef)}
                  placeholder="Product name"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">සිංහල නම</label>
                <input type="text" value={qcForm.name_si}
                  ref={qcNameSiRef}
                  onChange={e => setQcForm(f => ({ ...f, name_si: e.target.value }))}
                  onKeyDown={qcNext(qcBarcodeRef)}
                  placeholder="සිංහල නම ඇතුල් කරන්න"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ fontFamily: "'Noto Sans Sinhala', sans-serif" }} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">බාකෝඩ්</label>
                <input type="text" value={qcForm.barcode}
                  ref={qcBarcodeRef}
                  onChange={e => setQcForm(f => ({ ...f, barcode: e.target.value }))}
                  onKeyDown={qcNext(qcCostRef)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">මිලදී ගැනීමේ මිල *</label>
                  <input required type="number" step="0.01" min="0" value={qcForm.cost_price}
                    ref={qcCostRef}
                    onChange={e => setQcForm(f => ({ ...f, cost_price: e.target.value }))}
                    onFocus={e => e.target.select()}
                    onKeyDown={qcNext(qcSellRef)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">විකිණුම් මිල *</label>
                  <input required type="number" step="0.01" min="0" value={qcForm.selling_price}
                    ref={qcSellRef}
                    onChange={e => setQcForm(f => ({ ...f, selling_price: e.target.value }))}
                    onFocus={e => e.target.select()}
                    onKeyDown={qcNext(qcOurRef)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">අපේ මිල</label>
                  <input type="number" step="0.01" min="0" value={qcForm.our_price}
                    ref={qcOurRef}
                    onChange={e => setQcForm(f => ({ ...f, our_price: e.target.value }))}
                    onFocus={e => e.target.select()}
                    onKeyDown={qcNext(qcStockRef)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">තොගය *</label>
                  <input required type="number" step="0.001" min="0" value={qcForm.stock_qty}
                    ref={qcStockRef}
                    onChange={e => setQcForm(f => ({ ...f, stock_qty: e.target.value }))}
                    onFocus={e => e.target.select()}
                    onKeyDown={qcNext(qcUnitRef)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">ඒකකය</label>
                <select value={qcForm.unit} ref={qcUnitRef}
                  onChange={e => setQcForm(f => ({ ...f, unit: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); qcSubmitRef.current?.click(); } }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                  {['pcs','kg','g','l','ml','box','pack','dozen'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setQcOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                  අවලංගු කරන්න
                </button>
                <button type="submit" ref={qcSubmitRef} disabled={creating}
                  className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60 hover:bg-blue-700 transition-colors">
                  {creating ? 'සුරකිමින්...' : '✓ සාදා ගන්න'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Browse modal */}
      {browseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={e => { if (e.target === e.currentTarget) setBrowseOpen(false); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[80vh]">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Browse Products</h2>
              <button onClick={() => setBrowseOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                </svg>
                <input
                  ref={searchRef}
                  value={browseSearch}
                  onChange={e => setBrowseSearch(e.target.value)}
                  placeholder="Search by name or barcode…"
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                />
              </div>
            </div>

            {/* Results list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {browseFetching && (
                <div className="flex items-center justify-center py-10 text-slate-400 text-sm gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Loading…
                </div>
              )}
              {!browseFetching && browseRows.length === 0 && (
                <div className="py-10 text-center text-slate-400 text-sm">No products found</div>
              )}
              {!browseFetching && browseRows.map(p => (
                <button key={p.id} type="button"
                  onClick={() => selectProduct(p)}
                  className="w-full text-left px-5 py-3 hover:bg-blue-50 transition-colors flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                      {p.category?.name && <span>{p.category.name}</span>}
                      {p.barcode && <span className="font-mono">{p.barcode}</span>}
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold ${p.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {p.active ? 'Active' : 'Inactive'}
                  </span>
                </button>
              ))}
            </div>

            {/* Pagination */}
            {browseData && browseData.last_page > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-sm text-slate-500">
                <span>{browseData.total} products</span>
                <div className="flex gap-2">
                  <button disabled={browsePage <= 1} onClick={() => setBrowsePage(p => p - 1)}
                    className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">‹</button>
                  <span className="px-2 py-1">{browsePage} / {browseData.last_page}</span>
                  <button disabled={browsePage >= browseData.last_page} onClick={() => setBrowsePage(p => p + 1)}
                    className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">›</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
