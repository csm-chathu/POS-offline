import { useState } from 'react';
import {
  useGetAccountsQuery,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useGetEntriesQuery,
  useCreateEntryMutation,
  useDeleteEntryMutation,
  useGetTrialBalanceQuery,
  useGetStockValueQuery,
  useGetOpeningBalanceStatusQuery,
  useCreateOpeningBalanceMutation,
} from '../features/accounting/accountingApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TYPE_COLORS = {
  Asset:     'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Liability: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  Equity:    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  Revenue:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  Expense:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Opening Balance Wizard ───────────────────────────────────────────────────
const OB_ASSETS = [
  { code: '1000', label: 'Cash',                key: 'cash' },
  { code: '1100', label: 'Bank',                key: 'bank' },
  { code: '1200', label: 'Accounts Receivable', key: 'ar'   },
  { code: '1300', label: 'Inventory',           key: 'inv', autoFetch: true },
];

function OpeningBalanceWizard({ accounts, onClose, onDone }) {
  const { data: stockData } = useGetStockValueQuery();
  const [create, { isLoading }] = useCreateOpeningBalanceMutation();

  const [step, setStep] = useState(1);
  const [date, setDate] = useState(today());
  const [amounts, setAmounts] = useState({});
  const [error, setError] = useState('');

  // Pre-fill inventory from stock value once loaded
  const stockValue = stockData?.value ?? 0;
  function getAmount(key) {
    if (key === 'inv' && amounts.inv === undefined) return stockValue > 0 ? String(stockValue) : '';
    return amounts[key] ?? '';
  }
  function setAmount(key, val) {
    setAmounts(a => ({ ...a, [key]: val }));
  }

  const totalAssets = OB_ASSETS.reduce((s, a) => s + Number(getAmount(a.key) || 0), 0);

  // Map code → account id
  const accountByCode = Object.fromEntries((accounts || []).map(a => [a.code, a]));
  const equityAccount = accountByCode['3000'];

  function buildLines() {
    const lines = [];
    for (const a of OB_ASSETS) {
      const val = Number(getAmount(a.key) || 0);
      if (!val) continue;
      const acc = accountByCode[a.code];
      if (!acc) continue;
      lines.push({ account_id: acc.id, debit: val, credit: 0, label: `${acc.code} — ${acc.name}` });
    }
    if (equityAccount && totalAssets > 0) {
      lines.push({ account_id: equityAccount.id, debit: 0, credit: totalAssets, label: `${equityAccount.code} — ${equityAccount.name}` });
    }
    return lines;
  }

  async function handlePost() {
    setError('');
    const lines = buildLines();
    if (!lines.length || totalAssets <= 0) { setError('Enter at least one asset amount.'); return; }
    if (!equityAccount) { setError("Owner's Equity account (3000) not found. Load accounts first."); return; }
    try {
      await create({ date, lines: lines.map(l => ({ account_id: l.account_id, debit: l.debit, credit: l.credit })) }).unwrap();
      onDone();
    } catch (err) {
      setError(err?.data?.error || 'Failed to post opening balance');
    }
  }

  const lines = buildLines();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6">
      <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-5 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-white text-lg">
              {step === 1 ? '🏦 Opening Balance' : '📋 Review & Post'}
            </h2>
            <p className="text-white/70 text-xs mt-0.5">Step {step} of 2</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl">{error}</p>}

          {step === 1 && (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Enter your current cash and asset balances. The total will be credited to <span className="font-semibold text-slate-700 dark:text-slate-200">Owner's Equity (3000)</span>.
              </p>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">As of Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252525] text-slate-800 dark:text-slate-100 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition" />
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="bg-slate-50 dark:bg-[#252525] px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Asset Balances</div>
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {OB_ASSETS.map(a => (
                    <div key={a.key} className="flex items-center gap-4 px-4 py-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{a.label}</p>
                        <p className="text-xs text-slate-400">{a.code}</p>
                      </div>
                      <div className="relative w-36">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">Rs.</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={getAmount(a.key)}
                          onChange={e => setAmount(a.key, e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-[#1a1a1a] text-slate-800 dark:text-slate-100 text-sm text-right outline-none focus:ring-2 focus:ring-indigo-500 transition"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 flex items-center justify-between border-t border-indigo-100 dark:border-indigo-800">
                  <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">Total Assets</span>
                  <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">Rs. {fmt(totalAssets)}</span>
                </div>
              </div>

              {totalAssets > 0 && (
                <div className="rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">Owner's Equity (3000)</p>
                    <p className="text-xs text-purple-500">Auto-calculated credit</p>
                  </div>
                  <span className="text-sm font-bold text-purple-700 dark:text-purple-300">Rs. {fmt(totalAssets)}</span>
                </div>
              )}

              {stockData && stockData.count > 0 && (
                <p className="text-xs text-slate-400">
                  💡 Inventory auto-filled from {stockData.count} products (cost × qty = Rs. {fmt(stockValue)})
                </p>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Review the journal entry below. Once posted it <span className="font-semibold text-slate-700 dark:text-slate-200">cannot be posted again</span>.
              </p>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="bg-slate-50 dark:bg-[#252525] px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Opening Balance Entry</span>
                  <span className="text-xs text-slate-400">{date}</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-[#252525] border-t border-slate-100 dark:border-slate-700">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400">Account</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400 w-28">Debit</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400 w-28">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {lines.map((l, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/5">
                        <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{l.label}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-blue-600 dark:text-blue-400">
                          {l.debit > 0 ? fmt(l.debit) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-green-600 dark:text-green-400">
                          {l.credit > 0 ? fmt(l.credit) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-[#252525]">
                    <tr>
                      <td className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300">Total</td>
                      <td className="px-4 py-2 text-right text-xs font-bold font-mono text-green-600 dark:text-green-400">{fmt(totalAssets)} ✓</td>
                      <td className="px-4 py-2 text-right text-xs font-bold font-mono text-green-600 dark:text-green-400">{fmt(totalAssets)} ✓</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 flex items-start gap-2">
                <span className="text-base shrink-0">⚠️</span>
                <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                  This entry will be posted with reference <span className="font-mono font-bold">OPENING-BALANCE</span>. You can only post the opening balance once.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6 pt-3 shrink-0 border-t border-slate-100 dark:border-slate-700">
          {step === 1 ? (
            <>
              <button onClick={onClose}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={() => { setError(''); setStep(2); }} disabled={totalAssets <= 0}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                Review & Post
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStep(1)}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                Back
              </button>
              <button onClick={handlePost} disabled={isLoading}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors disabled:opacity-60">
                {isLoading ? 'Posting…' : '✓ Post Opening Balance'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add Account Modal ────────────────────────────────────────────────────────
function AddAccountModal({ onClose }) {
  const [form, setForm] = useState({ code: '', name: '', type: 'Asset', description: '' });
  const [create, { isLoading }] = useCreateAccountMutation();
  const [error, setError] = useState('');

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await create(form).unwrap();
      onClose();
    } catch (err) {
      setError(err?.data?.error || 'Failed to create account');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-5 flex items-center justify-between">
          <h2 className="font-bold text-white text-lg">Add Account</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl">{error}</p>}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Code</label>
            <input value={form.code} onChange={set('code')} required placeholder="e.g. 1500"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252525] text-slate-800 dark:text-slate-100 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Name</label>
            <input value={form.name} onChange={set('name')} required placeholder="e.g. Petty Cash"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252525] text-slate-800 dark:text-slate-100 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Type</label>
            <select value={form.type} onChange={set('type')}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252525] text-slate-800 dark:text-slate-100 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition">
              {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Description</label>
            <input value={form.description} onChange={set('description')} placeholder="Optional description"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252525] text-slate-800 dark:text-slate-100 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isLoading}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-60">
              {isLoading ? 'Saving…' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── New Journal Entry Modal ──────────────────────────────────────────────────
function NewEntryModal({ accounts, onClose }) {
  const [form, setForm] = useState({ date: today(), description: '', reference: '' });
  const [lines, setLines] = useState([
    { account_id: '', memo: '', debit: '', credit: '' },
    { account_id: '', memo: '', debit: '', credit: '' },
  ]);
  const [create, { isLoading }] = useCreateEntryMutation();
  const [error, setError] = useState('');

  const setForm_ = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  function setLine(i, k, v) {
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  }

  function addLine() {
    setLines(ls => [...ls, { account_id: '', memo: '', debit: '', credit: '' }]);
  }

  function removeLine(i) {
    if (lines.length <= 2) return;
    setLines(ls => ls.filter((_, idx) => idx !== i));
  }

  const totalDebit  = lines.reduce((s, l) => s + Number(l.debit  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!balanced) { setError('Debits must equal credits'); return; }
    const validLines = lines.filter(l => l.account_id);
    if (validLines.length < 2) { setError('At least 2 lines required'); return; }
    try {
      await create({ ...form, lines: validLines }).unwrap();
      onClose();
    } catch (err) {
      setError(err?.data?.error || 'Failed to save entry');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6">
      <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-5 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-white text-lg">New Journal Entry</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl">{error}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Date</label>
                <input type="date" value={form.date} onChange={setForm_('date')} required
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252525] text-slate-800 dark:text-slate-100 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <input value={form.description} onChange={setForm_('description')} required placeholder="e.g. Monthly rent payment"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252525] text-slate-800 dark:text-slate-100 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Reference <span className="font-normal text-slate-400">(optional)</span></label>
              <input value={form.reference} onChange={setForm_('reference')} placeholder="e.g. INV-001, CHQ-123"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252525] text-slate-800 dark:text-slate-100 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition" />
            </div>

            {/* Lines table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Journal Lines</p>
                <button type="button" onClick={addLine}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                  Add Line
                </button>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-[#252525]">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 w-[35%]">Account</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Memo</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-24">Debit</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 w-24">Credit</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {lines.map((line, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5">
                          <select value={line.account_id} onChange={e => setLine(i, 'account_id', e.target.value)}
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-[#1a1a1a] text-slate-800 dark:text-slate-100 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="">Select account</option>
                            {accounts.map(a => (
                              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <input value={line.memo} onChange={e => setLine(i, 'memo', e.target.value)} placeholder="memo"
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-[#1a1a1a] text-slate-800 dark:text-slate-100 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" min="0" step="0.01" value={line.debit} onChange={e => setLine(i, 'debit', e.target.value)} placeholder="0.00"
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-[#1a1a1a] text-slate-800 dark:text-slate-100 px-2 py-1.5 text-xs text-right outline-none focus:ring-2 focus:ring-indigo-500" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" min="0" step="0.01" value={line.credit} onChange={e => setLine(i, 'credit', e.target.value)} placeholder="0.00"
                            className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-[#1a1a1a] text-slate-800 dark:text-slate-100 px-2 py-1.5 text-xs text-right outline-none focus:ring-2 focus:ring-indigo-500" />
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          <button type="button" onClick={() => removeLine(i)} className="text-slate-300 hover:text-red-500 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-[#252525] border-t border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-slate-500">Totals</td>
                      <td className={`px-3 py-2 text-right text-xs font-bold ${balanced ? 'text-green-600' : 'text-red-500'}`}>{fmt(totalDebit)}</td>
                      <td className={`px-3 py-2 text-right text-xs font-bold ${balanced ? 'text-green-600' : 'text-red-500'}`}>{fmt(totalCredit)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!balanced && totalDebit > 0 && (
                <p className="text-xs text-red-500 mt-1">
                  Difference: {fmt(Math.abs(totalDebit - totalCredit))}
                </p>
              )}
              {balanced && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                  Balanced
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3 px-6 pb-6 pt-3 shrink-0 border-t border-slate-100 dark:border-slate-700">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isLoading || !balanced}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-60">
              {isLoading ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Account type accordion section ──────────────────────────────────────────
const TYPE_META = {
  Asset:     { bg: 'bg-blue-50 dark:bg-blue-900/20',   border: 'border-blue-200 dark:border-blue-800',   icon: '🏦', dot: 'bg-blue-500' },
  Liability: { bg: 'bg-red-50 dark:bg-red-900/20',     border: 'border-red-200 dark:border-red-800',     icon: '📋', dot: 'bg-red-500'  },
  Equity:    { bg: 'bg-purple-50 dark:bg-purple-900/20',border: 'border-purple-200 dark:border-purple-800',icon: '💼', dot: 'bg-purple-500'},
  Revenue:   { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800', icon: '💰', dot: 'bg-green-500' },
  Expense:   { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', icon: '💸', dot: 'bg-amber-500' },
};

function AccountGroup({ type, accounts }) {
  const [open, setOpen] = useState(true);
  const meta = TYPE_META[type] || {};

  return (
    <div className={`rounded-2xl border ${meta.border} overflow-hidden mb-3`}>
      {/* Group header */}
      <button onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-5 py-3.5 ${meta.bg} transition-colors`}>
        <div className="flex items-center gap-3">
          <span className="text-lg leading-none">{meta.icon}</span>
          <span className="font-bold text-slate-800 dark:text-white">{type}</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/60 dark:bg-white/10 text-slate-600 dark:text-slate-300">
            {accounts.length}
          </span>
        </div>
        <svg className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {/* Account rows */}
      {open && (
        <div className="bg-white dark:bg-[#1e1e1e]">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-[#252525]">
              <tr>
                <th className="px-5 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">Code</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Description</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider w-20">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {accounts.map(acc => (
                <tr key={acc.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                      <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">{acc.code}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{acc.name}</td>
                  <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{acc.description || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${acc.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-400'}`}>
                      {acc.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Accounts Tab ─────────────────────────────────────────────────────────────
function AccountsTab() {
  const { data: accounts = [], isLoading } = useGetAccountsQuery();
  const [showAdd, setShowAdd] = useState(false);

  if (isLoading) return <Spinner />;

  const grouped = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].map(type => ({
    type,
    accounts: accounts.filter(a => a.type === type).sort((a, b) => a.code.localeCompare(b.code)),
  })).filter(g => g.accounts.length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">{accounts.length} accounts</p>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          Add Account
        </button>
      </div>

      {grouped.map(g => <AccountGroup key={g.type} type={g.type} accounts={g.accounts} />)}
      {accounts.length === 0 && <div className="py-16 text-center text-slate-400 text-sm">No accounts found.</div>}

      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

// ─── Journal Entries Tab ──────────────────────────────────────────────────────
function EntriesTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetEntriesQuery({ page, limit: 20 });
  const { data: accounts = [] } = useGetAccountsQuery();
  const [deleteEntry] = useDeleteEntryMutation();
  const [showNew, setShowNew] = useState(false);

  const entries = data?.data || [];
  const totalPages = data?.pages || 1;

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">{data?.total || 0} entries</p>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          New Entry
        </button>
      </div>

      <div className="space-y-3">
        {entries.length === 0 && (
          <div className="py-16 text-center text-slate-400 text-sm rounded-2xl border border-slate-200 dark:border-slate-700">
            No journal entries yet. Click "New Entry" to create one.
          </div>
        )}
        {entries.map(entry => {
          const total = entry.lines?.reduce((s, l) => s + Number(l.debit || 0), 0) || 0;
          return (
            <div key={entry.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e1e1e] overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                    <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 13h.01M13 13h.01M17 13h.01M17 9h.01M13 9h.01M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{entry.description}</p>
                    <p className="text-xs text-slate-400">{entry.date}{entry.reference ? ` · ${entry.reference}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-bold text-slate-700 dark:text-slate-200 text-sm">{fmt(total)}</p>
                  <button onClick={() => { if (window.confirm('Delete this entry?')) deleteEntry(entry.id); }}
                    className="text-slate-300 hover:text-red-500 transition-colors p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              </div>
              {entry.lines && entry.lines.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {entry.lines.map((line, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/5">
                          <td className="px-4 py-2 text-slate-500 dark:text-slate-400 w-8">{i + 1}</td>
                          <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">
                            {line.account ? `${line.account.code} — ${line.account.name}` : `Account #${line.account_id}`}
                          </td>
                          <td className="px-4 py-2 text-slate-400">{line.memo || ''}</td>
                          <td className="px-4 py-2 text-right font-mono text-slate-700 dark:text-slate-300 w-28">
                            {Number(line.debit) > 0 ? <span className="text-blue-600 dark:text-blue-400">Dr {fmt(line.debit)}</span> : ''}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-slate-700 dark:text-slate-300 w-28">
                            {Number(line.credit) > 0 ? <span className="text-green-600 dark:text-green-400">Cr {fmt(line.credit)}</span> : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-slate-600 dark:text-slate-300">
            Previous
          </button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-slate-600 dark:text-slate-300">
            Next
          </button>
        </div>
      )}

      {showNew && <NewEntryModal accounts={accounts} onClose={() => setShowNew(false)} />}
    </div>
  );
}

// ─── Trial Balance Tab ────────────────────────────────────────────────────────
function TrialBalanceTab() {
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');
  const params = from && to ? { from, to } : {};
  const { data: rows = [], isLoading } = useGetTrialBalanceQuery(params);

  const types = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
  const grouped = types.reduce((acc, t) => {
    acc[t] = rows.filter(r => r.type === t);
    return acc;
  }, {});

  const totalDebit  = rows.reduce((s, r) => s + Number(r.debit  || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit || 0), 0);

  if (isLoading) return <Spinner />;

  return (
    <div>
      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252525] text-slate-800 dark:text-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252525] text-slate-800 dark:text-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition" />
        </div>
        {(from || to) && (
          <button onClick={() => { setFrom(''); setTo(''); }} className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            Clear
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-[#252525]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">Code</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Account</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Debit</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Credit</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Balance</th>
            </tr>
          </thead>
          <tbody>
            {types.map(type => {
              const group = grouped[type];
              if (!group.length) return null;
              const groupDebit  = group.reduce((s, r) => s + Number(r.debit  || 0), 0);
              const groupCredit = group.reduce((s, r) => s + Number(r.credit || 0), 0);
              return (
                <>
                  <tr key={`${type}-header`} className="bg-slate-100 dark:bg-[#252525]">
                    <td colSpan={5} className="px-4 py-2">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${TYPE_COLORS[type]}`}>{type}</span>
                    </td>
                  </tr>
                  {group.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-white/5 border-t border-slate-100 dark:border-slate-800 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{row.code}</td>
                      <td className="px-4 py-2.5 text-slate-800 dark:text-slate-100">{row.name}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">{row.debit > 0 ? fmt(row.debit) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">{row.credit > 0 ? fmt(row.credit) : '—'}</td>
                      <td className={`px-4 py-2.5 text-right font-mono font-semibold ${row.balance >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'}`}>
                        {fmt(Math.abs(row.balance))}{row.balance < 0 ? ' Cr' : ''}
                      </td>
                    </tr>
                  ))}
                  <tr key={`${type}-subtotal`} className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1a1a1a]">
                    <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-slate-500">Subtotal — {type}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-slate-700 dark:text-slate-300 font-mono">{fmt(groupDebit)}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-slate-700 dark:text-slate-300 font-mono">{fmt(groupCredit)}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-slate-700 dark:text-slate-300 font-mono">{fmt(groupDebit - groupCredit)}</td>
                  </tr>
                </>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-[#252525]">
            <tr>
              <td colSpan={2} className="px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200">Total</td>
              <td className="px-4 py-3 text-right font-bold font-mono text-slate-800 dark:text-slate-100">{fmt(totalDebit)}</td>
              <td className="px-4 py-3 text-right font-bold font-mono text-slate-800 dark:text-slate-100">{fmt(totalCredit)}</td>
              <td className={`px-4 py-3 text-right font-bold font-mono ${Math.abs(totalDebit - totalCredit) < 0.01 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {fmt(Math.abs(totalDebit - totalCredit))}
                {Math.abs(totalDebit - totalCredit) < 0.01 && (
                  <span className="ml-1 text-xs font-semibold">✓</span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
        {rows.length === 0 && (
          <div className="py-16 text-center text-slate-400 text-sm">No data found for the selected period.</div>
        )}
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <svg className="w-8 h-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      <p className="text-sm text-slate-400">Loading…</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const TABS = ['Accounts', 'Journal Entries', 'Trial Balance'];

export default function Accounting() {
  const [tab, setTab] = useState('Accounts');
  const [showObWizard, setShowObWizard] = useState(false);
  const { data: obStatus } = useGetOpeningBalanceStatusQuery();
  const { data: accounts = [] } = useGetAccountsQuery();

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="text-2xl">📒</span> Accounting
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Double-entry bookkeeping — chart of accounts, journal entries, and trial balance.</p>
        </div>
        <div className="flex items-center gap-3">
          {obStatus?.exists ? (
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm font-semibold text-green-700 dark:text-green-400">Opening balance posted</span>
            </div>
          ) : (
            <button onClick={() => setShowObWizard(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm">
              <span className="text-base leading-none">🏦</span>
              Set Opening Balance
            </button>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 mb-6 bg-slate-100 dark:bg-[#252525] p-1 rounded-2xl w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150
              ${tab === t
                ? 'bg-white dark:bg-[#1e1e1e] text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Accounts'        && <AccountsTab />}
      {tab === 'Journal Entries' && <EntriesTab />}
      {tab === 'Trial Balance'   && <TrialBalanceTab />}

      {showObWizard && (
        <OpeningBalanceWizard
          accounts={accounts}
          onClose={() => setShowObWizard(false)}
          onDone={() => setShowObWizard(false)}
        />
      )}
    </div>
  );
}
