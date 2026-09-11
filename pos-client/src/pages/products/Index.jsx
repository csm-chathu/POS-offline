import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  useGetProductsQuery,
  useDeleteProductMutation,
  useUpdateProductMutation,
  useGetCategoriesQuery,
} from '../../features/products/productsApi';
import { selectToken } from '../../features/auth/authSlice';
import { getApiUrl } from '../../config/runtimeConfig';
import { useLocale } from '../../contexts/LocaleContext';
import { useConnectivity } from '../../contexts/ConnectivityContext';
import { getLocalProducts, getLocalCategories } from '../../services/cacheSync';

const SAMPLE_CSV_HEADERS = 'name,barcode,selling_price,cost_price,wholesale_price,stock_qty,alert_qty,unit';
const SAMPLE_CSV_ROW     = 'Sample Product,123456,100.00,70.00,80.00,50,5,pcs';

function printBarcode(product, qty = 1) {
  const code = product.barcode || String(product.id).padStart(6, '0');
  const html = `<!DOCTYPE html><html><head>
    <title>Barcode</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
    <style>
      @page { size: 30mm 20mm; margin: 0; }
      *{box-sizing:border-box;margin:0;padding:0}
      body{
        width:30mm;height:20mm;overflow:hidden;
        font-family:Arial,sans-serif;text-align:center;
        padding:1mm;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
      }
      svg{display:block;width:17mm;height:auto}
      p{font-size:4pt;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:17mm}
      .name{font-weight:bold;font-size:7pt}
      .price{font-weight:bold;font-size:8pt;color:#000}
      .orig{font-size:6pt;text-decoration:line-through;text-decoration-thickness:0.5px;font-weight:normal;color:#000}
    </style>
  </head><body>
    <svg id="bc"></svg>
    <p class="name">${product.name.replace(/</g,'&lt;')}</p>
    ${product.our_price
      ? `<p class="orig">Rs. ${Number(product.selling_price||0).toFixed(2)}</p>
         <p class="price">Rs. ${Number(product.our_price).toFixed(2)}</p>`
      : `<p class="price">Rs. ${Number(product.selling_price||0).toFixed(2)}</p>`
    }
    <script>
      JsBarcode("#bc","${code}",{format:"CODE128",width:0.8,height:17,displayValue:false,margin:0});
    </script>
  </body></html>`;

  if (window.electronAPI?.printBarcode) {
    return window.electronAPI.printBarcode(html, { copies: qty })
      .then(r => { if (r && !r.success) alert('Barcode print failed: ' + (r.error || 'unknown')); })
      .catch(err => alert('Barcode print error: ' + err.message));
  }

  // Browser fallback
  const win = window.open('', '_blank', 'width=380,height=260');
  if (!win) return Promise.resolve();
  win.document.write(html.replace('</script>', ';setTimeout(()=>window.print(),400)</script>'));
  win.document.close();
  return Promise.resolve();
}

function downloadSampleCSV() {
  const csv  = [SAMPLE_CSV_HEADERS, SAMPLE_CSV_ROW].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'products_import_sample.csv';
  a.click(); URL.revokeObjectURL(url);
}

const fmtPrice = n =>
  'Rs. ' + Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtStock = (qty, unit) => {
  const n = parseFloat(qty || 0);
  return (Number.isInteger(n) ? n : n.toFixed(2)) + ' ' + (unit || 'pcs');
};

export default function ProductsIndex() {
  const { t } = useLocale();
  const { isOnline } = useConnectivity();
  const token = useSelector(selectToken);
  const searchRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`${getApiUrl()}/products/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'products.csv';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  }

  const [search, setSearch]     = useState('');
  const [catId,  setCatId]      = useState('');
  const [filter, setFilter]     = useState('all');
  const [page,   setPage]       = useState(1);
  const [viewAll, setViewAll]   = useState(() => localStorage.getItem('products_viewAll') === 'true');
  const [applied, setApplied]   = useState({ search: '', category_id: '', low_stock: false, promo: false });

  const [offlineProducts,   setOfflineProducts]   = useState([]);
  const [offlineCategories, setOfflineCategories] = useState([]);

  useEffect(() => {
    if (!isOnline) {
      getLocalProducts().then(setOfflineProducts);
      getLocalCategories().then(setOfflineCategories);
    }
  }, [isOnline]);

  const { data, isLoading } = useGetProductsQuery(
    viewAll
      ? { page: 1, limit: 9999, active: '1' }
      : {
          active: '1',
          ...(applied.search      ? { search:      applied.search }      : {}),
          ...(applied.category_id ? { category_id: applied.category_id } : {}),
          ...(applied.low_stock   ? { low_stock:   'true' }              : {}),
          ...(applied.promo       ? { promo:       'true' }              : {}),
          page,
        },
    { skip: !isOnline }
  );
  const { data: categories = [] } = useGetCategoriesQuery(undefined, { skip: !isOnline });
  const [deleteProduct]  = useDeleteProductMutation();
  const [updateProduct]  = useUpdateProductMutation();

  const displayCategories = isOnline ? categories : offlineCategories;

  const offlineFiltered = useMemo(() => {
    if (isOnline) return [];
    let result = offlineProducts;
    if (applied.search) {
      const q = applied.search.toLowerCase();
      result = result.filter(p => p.name?.toLowerCase().includes(q) || p.barcode?.includes(applied.search));
    }
    if (applied.category_id) result = result.filter(p => String(p.category_id) === String(applied.category_id));
    if (applied.low_stock)   result = result.filter(p => parseFloat(p.stock_qty) <= parseFloat(p.alert_qty || 0));
    if (applied.promo)       result = result.filter(p => p.promo_price);
    return result;
  }, [isOnline, offlineProducts, applied]);

  const serverRows = isOnline ? (data?.data || []) : offlineFiltered;
  const baseRows = useMemo(() => {
    if (!viewAll || !isOnline) return serverRows;
    let result = serverRows;
    if (applied.search) {
      const q = applied.search.toLowerCase();
      result = result.filter(p => p.name?.toLowerCase().includes(q) || p.barcode?.includes(applied.search));
    }
    if (applied.category_id) result = result.filter(p => String(p.category_id) === String(applied.category_id));
    if (applied.low_stock)   result = result.filter(p => parseFloat(p.stock_qty) <= parseFloat(p.alert_qty || 0));
    if (applied.promo)       result = result.filter(p => p.promo_price);
    return result;
  }, [viewAll, isOnline, serverRows, applied]);
  const rows = baseRows;

  const [printModal,   setPrintModal]   = useState(null);  // { product }
  const [printQty,     setPrintQty]     = useState(1);
  const [printingIds,  setPrintingIds]  = useState(new Set());

  function openPrintModal(product) {
    setPrintModal({ product });
    setPrintQty(1);
  }

  async function confirmPrint() {
    const { product } = printModal;
    const qty = Math.max(1, parseInt(printQty) || 1);
    setPrintModal(null);

    let p = product;
    if (!p.barcode) {
      const generated = String(p.id).padStart(6, '0');
      try { await updateProduct({ id: p.id, barcode: generated }).unwrap(); } catch {}
      p = { ...p, barcode: generated };
    }

    setPrintingIds(prev => new Set(prev).add(p.id));
    try {
      await printBarcode(p, qty);
    } finally {
      setPrintingIds(prev => { const s = new Set(prev); s.delete(p.id); return s; });
    }
  }


  // F1 → focus search
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'F1') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (search.length === 0) {
      setApplied(a => ({ ...a, search: '' }));
      setPage(1);
      return;
    }
    if (search.length < 2) return;
    const timer = setTimeout(() => {
      setApplied(a => ({ ...a, search }));
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  function applySearch(e) {
    if (e) e.preventDefault();
    if (search.length > 0 && search.length < 2) return;
    setApplied({ search, category_id: catId, low_stock: filter === 'low_stock', promo: filter === 'promo' });
    setPage(1);
  }

  function handleFilterToggle(val) {
    setFilter(val);
    setApplied(a => ({ ...a, low_stock: val === 'low_stock', promo: val === 'promo' }));
    setPage(1);
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete "${name}"?`)) return;
    await deleteProduct(id);
  }


  return (
    <>
    <div className="p-3 sm:p-6 space-y-4">

      {/* Top toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-0 w-full sm:min-w-60">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </span>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('pos.search_product')}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          {search.length === 1 && (
            <p className="absolute left-0 top-full mt-1 text-[11px] text-slate-400 pl-1">Type 1 more character…</p>
          )}
        </div>

        {/* Category */}
        <select
          value={catId}
          onChange={e => { setCatId(e.target.value); }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white max-w-48"
        >
          <option value="">{t('lbl.all')} {t('prod.category')}</option>
          {displayCategories.map(c => <option key={c.id} value={c.id}>{c.name?.length > 50 ? c.name.slice(0, 50) + '…' : c.name}</option>)}
        </select>

        {/* All / Low Stock / Promo toggle */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
          <button
            onClick={() => handleFilterToggle('all')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              filter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t('lbl.all')}
          </button>
          <button
            onClick={() => handleFilterToggle('low_stock')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-l border-slate-200 transition-colors ${
              filter === 'low_stock' ? 'bg-orange-500 text-white border-orange-500' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
            {t('dash.low_stock')}
          </button>
          <button
            onClick={() => handleFilterToggle('promo')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-l border-slate-200 transition-colors ${
              filter === 'promo' ? 'bg-orange-500 text-white border-orange-500' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 0 1 0 2.828l-7 7a2 2 0 0 1-2.828 0l-7-7A2 2 0 0 1 3 12V7a2 2 0 0 1 2-2z" />
            </svg>
            {t('prod.promo_section')}
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {!isOnline && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" /> Offline – add/edit disabled
            </span>
          )}
          <button
            onClick={() => { setViewAll(v => { localStorage.setItem('products_viewAll', String(!v)); return !v; }); setPage(1); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border transition-colors shadow-sm ${viewAll ? 'bg-slate-800 text-white border-slate-800 hover:bg-slate-700' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            {viewAll ? 'Paginated' : 'View All'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-60"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          {isOnline && (
            <Link
              to="/products/create"
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <span className="text-lg leading-none">+</span> {t('btn.new_product')}
            </Link>
          )}
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-slate-100 gap-3">
            <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <span className="text-sm text-slate-400">{t('lbl.loading')}</span>
          </div>
        )}
        {!isLoading && rows.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-sm bg-white rounded-xl border border-slate-100">{isOnline ? t('prod.no_products') : 'No cached products'}</div>
        )}
        {rows.map(p => {
          const isLow = parseFloat(p.stock_qty) <= parseFloat(p.alert_qty);
          return (
            <div key={p.id} className="bg-white rounded-xl border border-slate-300 shadow-sm p-4">
              <div className="flex gap-3 mb-3">
                {/* Image */}
                {p.image ? (
                  <img src={p.image} alt={p.name} className="w-12 h-12 rounded-lg object-cover border border-slate-100 shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300 shrink-0">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={1.5}/>
                      <circle cx="8.5" cy="8.5" r="1.5" strokeWidth={1.5}/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 15l-5-5L5 21"/>
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{p.name}</p>
                      {p.name_si && <p className="text-xs text-slate-400 truncate">{p.name_si}</p>}
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold ${p.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {p.active ? t('lbl.active') : t('lbl.inactive')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    <span>{p.category?.name || '—'}</span>
                    {p.barcode && <span className="font-mono">{p.barcode}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex gap-3 items-center flex-wrap">
                  <div>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Sell</p>
                    {p.promo_price ? (
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-orange-500 text-sm">{fmtPrice(p.promo_price)}</span>
                        <span className="text-xs text-slate-400 line-through">{fmtPrice(p.selling_price)}</span>
                      </div>
                    ) : (
                      <span className="font-semibold text-green-600 text-sm">{fmtPrice(p.selling_price)}</span>
                    )}
                  </div>
                  {p.our_price && (
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">Our Price</p>
                      <span className="font-bold text-blue-600 text-sm">{fmtPrice(p.our_price)}</span>
                    </div>
                  )}
                </div>
                <span className={`text-sm font-medium ${isLow ? 'text-red-600' : 'text-slate-700'}`}>
                  {fmtStock(p.stock_qty, p.unit)}
                </span>
              </div>
              <div className="flex gap-2 pt-2 border-t border-slate-200">
                <button onClick={() => openPrintModal(p)} disabled={printingIds.has(p.id)}
                  className="flex-1 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-1">
                  {printingIds.has(p.id)
                    ? <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6v-8z"/></svg>
                  }
                  {t('btn.print')}
                </button>
                {isOnline && (
                  <Link to={`/products/${p.id}/edit`}
                    className="flex-1 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-center">
                    {t('btn.edit')}
                  </Link>
                )}
                {isOnline && (
                  <button onClick={() => handleDelete(p.id, p.name)}
                    className="flex-1 py-1.5 text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                    {t('btn.delete')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!viewAll && data && data.last_page > 1 && (
          <div className="flex items-center justify-between px-2 py-2 text-sm text-slate-500">
            <span>{data.total} {t('nav.products')}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">{'‹'}</button>
              <span className="px-2 py-1">{page} / {data.last_page}</span>
              <button disabled={page >= data.last_page} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">{'›'}</button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-b-xl shadow-sm border border-slate-300 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <span className="text-sm text-slate-400">{t('lbl.loading')}</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-200 border-b border-slate-300">
                <tr>
                  <th className="px-4 py-3 w-10"></th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('th.product')}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('prod.barcode')}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('prod.category')}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('prod.sell_price')}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('lbl.our_price')}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('prod.stock')}</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('th.status')}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('th.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => {
                  const isLow = parseFloat(p.stock_qty) <= parseFloat(p.alert_qty);
                  return (
                    <tr key={p.id} className="odd:bg-white even:bg-slate-50 hover:bg-blue-50 border-b border-slate-300 transition-colors">
                      <td className="px-4 py-3">
                        {p.image ? (
                          <img src={p.image} alt={p.name} className="w-9 h-9 rounded-lg object-cover border border-slate-100" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={1.5}/>
                              <circle cx="8.5" cy="8.5" r="1.5" strokeWidth={1.5}/>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 15l-5-5L5 21"/>
                            </svg>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{p.name}</p>
                        {p.name_si && <p className="text-xs text-slate-400">{p.name_si}</p>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.barcode || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{p.category?.name || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-slate-700">{fmtPrice(p.selling_price)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.our_price
                          ? <span className="font-bold text-orange-500">{fmtPrice(p.our_price)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-medium ${isLow ? 'text-red-600' : 'text-slate-700'}`}>
                          {fmtStock(p.stock_qty, p.unit)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block text-xs px-2.5 py-0.5 rounded-full font-semibold ${p.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {p.active ? t('lbl.active') : t('lbl.inactive')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => openPrintModal(p)} disabled={printingIds.has(p.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40">
                            {printingIds.has(p.id)
                              ? <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                              : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6v-8z"/></svg>
                            }
                            {t('btn.print')}
                          </button>
                          {isOnline && (
                            <Link to={`/products/${p.id}/edit`}
                              className="inline-flex items-center px-2.5 py-1 rounded-md border border-blue-200 bg-blue-50 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors">
                              {t('btn.edit')}
                            </Link>
                          )}
                          {isOnline && (
                            <button onClick={() => handleDelete(p.id, p.name)}
                              className="inline-flex items-center px-2.5 py-1 rounded-md border border-red-200 bg-red-50 text-xs font-medium text-red-500 hover:bg-red-100 transition-colors">
                              {t('btn.delete')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">{t('prod.no_products')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!viewAll && data && data.last_page > 1 && (() => {
          const last = data.last_page;
          const pages = [];
          const btnCls = p => `px-3 py-1 rounded-lg border transition-colors ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 hover:bg-slate-50'}`;
          // Build page numbers: always show first, last, current ±2, with '…' gaps
          const visible = new Set([1, last]);
          for (let p = Math.max(1, page - 2); p <= Math.min(last, page + 2); p++) visible.add(p);
          const sorted = [...visible].sort((a, b) => a - b);
          sorted.forEach((p, idx) => {
            if (idx > 0 && p - sorted[idx - 1] > 1) pages.push('…');
            pages.push(p);
          });
          return (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-300 text-sm text-slate-500">
              <span>{data.total} {t('nav.products')}</span>
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors">‹</button>
                {pages.map((p, i) => p === '…'
                  ? <span key={`e${i}`} className="px-2 text-slate-400 select-none">…</span>
                  : <button key={p} onClick={() => setPage(p)} className={btnCls(p)}>{p}</button>
                )}
                <button disabled={page >= last} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors">›</button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>

    {/* ── Print Barcode Modal ──────────────────────────────────────────── */}
    {printModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
           onClick={e => { if (e.target === e.currentTarget) setPrintModal(null); }}>
        <div className="bg-white rounded-2xl shadow-2xl w-72 max-w-[calc(100vw-2rem)] mx-4 p-6">
          <h3 className="font-bold text-slate-800 text-base mb-1">{t('btn.print')} Barcode</h3>
          <p className="text-sm text-slate-500 mb-4 truncate">{printModal.product.name}</p>

          <label className="block text-xs font-semibold text-slate-600 mb-1">Number of copies</label>
          <input
            type="number" min="1" max="100" value={printQty}
            onChange={e => setPrintQty(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmPrint(); }}
            autoFocus
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-xl font-bold text-center outline-none focus:border-blue-400 mb-5"
          />

          <div className="flex gap-2">
            <button onClick={() => setPrintModal(null)}
              className="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              {t('btn.cancel')}
            </button>
            <button onClick={confirmPrint}
              className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
              {t('btn.print')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
