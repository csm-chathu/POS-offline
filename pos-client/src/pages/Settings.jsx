import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { api } from '../app/baseApi';
import { selectToken } from '../features/auth/authSlice';
import { getApiUrl } from '../config/runtimeConfig';
import { useLocale } from '../contexts/LocaleContext';

const settingsApi = api.injectEndpoints({
  endpoints: build => ({
    getSettings: build.query({ query: () => '/settings', providesTags: ['Settings'] }),
    saveSettings: build.mutation({
      query: body => ({ url: '/settings', method: 'POST', body }),
      invalidatesTags: ['Settings'],
    }),
  }),
  overrideExisting: false,
});

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, color = 'bg-blue-600' }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative inline-flex w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${checked ? color : 'bg-slate-200'}`}>
      <span className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 mt-0.5 ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function Card({ title, icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {title && (
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            {icon && <span>{icon}</span>}{title}
          </h2>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition';

const SIDEBAR_THEMES = [
  { value: 'slate',  color: '#1e293b', label: 'Slate' },
  { value: 'black',  color: '#111111', label: 'Black' },
  { value: 'green',  color: '#14532d', label: 'Forest' },
  { value: 'teal',   color: '#134e4a', label: 'Teal' },
  { value: 'purple', color: '#3b0764', label: 'Purple' },
  { value: 'coffee', color: '#292018', label: 'Coffee' },
];

const PRIMARY_COLORS = [
  { value: 'blue',   color: '#3b82f6', label: 'Blue' },
  { value: 'green',  color: '#22c55e', label: 'Green' },
  { value: 'purple', color: '#a855f7', label: 'Purple' },
  { value: 'orange', color: '#f97316', label: 'Orange' },
  { value: 'red',    color: '#ef4444', label: 'Red' },
  { value: 'teal',   color: '#14b8a6', label: 'Teal' },
];

const LANGS = [
  { value: 'si', label: 'සිංහල' },
  { value: 'en', label: 'English' },
  { value: 'ta', label: 'தமிழ்' },
];

function LangPicker({ value, onChange }) {
  return (
    <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
      {LANGS.map(l => (
        <button key={l.value} type="button" onClick={() => onChange(l.value)}
          className={`px-4 py-1.5 text-sm font-medium transition-colors ${value === l.value ? 'bg-green-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

export default function Settings() {
  const { data, isLoading } = settingsApi.useGetSettingsQuery();
  const [save, { isLoading: saving }] = settingsApi.useSaveSettingsMutation();
  const [form, setForm]     = useState({});
  const [saved, setSaved]   = useState(false);
  const [backing, setBacking] = useState(false);
  const logoInputRef        = useRef(null);
  const { setLocale, t }    = useLocale();
  const token               = useSelector(selectToken);

  async function handleBackup() {
    setBacking(true);
    try {
      const res = await fetch(`${getApiUrl()}/settings/backup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Backup failed');
      const blob = await res.blob();
      const cd   = res.headers.get('Content-Disposition') || '';
      const name = cd.match(/filename="([^"]+)"/)?.[1] || 'backup.sql';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(e.message);
    } finally {
      setBacking(false);
    }
  }

  useEffect(() => {
    if (data) {
      const merged = {
        shop_name:           '',
        address:             '',
        phone:               '',
        email:               '',
        default_login_email:    '',
        use_manager_dashboard:  'false',
        currency:          'Rs.',
        tax_rate:          '0',
        receipt_note:      '',
        shop_logo:         '',
        demo_mode:         'false',
        interface_language:'en',
        receipt_language:  'en',
        sidebar_theme:     'slate',
        primary_color:     'blue',
        show_price_label:  'true',
        auto_print:        'false',
        pos_auto_scale:    '1',
        pos_scale_value:   '100',
        pos_interface:     '1',
        ...data,
      };
      setForm(merged);
      if (merged.pos_interface) localStorage.setItem('pos_interface', merged.pos_interface);
      localStorage.setItem('use_manager_dashboard', merged.use_manager_dashboard || 'false');
    }
  }, [data]);

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
    if (key === 'interface_language') setLocale(val);
    if (key === 'pos_interface') localStorage.setItem('pos_interface', val);
    if (key === 'use_manager_dashboard') localStorage.setItem('use_manager_dashboard', val);
  }
  const bool = key => form[key] === 'true' || form[key] === true;

  async function handleSubmit(e) {
    e.preventDefault();
    await save(form).unwrap().catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Max 2 MB'); return; }
    const reader = new FileReader();
    reader.onload = ev => set('shop_logo', ev.target.result);
    reader.readAsDataURL(file);
  }

  if (isLoading) return <div className="p-8 text-slate-400 text-sm">{t('lbl.loading')}</div>;

  return (
    <form onSubmit={handleSubmit} className="p-3 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">{t('page.settings')}</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600 font-semibold">✓ {t('btn.save')}!</span>}
          <button type="button" onClick={handleBackup} disabled={backing}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-50 disabled:opacity-60 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            {backing ? 'Backing up…' : 'Backup DB'}
          </button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm">
            {saving ? t('lbl.loading') : t('set.save')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Shop Information */}
          <Card title={t('set.shop_info')}>
            {/* Logo */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-700 mb-2">{t('set.logo')}</label>
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50 shrink-0">
                  {form.shop_logo ? (
                    <img src={form.shop_logo} alt="logo" className="w-full h-full object-contain" />
                  ) : (
                    <svg className="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16m-2-2l1.586-1.586a2 2 0 0 1 2.828 0L20 14M14 8h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/>
                    </svg>
                  )}
                </div>
                <div className="space-y-2">
                  <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoUpload} />
                  <button type="button" onClick={() => logoInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1M12 12V4m0 0L8 8m4-4 4 4"/></svg>
                    {t('btn.add')}
                  </button>
                  {form.shop_logo && (
                    <button type="button" onClick={() => set('shop_logo', '')}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16"/></svg>
                      {t('btn.delete')}
                    </button>
                  )}
                  <p className="text-xs text-slate-400">PNG / JPG · max 2 MB</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Field label={t('set.shop_name')}>
                <input value={form.shop_name ?? ''} onChange={e => set('shop_name', e.target.value)} className={inputCls} />
              </Field>
              <Field label={t('set.address')}>
                <textarea value={form.address ?? ''} onChange={e => set('address', e.target.value)} rows={2} className={inputCls + ' resize-none'} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={t('set.phone')}>
                  <input value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} className={inputCls} />
                </Field>
                <Field label={t('set.email')}>
                  <input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} className={inputCls} />
                </Field>
              </div>
              <Field label="Default Login Email">
                <input type="email" value={form.default_login_email ?? ''} onChange={e => set('default_login_email', e.target.value)} placeholder="Pre-filled email on login page" className={inputCls} />
              </Field>
            </div>
          </Card>

          {/* Demo Mode */}
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-800">Demo Mode</p>
                <p className="text-sm text-slate-500 mt-0.5">Show demo credentials on the login page. Disable for live deployment.</p>
              </div>
              <Toggle checked={bool('demo_mode')} onChange={v => set('demo_mode', String(v))} color="bg-orange-500" />
            </div>
            <div className="flex items-start justify-between gap-4 mt-4 pt-4 border-t border-slate-100">
              <div>
                <p className="font-semibold text-slate-800">Manager Dashboard</p>
                <p className="text-sm text-slate-500 mt-0.5">Show the manager dashboard instead of the analytics dashboard.</p>
              </div>
              <Toggle checked={bool('use_manager_dashboard')} onChange={v => set('use_manager_dashboard', String(v))} color="bg-blue-500" />
            </div>
            {bool('demo_mode') && (
              <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 font-medium">
                Demo credentials are visible on the login page
              </div>
            )}
          </Card>

          {/* Receipt Settings */}
          <Card title={t('set.receipt_settings')}>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={t('set.currency')}>
                  <input value={form.currency ?? 'Rs.'} onChange={e => set('currency', e.target.value)} className={inputCls} />
                </Field>
                <Field label={t('set.tax_rate')}>
                  <input type="number" min="0" step="0.01" value={form.tax_rate ?? '0'} onChange={e => set('tax_rate', e.target.value)} className={inputCls} />
                </Field>
              </div>
              <Field label={t('set.receipt_footer')}>
                <textarea value={form.receipt_note ?? ''} onChange={e => set('receipt_note', e.target.value)} rows={3}
                  placeholder="Thank you for shopping with us!" className={inputCls + ' resize-none'} />
              </Field>
            </div>
          </Card>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Interface Language */}
          <Card title={t('set.ui_language')}>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('set.ui_language')}</p>
                <LangPicker value={form.interface_language ?? 'en'} onChange={v => set('interface_language', v)} />
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('set.bill_language')}</p>
                <LangPicker value={form.receipt_language ?? 'en'} onChange={v => set('receipt_language', v)} />
              </div>
            </div>
          </Card>

          {/* Appearance */}
          <Card title={t('set.appearance')}>
            <div className="space-y-5">
              {/* Sidebar theme */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">{t('set.sidebar_theme')}</p>
                <div className="flex gap-2.5">
                  {SIDEBAR_THEMES.map(theme => (
                    <button key={theme.value} type="button" onClick={() => set('sidebar_theme', theme.value)}
                      title={theme.label}
                      className={`w-9 h-9 rounded-full transition-all duration-150 relative ${form.sidebar_theme === theme.value ? 'ring-2 ring-offset-2 ring-orange-400 scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: theme.color }}>
                      {/* small dot accent */}
                      <span className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full border border-white/60"
                        style={{ backgroundColor: theme.value === 'coffee' ? '#f97316' : theme.value === 'teal' ? '#38bdf8' : 'transparent' }} />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-2 capitalize">
                  {SIDEBAR_THEMES.find(theme => theme.value === (form.sidebar_theme ?? 'slate'))?.label}
                </p>
              </div>

              {/* Primary color */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">{t('set.primary_color')}</p>
                <div className="flex gap-2.5">
                  {PRIMARY_COLORS.map(c => (
                    <button key={c.value} type="button" onClick={() => set('primary_color', c.value)}
                      title={c.label}
                      className="w-9 h-9 rounded-full transition-all duration-150 hover:scale-105 flex items-center justify-center"
                      style={{ backgroundColor: c.color }}>
                      {form.primary_color === c.value && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-2 capitalize">
                  {PRIMARY_COLORS.find(c => c.value === (form.primary_color ?? 'blue'))?.label}
                </p>
              </div>
            </div>
          </Card>

          {/* Barcode Label */}
          <Card title="Barcode Label" icon="🏷️">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">Show Price on Label</p>
                <p className="text-xs text-slate-500 mt-0.5">Print selling price below the barcode</p>
              </div>
              <Toggle checked={bool('show_price_label')} onChange={v => set('show_price_label', String(v))} color="bg-violet-500" />
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <div>
                <p className="text-sm font-semibold text-slate-800">Auto Print Receipt</p>
                <p className="text-xs text-slate-500 mt-0.5">Automatically send receipt to printer after each sale completes</p>
              </div>
              <Toggle checked={bool('auto_print')} onChange={v => set('auto_print', String(v))} color="bg-violet-500" />
            </div>
          </Card>

          {/* POS / Touch Screen */}
          <Card title="POS / Touch Screen" icon="🖥️">
            <div className="space-y-3">
              {/* Scale picker — always visible */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Interface Scale
                      <span className="ml-2 text-violet-600 font-bold">
                        {form.pos_auto_scale === '0' ? (form.pos_scale_value || '100') + '%' : 'Auto'}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {form.pos_auto_scale === '0'
                        ? 'Fixed zoom applied on every load. Increase for large screens, decrease for small/touch screens.'
                        : 'Auto: 80% on screens narrower than 1500px, 100% otherwise.'}
                    </p>
                  </div>
                  <Toggle
                    checked={form.pos_auto_scale === '1' || form.pos_auto_scale === true}
                    onChange={v => set('pos_auto_scale', v ? '1' : '0')}
                    color="bg-violet-500"
                  />
                </div>

                {/* Scale buttons — shown when auto is OFF */}
                {(form.pos_auto_scale === '0' || form.pos_auto_scale === false) && (
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                    {['75','80','85','90','95','100','105','110','115','120','125','130'].map(val => (
                      <button key={val} type="button"
                        onClick={() => set('pos_scale_value', val)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                          (form.pos_scale_value || '100') === val
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}>
                        {val}%
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* POS Interface */}
          <Card title="POS Billing Interface">
            <p className="text-xs text-slate-500 mb-4">Choose which billing interface cashiers see when creating a new sale.</p>
            <div className="flex gap-3">
              {/* Interface 1 */}
              <button type="button" onClick={() => set('pos_interface', '1')}
                className={`flex-1 rounded-xl border-2 p-3 text-left transition-all ${(form.pos_interface ?? '1') === '1' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                {/* Mini preview */}
                <div className="w-full h-16 rounded-lg bg-slate-100 mb-2 overflow-hidden flex gap-1 p-1.5">
                  <div className="flex-1 bg-white rounded flex flex-col gap-1 p-1">
                    <div className="h-1.5 bg-slate-200 rounded-full w-3/4" />
                    <div className="h-1 bg-slate-100 rounded-full" />
                    <div className="h-1 bg-slate-100 rounded-full w-2/3" />
                    <div className="h-1 bg-slate-100 rounded-full" />
                  </div>
                  <div className="w-8 bg-blue-100 rounded flex flex-col gap-1 p-1">
                    <div className="h-2 bg-blue-300 rounded-full" />
                    <div className="h-1 bg-blue-200 rounded-full" />
                    <div className="h-1 bg-blue-200 rounded-full" />
                  </div>
                </div>
                <p className="text-sm font-semibold text-slate-800">Interface 1</p>
                <p className="text-xs text-slate-500 mt-0.5">Classic search-based list layout</p>
                {(form.pos_interface ?? '1') === '1' && (
                  <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-blue-600">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                    Active
                  </span>
                )}
              </button>

              {/* Interface 2 */}
              <button type="button" onClick={() => set('pos_interface', '2')}
                className={`flex-1 rounded-xl border-2 p-3 text-left transition-all ${form.pos_interface === '2' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'}`}>
                {/* Mini preview */}
                <div className="w-full h-16 rounded-lg bg-slate-100 mb-2 overflow-hidden flex gap-1 p-1.5">
                  <div className="w-5 bg-orange-200 rounded flex flex-col gap-1 p-0.5">
                    <div className="h-2 bg-orange-400 rounded" />
                    <div className="h-1.5 bg-orange-300 rounded" />
                    <div className="h-1.5 bg-orange-300 rounded" />
                    <div className="h-1.5 bg-orange-300 rounded" />
                  </div>
                  <div className="flex-1 grid grid-cols-3 gap-0.5">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="bg-white rounded" />
                    ))}
                  </div>
                  <div className="w-8 bg-white rounded flex flex-col gap-0.5 p-0.5">
                    <div className="h-1 bg-slate-200 rounded-full" />
                    <div className="h-1 bg-slate-200 rounded-full" />
                    <div className="flex-1 bg-slate-100 rounded" />
                    <div className="h-2 bg-orange-400 rounded" />
                  </div>
                </div>
                <p className="text-sm font-semibold text-slate-800">Interface 2</p>
                <p className="text-xs text-slate-500 mt-0.5">Category sidebar with image cards</p>
                {form.pos_interface === '2' && (
                  <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-orange-600">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                    Active
                  </span>
                )}
              </button>

              {/* Interface 3 */}
              <button type="button" onClick={() => set('pos_interface', '3')}
                className={`flex-1 rounded-xl border-2 p-3 text-left transition-all ${form.pos_interface === '3' ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className="w-full h-16 rounded-lg bg-slate-900 mb-2 overflow-hidden flex gap-0.5 p-1">
                  <div className="flex-1 flex flex-col gap-0.5">
                    <div className="h-2 bg-slate-700 rounded-sm flex gap-0.5 items-center px-0.5">
                      {['bg-blue-500','bg-purple-500','bg-green-500','bg-orange-500'].map((c,i) => (
                        <div key={i} className={`h-1 w-3 rounded-full ${c}`} />
                      ))}
                    </div>
                    <div className="flex-1 grid grid-cols-4 gap-0.5">
                      {[...Array(8)].map((_,i) => <div key={i} className="bg-slate-700 rounded-sm" />)}
                    </div>
                  </div>
                  <div className="w-7 bg-slate-950 rounded-sm flex flex-col gap-0.5 p-0.5">
                    {[...Array(3)].map((_,i) => <div key={i} className="h-1.5 bg-slate-700 rounded-sm" />)}
                    <div className="mt-auto h-2 bg-green-600 rounded-sm" />
                  </div>
                </div>
                <p className="text-sm font-semibold text-slate-800">Interface 3</p>
                <p className="text-xs text-slate-500 mt-0.5">Dark supermarket POS (Keells-style)</p>
                {form.pos_interface === '3' && (
                  <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-green-600">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                    Active
                  </span>
                )}
              </button>
            </div>
          </Card>

        </div>
      </div>
    </form>
  );
}
