import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useGetSaleQuery, useReturnSaleMutation } from '../../features/sales/salesApi';
import { useSelector } from 'react-redux';
import { selectCurrentUser, selectRole } from '../../features/auth/authSlice';
import { useLocale } from '../../contexts/LocaleContext';
import { translations } from '../../i18n/translations';
import { getApiUrl } from '../../config/runtimeConfig';

const API = getApiUrl();

const fmt = n => Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
const fmtDate = s => new Date(s).toLocaleDateString('en-LK', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = s => new Date(s).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', hour12: true });

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoBack    = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>;
const IcoReturn  = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6l6-6"/></svg>;
const IcoPlus    = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>;
const IcoRefresh = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15"/></svg>;
const IcoPrint   = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2m2 4h6a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2zm1-4h4v4H9v-4z"/></svg>;
const IcoSpinner = <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>;
const IcoLogout  = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1"/></svg>;

export default function SaleShow() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const location   = useLocation();
  const role       = useSelector(selectRole);
  const user       = useSelector(selectCurrentUser);
  const { t }      = useLocale();

  const { data: sale, isLoading, refetch } = useGetSaleQuery(id);
  const [returnSale, { isLoading: returning }] = useReturnSaleMutation();

  const [returnModal,  setReturnModal]  = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [returnItems,  setReturnItems]  = useState([]);
  const [paperSize,    setPaperSize]    = useState('72mm');
  const [shopInfo,     setShopInfo]     = useState({});
  const [printing,     setPrinting]     = useState(false);

  const autoPrintFiredRef = useRef(false);

  useEffect(() => {
    fetch(`${API}/api/settings/public`)
      .then(r => r.json())
      .then(setShopInfo)
      .catch(() => {});
  }, []);

  // Auto-print when arriving from POS via Enter key (autoPrint nav state)
  useEffect(() => {
    if (!location.state?.autoPrint) return;
    if (!sale || Object.keys(shopInfo).length === 0) return;
    if (autoPrintFiredRef.current) return;
    autoPrintFiredRef.current = true;
    handlePrint();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale, shopInfo]);

  function openReturn() {
    setReturnItems((sale.items || []).map(i => ({ ...i, return_qty: 0 })));
    setReturnReason('');
    setReturnModal(true);
  }

  async function handleReturn(e) {
    e.preventDefault();
    const items = returnItems.filter(i => parseFloat(i.return_qty) > 0);
    if (!items.length) return;
    await returnSale({ id, reason: returnReason, items }).unwrap();
    setReturnModal(false);
    navigate('/sales');
  }

  async function handlePrint() {
    if (!sale || printing) return;
    setPrinting(true);
    const is80 = paperSize === '72mm';
    const currency = shopInfo.currency || 'Rs.';
    const receiptLang = shopInfo.receipt_language || 'en';
    const isSinhala = receiptLang === 'si';
    const rl = key => (translations[receiptLang] || translations.en)[key] ?? translations.en[key];
    const minDelay = new Promise(r => setTimeout(r, 2200));

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
        <div class="item-name">${item.product_name}</div>
      </div>
      <div class="item-data">
        <span class="qty-col">${qty}</span>
        <span class="orig-col orig-light">${fmt(origPrice)}</span>
        <span class="our-col">${fmt(ourUnit)}</span>
        <span class="line-col">${fmt(reducedLineTotal)}</span>
      </div>
    `;
    }).join('');

    const payments  = sale.payments || [];
    const paidCash  = payments.filter(p => p.method === 'cash').reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    const paidCard  = payments.filter(p => p.method === 'card').reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    const paidCredit = payments.filter(p => p.method === 'credit').reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    const change     = Math.max(0, parseFloat(sale.paid || 0) - parseFloat(sale.total || 0));
    const cashGiven  = paidCash + change;

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
      font-size: ${is80 ? '13px' : '15px'};
      font-weight: 900;
      width: ${is80 ? '72mm' : '210mm'};
      max-width: ${is80 ? '72mm' : '210mm'};
      color: #000;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    body { padding: ${is80 ? '5mm 4mm' : '15mm 20mm'}; }
    .center { text-align:center; }
    .logo { width:${is80 ? '56px' : '72px'}; height:${is80 ? '56px' : '72px'}; object-fit:contain; margin:0 auto 6px; display:block; border-radius:50%; }
    .shop-name { font-size:${is80 ? '16px' : '22px'}; font-weight:900; text-align:center; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:3px; color:#000; word-break:break-word; }
    .shop-meta { font-size:${is80 ? '12px' : '14px'}; font-weight:900; text-align:center; color:#000; line-height:1.6; word-break:break-word; }
    .divider { border:none; border-top:2px solid #000; margin:8px 0; }
    .row { display:flex; justify-content:space-between; gap:6px; padding:3px 0; font-size:${is80 ? '12px' : '14px'}; color:#000; }
    .row .label { color:#000; font-weight:900; flex-shrink:0; }
    .row .value { font-weight:900; color:#000; text-align:right; min-width:0; word-break:break-word; }
    .col-header { display:grid; grid-template-columns: 30px repeat(3, 1fr); gap:8px; font-weight:900; padding:4px 0 3px; border-top:2px solid #000; border-bottom:2px solid #000; margin:6px 0; font-size:${is80 ? '12px' : '14px'}; color:#000; text-align:right; }
    .col-header span { white-space:nowrap; }
    .item-row { display:flex; justify-content:space-between; align-items:flex-start; gap:6px; font-weight:900; padding-top:5px; font-size:${is80 ? '13px' : '15px'}; color:#000; }
    .item-name { flex:1; min-width:0; word-break:break-word; overflow-wrap:break-word; }
    .item-data { display:grid; grid-template-columns: 30px repeat(3, 1fr); gap:8px; text-align:right; padding:2px 0 5px; font-size:${is80 ? '12px' : '13px'}; font-weight:900; color:#000; }
    .qty-col { text-align:left; }
    .orig-col, .our-col, .line-col { text-align:right; white-space:nowrap; }
    .orig-light { font-weight: 600; }
    .disc-box { border:2px solid #000; border-radius:4px; padding:3px 8px; display:flex; justify-content:space-between; gap:6px; margin:5px 0; }
    .disc-label { color:#000; font-weight:900; flex-shrink:0; }
    .disc-val { color:#000; font-weight:900; }
    .total-row { display:flex; justify-content:space-between; align-items:baseline; gap:6px; font-weight:900; font-size:${is80 ? '15px' : '20px'}; padding:6px 0 4px; border-top:2px solid #000; margin-top:4px; color:#000; }
    .total-val { color:#000; flex-shrink:0; }
    .paid-row { display:flex; justify-content:space-between; gap:6px; padding:3px 0; font-weight:900; font-size:${is80 ? '12px' : '14px'}; color:#000; }
    .change-row { display:flex; justify-content:space-between; gap:6px; font-weight:900; color:#000; padding:3px 0; font-size:${is80 ? '13px' : '15px'}; }
    .footer { text-align:center; margin-top:10px; font-size:${is80 ? '12px' : '14px'}; color:#000; font-weight:900; line-height:1.8; word-break:break-word; }
    @media print {
      html, body { overflow: visible !important; height: auto !important; }
      @page { margin: 0; size: ${is80 ? '72mm auto' : 'A4'}; }
      body { padding: ${is80 ? '3mm 4mm' : '10mm'}; width: ${is80 ? '72mm' : '210mm'} !important; }
    }
  </style>
</head>
<body>
  ${shopInfo.shop_logo ? `<img class="logo" src="${shopInfo.shop_logo}" alt="logo">` : ''}
  <div class="shop-name">${shopInfo.shop_name || 'LMUC POS'}</div>
  <div class="shop-meta">
    ${shopInfo.address ? shopInfo.address + '<br>' : ''}
    ${shopInfo.phone || ''}
  </div>
  <hr class="divider">
  <div class="row"><span class="label">${rl('th.invoice')}</span><span class="value">${sale.invoice_no}</span></div>
  <div class="row"><span class="label">${rl('th.date')}</span><span class="value">${fmtDate(sale.created_at)} ${fmtTime(sale.created_at)}</span></div>
  <div class="row"><span class="label">${rl('lbl.cashier')}</span><span class="value">${sale.user?.name || '—'}</span></div>
  ${sale.customer?.name ? `<div class="row"><span class="label">${rl('lbl.customer')}</span><span class="value">${sale.customer.name}</span></div>` : ''}
  <div class="col-header"><span class="qty-col">${rl('th.qty')}</span><span>${rl('lbl.original_price')}</span><span>${rl('lbl.our_price')}</span><span>${rl('th.total')}</span></div>
  ${itemsHtml}
  <hr class="divider">
  ${totalSaved > 0 ? `<div class="disc-box"><span class="disc-label">${rl('lbl.you_saved')}</span><span class="disc-val">- ${fmt(totalSaved)}</span></div>` : ''}
  ${parseFloat(sale.discount) > 0 ? `<div class="disc-box"><span class="disc-label">${rl('lbl.earned_profit')}</span><span class="disc-val">- ${fmt(sale.discount)}</span></div>` : ''}
  ${parseFloat(sale.tax) > 0 ? `<div class="row"><span class="label">${rl('lbl.tax')}</span><span>${fmt(sale.tax)}</span></div>` : ''}
  <div class="total-row"><span class="total-label">${rl('lbl.grand_total')}</span><span class="total-val">${currency} ${fmt(sale.total)}</span></div>
  ${paidCash > 0  ? `<div class="paid-row"><span>${rl('lbl.cash_paid')} (${rl('lbl.cash')})</span><span>${fmt(cashGiven)}</span></div>` : ''}
  ${paidCard > 0  ? `<div class="paid-row"><span>${rl('lbl.cash_paid')} (${rl('lbl.card')})</span><span>${fmt(paidCard)}</span></div>` : ''}
  ${paidCredit > 0 ? `<div class="paid-row"><span>${rl('lbl.credit')}</span><span>${fmt(paidCredit)}</span></div>` : ''}
  ${change > 0    ? `<div class="change-row"><span>${rl('lbl.change')}</span><span>${fmt(change)}</span></div>` : ''}
  <hr class="divider">
  <div class="footer">
    ${shopInfo.receipt_footer || 'Thank you for shopping with us!'}
    <br>lumac.lk
  </div>
</body>
</html>`;

    try {
      // Electron: window.open() is blocked — print silently via IPC in a hidden window
      if (window.electronAPI?.printReceiptHtml) {
        const [r] = await Promise.all([
          window.electronAPI.printReceiptHtml(html, { paperSize }),
          minDelay,
        ]);
        if (r && !r.success) alert('Print failed: ' + (r.error || 'unknown error'));
      } else {
        // Browser: open popup and print
        const win = window.open('', '_blank', 'width=400,height=700,scrollbars=yes');
        if (win) {
          win.document.write(html);
          win.document.close();
          win.onload = () => win.print();
        }
        await minDelay;
      }
    } catch (err) {
      alert('Print error: ' + err.message);
    } finally {
      setPrinting(false);
      if (location.state?.autoPrint) {
        navigate('/sales/create', { replace: true });
      }
    }
  }

  const roleColor = { admin: 'bg-red-500', manager: 'bg-blue-500', cashier: 'bg-green-500' };
  const payments   = sale?.payments || [];
  const paidCash   = payments.filter(p => p.method === 'cash').reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const paidCard   = payments.filter(p => p.method === 'card').reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const paidCredit = payments.filter(p => p.method === 'credit').reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const change     = Math.max(0, parseFloat(sale?.paid || 0) - parseFloat(sale?.total || 0));
  const cashGiven  = paidCash + change;
  const currency   = shopInfo.currency || 'Rs.';
  const receiptLang = shopInfo.receipt_language || 'en';
  const rl = key => (translations[receiptLang] || translations.en)[key] ?? translations.en[key];

  if (isLoading) return (
    <div className="h-screen flex items-center justify-center text-slate-400 text-sm">{t('lbl.loading')}</div>
  );
  if (!sale) return (
    <div className="h-screen flex items-center justify-center text-slate-400 text-sm">Sale not found</div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-100">

      {/* ── Custom top bar ──────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 shadow-sm px-3 py-2 flex items-center justify-between sticky top-0 z-10 gap-2">
        <div className="flex items-center gap-2 min-w-0 shrink">
          <button onClick={() => navigate('/sales')}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0">
            {IcoBack}
          </button>
          <span className="font-bold text-slate-800 font-mono text-xs sm:text-sm truncate">{sale.invoice_no}</span>
          {sale.status === 'returned' && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 uppercase tracking-wide shrink-0">{t('btn.return')}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Paper size toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
            <button onClick={() => setPaperSize('72mm')}
              className={`px-2 py-1.5 transition-colors ${paperSize === '72mm' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              72mm
            </button>
            <button onClick={() => setPaperSize('A4')}
              className={`px-2 py-1.5 transition-colors border-l border-slate-200 ${paperSize === 'A4' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              A4
            </button>
          </div>

          {/* Return button */}
          {sale.status === 'completed' && (role === 'admin' || role === 'manager') && (
            <button onClick={openReturn}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-red-300 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors">
              {IcoReturn}
              <span className="hidden sm:inline">{t('btn.return')}</span>
            </button>
          )}

          {/* New Sale */}
          <button onClick={() => navigate('/sales/create')}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-green-500 text-white text-xs font-semibold hover:bg-green-600 transition-colors">
            {IcoPlus}
            <span className="hidden sm:inline">{t('btn.new_sale')}</span>
          </button>

          {/* Refresh */}
          <button onClick={refetch}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            {IcoRefresh}
          </button>

          <div className="w-px h-5 bg-slate-200 hidden sm:block" />

          {/* User avatar */}
          <div className={`w-7 h-7 rounded-full ${roleColor[role] || 'bg-slate-500'} flex items-center justify-center text-white font-bold text-xs shrink-0`}>
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="text-xs leading-tight hidden md:block">
            <p className="font-semibold text-slate-700">{user?.name}</p>
            <p className="text-slate-400 capitalize">{role}</p>
          </div>
        </div>
      </header>

      {/* ── Print button ────────────────────────────────────────────────── */}
      <button onClick={handlePrint} disabled={printing}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-20 flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-full bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-600/40">
        {printing ? IcoSpinner : IcoPrint}
        <span>{printing ? t('lbl.loading') : t('btn.print')}</span>
      </button>

      {/* ── Scrollable receipt area ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-6 sm:py-8 px-3 sm:px-4 flex flex-col items-center pb-20">

        {/* Receipt card */}
        <div id="receipt"
          className="bg-white rounded-2xl shadow-md border border-slate-100 w-full max-w-sm px-8 py-7"
          style={{ fontFamily: "'Outfit', 'Noto Sans Sinhala', sans-serif" }}>

          {/* Shop header */}
          <div className="text-center mb-5">
            {shopInfo.shop_logo ? (
              <img src={shopInfo.shop_logo} alt="logo"
                className="w-24 h-24 object-contain mx-auto mb-3 rounded-full" />
            ) : (
              <div className="w-24 h-24 bg-slate-100 rounded-full mx-auto mb-3 flex items-center justify-center text-slate-400 text-4xl font-black">
                {(shopInfo.shop_name || 'L')[0]}
              </div>
            )}
            <p className="font-black text-black text-xl tracking-wide uppercase">
              {shopInfo.shop_name || 'LMUC POS'}
            </p>
            {shopInfo.address && <p className="text-black text-sm font-medium mt-0.5">{shopInfo.address}</p>}
            {shopInfo.phone   && <p className="text-black text-sm font-medium">{shopInfo.phone}</p>}
          </div>

          <hr className="border-slate-200 mb-4" />

          {/* Invoice meta */}
          <div className="space-y-1.5">
            <MetaRow label={t('th.invoice')}  value={sale.invoice_no} mono />
            <MetaRow label={t('th.date')}     value={`${fmtDate(sale.created_at)} ${fmtTime(sale.created_at)}`} />
            <MetaRow label={t('lbl.cashier')} value={sale.user?.name || '—'} />
            {sale.customer?.name && <MetaRow label={t('lbl.customer')} value={sale.customer.name} />}
          </div>

          <hr className="border-slate-200 my-4" />

          {/* Items */}
          <div className="mb-3 min-w-0">
            <div className="grid grid-cols-[40px_1fr_1fr_1fr] gap-2 pl-1 text-sm font-black text-black border-b-2 border-slate-200 pb-2 mb-3 text-right min-w-0">
              <span className="text-left">{rl('th.qty')}</span>
              <span className="text-right whitespace-nowrap">{rl('lbl.original_price')}</span>
              <span className="text-right whitespace-nowrap">{rl('lbl.our_price')}</span>
              <span className="text-right whitespace-nowrap">{rl('th.total')}</span>
            </div>
            {(sale.items || []).map((item, idx) => {
              const qty = Number(item.qty || 0);
              const unit = parseFloat(item.unit_price || 0);
              const origPrice = parseFloat(item.original_price || 0) || unit;
              const lineDiscount = parseFloat(item.discount || 0);
              const originalLineTotal = qty * unit;
              const reducedLineTotal = Math.max(0, originalLineTotal - lineDiscount);
              const ourUnit = qty > 0 ? Math.max(0, reducedLineTotal / qty) : unit;
              return (
              <div key={item.id} className="mb-3 min-w-0">
                <div className="text-sm font-bold text-black break-words" style={{ overflowWrap: 'anywhere' }}>{item.product_name}</div>
                <div className="grid grid-cols-[40px_1fr_1fr_1fr] gap-2 text-sm text-black font-semibold pl-1 mt-0.5 min-w-0 items-center">
                  <span className="text-left">{qty}</span>
                  <span className="text-right min-w-0 break-words">{fmt(origPrice)}</span>
                  <span className="text-right text-black min-w-0 break-words">{fmt(ourUnit)}</span>
                  <span className="text-right min-w-0 break-words">{fmt(reducedLineTotal)}</span>
                </div>
              </div>
            );
            })}
          </div>

          <hr className="border-slate-200 mb-4" />

          {/* Totals */}
          <div className="space-y-2">
            {(() => {
              const saved = (sale.items || []).reduce((acc, item) => {
                const orig = parseFloat(item.original_price || 0);
                const unit = parseFloat(item.unit_price || 0);
                const qty  = parseFloat(item.qty || 0);
                return orig > unit ? acc + (orig - unit) * qty : acc;
              }, 0);
              return saved > 0 ? (
                <div className="flex justify-between items-center border-2 border-black rounded-lg px-3 py-2">
                  <span className="text-black font-black text-base">{t('lbl.you_saved')}</span>
                  <span className="text-black font-black text-xl">{fmt(saved)}</span>
                </div>
              ) : null;
            })()}
            {parseFloat(sale.discount) > 0 && (
              <div className="flex justify-between items-center border-2 border-slate-300 rounded-xl px-4 py-3 bg-slate-50">
                <span className="text-black font-bold text-lg">{t('lbl.earned_profit')}</span>
                <span className="text-black font-extrabold text-xl">- {fmt(sale.discount)}</span>
              </div>
            )}

            {parseFloat(sale.tax) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-black font-semibold">{t('lbl.tax')}</span>
                <span className="font-bold text-black">{fmt(sale.tax)}</span>
              </div>
            )}

            <div className="flex justify-between items-baseline pt-1 border-t border-slate-100">
              <span className="text-base font-black text-black">{t('lbl.grand_total')}</span>
              <span className="text-xl font-black text-black">{currency} {fmt(sale.total)}</span>
            </div>

            {paidCash   > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-black font-semibold">{t('lbl.cash_paid')} ({t('lbl.cash')})</span>
                <span className="font-bold text-black">{fmt(cashGiven)}</span>
              </div>
            )}
            {paidCard   > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-black font-semibold">{t('lbl.cash_paid')} ({t('lbl.card')})</span>
                <span className="font-bold text-black">{fmt(paidCard)}</span>
              </div>
            )}
            {paidCredit > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-black font-semibold">{t('lbl.credit')}</span>
                <span className="font-bold text-black">{fmt(paidCredit)}</span>
              </div>
            )}
            {change > 0 && (
              <div className="flex justify-between text-sm font-bold text-black">
                <span>{t('lbl.change')}</span>
                <span>{fmt(change)}</span>
              </div>
            )}
          </div>

          <hr className="border-slate-200 my-5" />

          {/* Footer */}
          <div className="text-center leading-relaxed">
            <p className="text-[11px] font-semibold text-black">
              {shopInfo.receipt_footer || 'Thank you for shopping with us!'}
            </p>
            {true && (
              <p className="text-black font-bold text-[11px] mt-1">
                lumac.lk
              </p>
            )}
          </div>
        </div>

      </div>

      {/* ── Return modal ────────────────────────────────────────────────── */}
      {returnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto mx-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">{t('btn.return')}</h2>
              <span className="font-mono text-xs text-slate-400">{sale.invoice_no}</span>
            </div>
            <form onSubmit={handleReturn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Reason for return</label>
                <input value={returnReason} onChange={e => setReturnReason(e.target.value)} required
                  placeholder="Enter reason..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Select items to return</label>
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">{t('th.product')}</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500">{t('th.qty')}</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500">Return Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {returnItems.map((item, i) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 text-slate-700">{item.product_name}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{item.qty}</td>
                          <td className="px-3 py-2 text-right">
                            <input type="number" min="0" max={item.qty} step="0.001"
                              value={item.return_qty}
                              onChange={e => {
                                const v = e.target.value;
                                setReturnItems(ri => ri.map((r, idx) => idx === i ? { ...r, return_qty: v } : r));
                              }}
                              className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm text-right outline-none focus:ring-1 focus:ring-blue-500" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setReturnModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  {t('btn.cancel')}
                </button>
                <button type="submit" disabled={returning}
                  className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-60 hover:bg-red-700 transition-colors">
                  {returning ? t('lbl.loading') : t('btn.return')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm leading-snug min-w-0">
      <span className="text-black font-semibold pr-2 shrink-0">{label}</span>
      <span
        className={`ml-auto text-right font-bold text-black min-w-0 break-words ${mono ? 'font-mono' : ''}`}
        style={{ overflowWrap: 'anywhere' }}
      >
        {value}
      </span>
    </div>
  );
}
