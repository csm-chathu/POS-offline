import { useState, useEffect } from 'react';
import DatePicker from '../../components/DatePicker';
import { Link, useNavigate } from 'react-router-dom';
import { useGetSalesQuery } from '../../features/sales/salesApi';
import { useSelector } from 'react-redux';
import { selectRole } from '../../features/auth/authSlice';
import { useConnectivity } from '../../contexts/ConnectivityContext';

const fmt     = n => 'Rs. ' + Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 });
const fmtDate = s => new Date(s).toLocaleDateString('en-LK');
const fmtTime = s => new Date(s).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' });

const STATUS_CLS = { completed: 'bg-green-100 text-green-700', held: 'bg-yellow-100 text-yellow-700', returned: 'bg-red-100 text-red-700' };
const METHOD_CLS = { cash: 'bg-green-100 text-green-700', card: 'bg-blue-100 text-blue-700', qr: 'bg-purple-100 text-purple-700', credit: 'bg-red-100 text-red-600', day_end: 'bg-slate-100 text-slate-700' };

function StatusBadge({ status }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${STATUS_CLS[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>;
}

function PayBadges({ payments }) {
  if (!payments?.length) return <span className="text-slate-400">—</span>;
  const methods = [...new Set(payments.map(p => p.method))];
  return (
    <span className="flex flex-wrap gap-1 justify-center">
      {methods.map(m => (
        <span key={m} className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${METHOD_CLS[m] || 'bg-slate-100 text-slate-600'}`}>{m}</span>
      ))}
    </span>
  );
}

export default function InvoicesIndex() {
  const role      = useSelector(selectRole);
  const canDelete = role === 'admin';
  const { isOnline } = useConnectivity();

  const [search, setSearch]   = useState('');
  const [date, setDate]       = useState('');
  const [method, setMethod]   = useState('');
  const [page, setPage]       = useState(1);
  const [applied, setApplied] = useState({});

  const { data, isLoading } = useGetSalesQuery({ ...applied, page }, { skip: !isOnline });
  const rows = data?.data || [];

  useEffect(() => {
    if (search.length === 0) { setApplied(a => ({ ...a, search: '' })); setPage(1); return; }
    if (search.length < 3) return;
    const t = setTimeout(() => { setApplied(a => ({ ...a, search })); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  function handleSearch(e) {
    e.preventDefault();
    if (search.length === 0 || search.length >= 3) { setApplied({ search, date, method }); setPage(1); }
  }

  // Windowed pagination
  function PageNav() {
    if (!data || data.last_page <= 1) return null;
    const last = data.last_page;
    const visible = new Set([1, last]);
    for (let p = Math.max(1, page - 2); p <= Math.min(last, page + 2); p++) visible.add(p);
    const sorted = [...visible].sort((a, b) => a - b);
    const pages = [];
    sorted.forEach((p, i) => { if (i > 0 && p - sorted[i-1] > 1) pages.push('…'); pages.push(p); });
    return (
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
        <span>{data.total} entries</span>
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => setPage(p => p-1)} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">‹</button>
          {pages.map((p, i) => p === '…'
            ? <span key={`e${i}`} className="px-2 text-slate-400">…</span>
            : <button key={p} onClick={() => setPage(p)} className={`px-3 py-1 rounded-lg border transition-colors ${p === page ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 hover:bg-slate-50'}`}>{p}</button>
          )}
          <button disabled={page >= last} onClick={() => setPage(p => p+1)} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">›</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Day End</h1>
          <p className="text-xs text-slate-400 mt-0.5">Daily stock entries</p>
        </div>
        <Link to="/invoices/create"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          New Day End Entry
        </Link>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-40">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Entry No</label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="INV-0001"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          {search.length === 1 && <p className="text-[11px] text-slate-400 mt-1">Type 2 more characters…</p>}
          {search.length === 2 && <p className="text-[11px] text-slate-400 mt-1">Type 1 more character…</p>}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
          <DatePicker value={date} onChange={setDate}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Method</label>
          <select value={method} onChange={e => setMethod(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">All</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="credit">Credit</option>
            <option value="qr">QR</option>
          </select>
        </div>
        <button type="submit" className="px-4 py-2 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors">Search</button>
        {Object.values(applied).some(Boolean) && (
          <button type="button" onClick={() => { setApplied({}); setSearch(''); setDate(''); setMethod(''); setPage(1); }}
            className="px-4 py-2 border border-slate-200 text-sm text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
            Clear
          </button>
        )}
      </form>

      {/* Desktop table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-200 border-b border-slate-300 text-xs text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Invoice</th>
                  <th className="px-4 py-3 text-left font-semibold">Date / Time</th>
                  <th className="px-4 py-3 text-left font-semibold">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold">Cashier</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-center font-semibold">Method</th>
                  <th className="px-4 py-3 text-center font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.id} className="odd:bg-white even:bg-slate-50 hover:bg-blue-50 border-b border-slate-100 transition-colors">
                    <td className="px-4 py-3 font-mono text-blue-600 font-semibold">{s.invoice_no}</td>
                    <td className="px-4 py-3 text-slate-500">
                      <p>{fmtDate(s.created_at)}</p>
                      <p className="text-xs text-slate-400">{fmtTime(s.created_at)}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.customer?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{s.user?.name || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(s.total)}</td>
                    <td className="px-4 py-3 text-center"><PayBadges payments={s.payments} /></td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/invoices/${s.id}`}
                        className="inline-flex items-center px-2.5 py-1 rounded-md border border-blue-200 bg-blue-50 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No invoices found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <PageNav />
      </div>
    </div>
  );
}
