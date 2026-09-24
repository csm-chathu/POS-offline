import { useState } from 'react';
import { useGetExtensionsQuery, useToggleExtensionMutation, useConfigureExtensionMutation, useGetExtensionConfigQuery } from '../features/extensions/extensionsApi';

const REGISTRY = [
  {
    key: 'sms_receipt',
    name: 'SMS Receipt',
    tagline: 'Send bills instantly via SMS',
    icon: '📱',
    gradient: 'from-blue-500 to-blue-600',
    category: 'Sales',
    description: 'Automatically offer to send the bill via SMS to the customer right after checkout. Powered by SMSGenz.',
    configFields: [
      { key: 'api_url',   label: 'API URL',   type: 'text',     placeholder: 'https://smsgenz.lk/api/send', hint: 'Full URL of the SMS gateway send endpoint' },
      { key: 'user_id',   label: 'User ID',   type: 'text',     placeholder: 'e.g. 1344' },
      { key: 'api_key',   label: 'API Key',   type: 'password', placeholder: 'e.g. 14d351ad-4d8b-4868-…' },
      { key: 'sender_id', label: 'Sender ID', type: 'text',     placeholder: 'e.g. RA GOLD' },
      { key: 'template',  label: 'Message Template', type: 'textarea',
        placeholder: 'Hi {customer}, your bill {invoice} at {shop} is Rs.{total}. Thank you!',
        hint: 'Variables: {customer} {invoice} {total} {shop}' },
    ],
  },
  {
    key: 'promo_sms',
    name: 'Promotional SMS',
    tagline: 'Reach customers with offers',
    icon: '📢',
    gradient: 'from-purple-500 to-purple-600',
    category: 'Marketing',
    description: 'Send bulk promotional messages to your customer list to boost sales and repeat visits.',
    configFields: [
      { key: 'user_id',   label: 'User ID',   type: 'text',     placeholder: 'e.g. 1344' },
      { key: 'api_key',   label: 'API Key',   type: 'password', placeholder: 'Your SMSGenz API key' },
      { key: 'sender_id', label: 'Sender ID', type: 'text',     placeholder: 'e.g. RA GOLD' },
    ],
  },
  {
    key: 'whatsapp_receipt',
    name: 'WhatsApp Receipt',
    tagline: 'Send receipts on WhatsApp',
    icon: '💬',
    gradient: 'from-green-500 to-emerald-600',
    category: 'Sales',
    description: 'Send the receipt via WhatsApp Business API after every checkout.',
    comingSoon: true,
  },
  {
    key: 'loyalty',
    name: 'Loyalty Points',
    tagline: 'Reward repeat customers',
    icon: '⭐',
    gradient: 'from-amber-400 to-orange-500',
    category: 'Sales',
    description: 'Award points on every purchase and let customers redeem them for discounts.',
    comingSoon: true,
  },
  {
    key: 'ai_analytics',
    name: 'AI Analytics',
    tagline: 'Smart sales insights',
    icon: '🤖',
    gradient: 'from-slate-600 to-slate-800',
    category: 'Reports',
    description: 'Smart sales insights, demand forecasting, and anomaly detection powered by AI.',
    comingSoon: true,
  },
  {
    key: 'accounting',
    name: 'Accounting',
    tagline: 'Full double-entry bookkeeping',
    icon: '📒',
    gradient: 'from-indigo-500 to-indigo-600',
    category: 'Reports',
    description: 'Chart of accounts, manual journal entries, and trial balance. Full double-entry bookkeeping built into your POS.',
    comingSoon: false,
  },
];

const CATEGORIES = ['All', 'Sales', 'Marketing', 'Reports'];

// ─── Configure modal ──────────────────────────────────────────────────────────
function ConfigModal({ ext, onClose }) {
  const { data: savedConfig, isLoading } = useGetExtensionConfigQuery(ext.key);
  const [configure, { isLoading: saving }] = useConfigureExtensionMutation();
  const [form, setForm] = useState(null);

  if (isLoading) return null;

  const current = form ?? savedConfig ?? {};
  const set = k => e => setForm(f => ({ ...(f ?? savedConfig ?? {}), [k]: e.target.value }));

  async function handleSave() {
    await configure({ key: ext.key, config: current });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Modal header with gradient */}
        <div className={`bg-gradient-to-r ${ext.gradient} px-6 py-5`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{ext.icon}</span>
              <div>
                <h2 className="font-bold text-white text-lg leading-tight">{ext.name}</h2>
                <p className="text-white/70 text-sm">Configure extension</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white transition-colors p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {(ext.configFields || []).map(f => (
            <div key={f.key}>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea
                  value={current[f.key] || ''}
                  onChange={set(f.key)}
                  rows={3}
                  placeholder={f.placeholder}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition"
                />
              ) : (
                <input
                  type={f.type}
                  value={current[f.key] || ''}
                  onChange={set(f.key)}
                  placeholder={f.placeholder}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              )}
              {f.hint && <p className="text-xs text-slate-400 mt-1">{f.hint}</p>}
            </div>
          ))}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className={`flex-1 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors disabled:opacity-60 bg-gradient-to-r ${ext.gradient} hover:opacity-90`}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Extension card ───────────────────────────────────────────────────────────
function ExtCard({ ext, dbState, onConfigure }) {
  const [toggle, { isLoading: toggling }] = useToggleExtensionMutation();
  const enabled = dbState?.enabled ?? false;

  return (
    <div className={`rounded-2xl overflow-hidden border transition-all duration-200 flex flex-col bg-white dark:bg-[#1e1e1e]
      ${ext.comingSoon ? 'opacity-60 border-slate-100 dark:border-slate-800' : enabled ? 'border-transparent ring-2 ring-blue-500/40 shadow-lg' : 'border-slate-200 dark:border-slate-700 hover:shadow-md'}`}>

      {/* Gradient header — icon left, toggle right */}
      <div className={`bg-gradient-to-r ${ext.gradient} px-5 py-4`}>
        <div className="flex items-center justify-between">
          <span className="text-3xl leading-none">{ext.icon}</span>
          <div className="flex items-center gap-2">
            {enabled && !ext.comingSoon && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/20 text-white">
                <span className="w-1.5 h-1.5 rounded-full bg-green-300" /> Active
              </span>
            )}
            {ext.comingSoon && (
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/20 text-white">
                Coming Soon
              </span>
            )}
            {!ext.comingSoon && (
              <button
                disabled={toggling}
                onClick={() => toggle({ key: ext.key })}
                style={{ width: 44, height: 24, position: 'relative', borderRadius: 999, flexShrink: 0,
                  background: enabled ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
                  transition: 'background 0.2s', opacity: toggling ? 0.5 : 1 }}
              >
                <span style={{
                  position: 'absolute', top: 2, width: 20, height: 20,
                  left: enabled ? 22 : 2,
                  background: '#fff', borderRadius: '50%',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  transition: 'left 0.2s',
                }} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="p-5 flex flex-col flex-1">
        <p className="font-bold text-slate-800 dark:text-white">{ext.name}</p>
        <p className="text-xs text-slate-400 mt-0.5 mb-3">{ext.tagline}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed flex-1">{ext.description}</p>

        {!ext.comingSoon && enabled && ext.configFields?.length > 0 && (
          <button onClick={() => onConfigure(ext)}
            className={`mt-4 w-full py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-r ${ext.gradient} hover:opacity-90 transition-opacity`}>
            Configure
          </button>
        )}
        {!ext.comingSoon && !enabled && (
          <button disabled={toggling} onClick={() => toggle({ key: ext.key })}
            className="mt-4 w-full py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors disabled:opacity-50">
            Enable
          </button>
        )}
        {ext.comingSoon && (
          <div className="mt-4 w-full py-2.5 text-sm font-semibold text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-xl text-center cursor-default">
            Not yet available
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Extensions() {
  const { data: dbState = {}, isLoading } = useGetExtensionsQuery();
  const [configuring, setConfiguring] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');

  const activeCount  = REGISTRY.filter(e => !e.comingSoon && dbState[e.key]?.enabled).length;
  const filtered     = activeCategory === 'All' ? REGISTRY : REGISTRY.filter(e => e.category === activeCategory);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Extensions</h1>
          <p className="text-sm text-slate-500 mt-1">Plug in extra features to extend your POS capabilities.</p>
        </div>
        {activeCount > 0 && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-2 self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-sm font-semibold text-blue-700">{activeCount} active extension{activeCount > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150
              ${activeCategory === cat
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-white text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300'}`}>
            {cat}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <svg className="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <p className="text-sm text-slate-400">Loading extensions…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(ext => (
            <ExtCard key={ext.key} ext={ext} dbState={dbState[ext.key]} onConfigure={setConfiguring} />
          ))}
        </div>
      )}

      {configuring && (
        <ConfigModal ext={configuring} onClose={() => setConfiguring(null)} />
      )}
    </div>
  );
}
