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

// ─── Shared primitives ────────────────────────────────────────────────────────
function Toggle({ checked, onChange, color = 'bg-blue-600' }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative inline-flex w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none shrink-0 ${checked ? color : 'bg-slate-200 dark:bg-slate-600'}`}>
      <span className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 mt-0.5 ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function ToggleRow({ label, hint, checked, onChange, color }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
        {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} color={color} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Section({ title, icon, children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-[#1e1e1e] rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden ${className}`}>
      {title && (
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
          {icon && <span className="text-lg leading-none">{icon}</span>}
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

const inputCls = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252525] text-slate-800 dark:text-slate-100 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition';
const divideCls = 'divide-y divide-slate-100 dark:divide-slate-700';

// ─── Constants ────────────────────────────────────────────────────────────────
const SIDEBAR_THEMES = [
  { value: 'slate',  color: '#1e293b', label: 'Slate' },
  { value: 'black',  color: '#111111', label: 'Black' },
  { value: 'navy',   color: '#1a3058', label: 'Navy' },
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
    <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden w-fit">
      {LANGS.map(l => (
        <button key={l.value} type="button" onClick={() => onChange(l.value)}
          className={`px-4 py-1.5 text-sm font-medium transition-colors ${value === l.value ? 'bg-green-500 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

// ─── Tab components ───────────────────────────────────────────────────────────
function ShopTab({ form, set, logoInputRef, handleLogoUpload, t }) {
  return (
    <div className="space-y-5 max-w-2xl">
      <Section title="Shop Identity" icon="🏪">
        {/* Logo */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('set.logo')}</label>
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-[#252525] shrink-0">
              {form.shop_logo ? (
                <img src={form.shop_logo} alt="logo" className="w-full h-full object-contain" />
              ) : (
                <svg className="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
              )}
            </div>
            <div className="space-y-2">
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoUpload} />
              <button type="button" onClick={() => logoInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4 4 4"/></svg>
                {t('btn.add')}
              </button>
              {form.shop_logo && (
                <button type="button" onClick={() => set('shop_logo', '')}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 dark:border-red-800 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
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
            <input type="email" value={form.default_login_email ?? ''} onChange={e => set('default_login_email', e.target.value)}
              placeholder="Pre-filled email on login page" className={inputCls} />
          </Field>
        </div>
      </Section>
    </div>
  );
}

function AppearanceTab({ form, set, t }) {
  return (
    <div className="space-y-5 max-w-2xl">
      <Section title="Language" icon="🌐">
        <div className={divideCls}>
          <div className="pb-4">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t('set.ui_language')}</p>
            <LangPicker value={form.interface_language ?? 'en'} onChange={v => set('interface_language', v)} />
          </div>
          <div className="pt-4">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t('set.bill_language')}</p>
            <LangPicker value={form.receipt_language ?? 'en'} onChange={v => set('receipt_language', v)} />
          </div>
        </div>
      </Section>

      <Section title="Sidebar Theme" icon="🎨">
        <div className="flex flex-wrap gap-3 mb-3">
          {SIDEBAR_THEMES.map(theme => (
            <button key={theme.value} type="button" onClick={() => set('sidebar_theme', theme.value)}
              title={theme.label}
              className={`w-10 h-10 rounded-full transition-all duration-150 relative ${form.sidebar_theme === theme.value ? 'ring-2 ring-offset-2 ring-orange-400 scale-110' : 'hover:scale-105'}`}
              style={{ backgroundColor: theme.color }}>
              {form.sidebar_theme === theme.value && (
                <svg className="w-4 h-4 text-white absolute inset-0 m-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                </svg>
              )}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 capitalize">
          {SIDEBAR_THEMES.find(t => t.value === (form.sidebar_theme ?? 'slate'))?.label}
        </p>
      </Section>

      <Section title="Accent Color" icon="🖌️">
        <div className="flex flex-wrap gap-3 mb-3">
          {PRIMARY_COLORS.map(c => (
            <button key={c.value} type="button" onClick={() => set('primary_color', c.value)}
              title={c.label}
              className="w-10 h-10 rounded-full transition-all duration-150 hover:scale-105 flex items-center justify-center"
              style={{ backgroundColor: c.color }}>
              {form.primary_color === c.value && (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                </svg>
              )}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 capitalize">
          {PRIMARY_COLORS.find(c => c.value === (form.primary_color ?? 'blue'))?.label}
        </p>
      </Section>
    </div>
  );
}

function POSTab({ form, set }) {
  return (
    <div className="space-y-5">
      <Section title="Billing Interface" icon="🖥️">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Choose which interface cashiers see when creating a new sale.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Interface 1 */}
          <button type="button" onClick={() => set('pos_interface', '1')}
            className={`rounded-xl border-2 p-3 text-left transition-all ${(form.pos_interface ?? '1') === '1' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
            <div className="w-full h-16 rounded-lg bg-slate-100 dark:bg-slate-700 mb-3 overflow-hidden flex gap-1 p-1.5">
              <div className="flex-1 bg-white dark:bg-slate-600 rounded flex flex-col gap-1 p-1">
                <div className="h-1.5 bg-slate-200 dark:bg-slate-500 rounded-full w-3/4" />
                <div className="h-1 bg-slate-100 dark:bg-slate-600 rounded-full" />
                <div className="h-1 bg-slate-100 dark:bg-slate-600 rounded-full w-2/3" />
              </div>
              <div className="w-8 bg-blue-100 dark:bg-blue-900/50 rounded flex flex-col gap-1 p-1">
                <div className="h-2 bg-blue-300 dark:bg-blue-600 rounded-full" />
                <div className="h-1 bg-blue-200 dark:bg-blue-700 rounded-full" />
              </div>
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Interface 1</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Classic search-based list</p>
            {(form.pos_interface ?? '1') === '1' && (
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                Active
              </span>
            )}
          </button>

          {/* Interface 2 */}
          <button type="button" onClick={() => set('pos_interface', '2')}
            className={`rounded-xl border-2 p-3 text-left transition-all ${form.pos_interface === '2' ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
            <div className="w-full h-16 rounded-lg bg-slate-100 dark:bg-slate-700 mb-3 overflow-hidden flex gap-1 p-1.5">
              <div className="w-5 bg-orange-200 dark:bg-orange-900/50 rounded flex flex-col gap-1 p-0.5">
                <div className="h-2 bg-orange-400 rounded" />
                <div className="h-1.5 bg-orange-300 rounded" />
                <div className="h-1.5 bg-orange-300 rounded" />
              </div>
              <div className="flex-1 grid grid-cols-3 gap-0.5">
                {[...Array(6)].map((_, i) => <div key={i} className="bg-white dark:bg-slate-600 rounded" />)}
              </div>
              <div className="w-8 bg-white dark:bg-slate-600 rounded flex flex-col gap-0.5 p-0.5">
                <div className="h-1 bg-slate-200 rounded-full" />
                <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded" />
                <div className="h-2 bg-orange-400 rounded" />
              </div>
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Interface 2</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Category sidebar + image cards</p>
            {form.pos_interface === '2' && (
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-orange-600">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                Active
              </span>
            )}
          </button>

          {/* Interface 3 */}
          <button type="button" onClick={() => set('pos_interface', '3')}
            className={`rounded-xl border-2 p-3 text-left transition-all ${form.pos_interface === '3' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
            <div className="w-full h-16 rounded-lg bg-slate-900 mb-3 overflow-hidden flex gap-0.5 p-1">
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
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Interface 3</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Dark supermarket POS</p>
            {form.pos_interface === '3' && (
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-green-600">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                Active
              </span>
            )}
          </button>
        </div>
      </Section>

      <Section title="Display Scale" icon="🔍">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Auto Scale
              <span className="ml-2 text-violet-600 dark:text-violet-400 font-bold text-xs">
                {form.pos_auto_scale === '0' ? (form.pos_scale_value || '100') + '% fixed' : 'Auto'}
              </span>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
              {form.pos_auto_scale === '0'
                ? 'Fixed zoom applied on every load.'
                : 'Auto: 80% on screens under 1500px, 100% otherwise.'}
            </p>
          </div>
          <Toggle
            checked={form.pos_auto_scale === '1' || form.pos_auto_scale === true}
            onChange={v => set('pos_auto_scale', v ? '1' : '0')}
            color="bg-violet-500"
          />
        </div>
        {(form.pos_auto_scale === '0' || form.pos_auto_scale === false) && (
          <div className="flex flex-wrap gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-700">
            {['75','80','85','90','95','100','105','110','115','120','125','130'].map(val => (
              <button key={val} type="button"
                onClick={() => set('pos_scale_value', val)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                  (form.pos_scale_value || '100') === val
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}>
                {val}%
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title="Print" icon="🖨️">
        <ToggleRow
          label="Auto Print Receipt"
          hint="Automatically send receipt to printer after each sale completes"
          checked={form.auto_print === 'true' || form.auto_print === true}
          onChange={v => set('auto_print', String(v))}
          color="bg-violet-500"
        />
      </Section>
    </div>
  );
}

function ReceiptTab({ form, set, t }) {
  return (
    <div className="space-y-5 max-w-2xl">
      <Section title="Currency & Tax" icon="💰">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('set.currency')}>
            <input value={form.currency ?? 'Rs.'} onChange={e => set('currency', e.target.value)} className={inputCls} placeholder="Rs." />
          </Field>
          <Field label={t('set.tax_rate') + ' (%)'}>
            <input type="number" min="0" step="0.01" value={form.tax_rate ?? '0'} onChange={e => set('tax_rate', e.target.value)} className={inputCls} />
          </Field>
        </div>
      </Section>

      <Section title="Receipt Footer" icon="📝">
        <Field label={t('set.receipt_footer')}>
          <textarea value={form.receipt_note ?? ''} onChange={e => set('receipt_note', e.target.value)} rows={3}
            placeholder="Thank you for shopping with us!" className={inputCls + ' resize-none'} />
        </Field>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">Shown at the bottom of every printed receipt.</p>
      </Section>

      <Section title="Barcode Labels" icon="🏷️">
        <ToggleRow
          label="Show Price on Label"
          hint="Print the selling price below the barcode on each label"
          checked={form.show_price_label === 'true' || form.show_price_label === true}
          onChange={v => set('show_price_label', String(v))}
          color="bg-violet-500"
        />
      </Section>
    </div>
  );
}

function SystemTab({ form, set, bool, handleBackup, backing, seedState, handleSeed, showToast }) {
  return (
    <div className="space-y-5 max-w-2xl">
      <Section title="Dashboard & Mode" icon="📊">
        <div className={divideCls}>
          <ToggleRow
            label="Manager Dashboard"
            hint="Show the manager dashboard instead of the analytics dashboard"
            checked={bool('use_manager_dashboard')}
            onChange={v => set('use_manager_dashboard', String(v))}
            color="bg-blue-500"
          />
          <ToggleRow
            label="Demo Mode"
            hint="Show demo credentials on the login page — disable for live deployment"
            checked={bool('demo_mode')}
            onChange={v => set('demo_mode', String(v))}
            color="bg-orange-500"
          />
        </div>
        {bool('demo_mode') && (
          <div className="mt-1 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-700 dark:text-amber-400 font-medium">
            Demo credentials are visible on the login page
          </div>
        )}
      </Section>

      <Section title="Database" icon="🗄️">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Backup</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">Download a full SQL backup of your database.</p>
            <button type="button" onClick={handleBackup} disabled={backing}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              {backing ? 'Backing up…' : 'Download Backup'}
            </button>
          </div>

          {window.electronAPI && (
            <div className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Seed Data</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">Import bundled products and categories. Safe to run multiple times.</p>
              <button type="button" onClick={handleSeed} disabled={seedState === 'running'}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors">
                🌱 {seedState === 'running' ? 'Seeding…' : 'Seed Products'}
              </button>
              {seedState === 'running' && (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <div className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                  This may take 30–60 seconds…
                </div>
              )}
              {seedState && seedState !== 'running' && seedState.ok && (
                <div className="mt-2 text-xs text-green-700 dark:text-green-400">
                  ✓ {seedState.categories} categories, {seedState.products} products — total: {seedState.total_in_db}
                </div>
              )}
              {seedState && seedState !== 'running' && seedState.error && (
                <div className="mt-2 text-xs text-red-600">✗ {seedState.error}</div>
              )}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { key: 'shop',       label: 'Shop',       icon: '🏪' },
  { key: 'appearance', label: 'Appearance',  icon: '🎨' },
  { key: 'pos',        label: 'POS',         icon: '🖥️' },
  { key: 'receipt',    label: 'Receipt',     icon: '🧾' },
  { key: 'system',     label: 'System',      icon: '⚙️' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Settings() {
  const { data, isLoading } = settingsApi.useGetSettingsQuery();
  const [save, { isLoading: saving }] = settingsApi.useSaveSettingsMutation();
  const [form, setForm]     = useState({});
  const [saved, setSaved]   = useState(false);
  const [backing, setBacking] = useState(false);
  const [seedState, setSeedState] = useState(null);
  const [toast, setToast]   = useState(null);
  const [activeTab, setActiveTab] = useState('shop');

  const logoInputRef     = useRef(null);
  const { setLocale, t } = useLocale();
  const token            = useSelector(selectToken);

  function showToast(msg, type = 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSeed() {
    setSeedState('running');
    try {
      const res = await fetch(`${getApiUrl()}/api/seed`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setSeedState(json);
    } catch (e) {
      setSeedState({ error: e.message });
    }
  }

  async function handleBackup() {
    setBacking(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/settings/backup`, {
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
      showToast('Backup downloaded successfully', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBacking(false);
    }
  }

  useEffect(() => {
    if (data) {
      const merged = {
        shop_name: '', address: '', phone: '', email: '',
        default_login_email: '', use_manager_dashboard: 'false',
        currency: 'Rs.', tax_rate: '0', receipt_note: '',
        shop_logo: '', demo_mode: 'false', interface_language: 'en',
        receipt_language: 'en', sidebar_theme: 'slate', primary_color: 'blue',
        show_price_label: 'true', auto_print: 'false',
        pos_auto_scale: '1', pos_scale_value: '100', pos_interface: '1',
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
    if (file.size > 2 * 1024 * 1024) { showToast('Logo must be under 2 MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = ev => set('shop_logo', ev.target.result);
    reader.readAsDataURL(file);
  }

  if (isLoading) return <div className="p-8 text-slate-400 text-sm">{t('lbl.loading')}</div>;

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success'
            ? <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
            : <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          }
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-1 opacity-70 hover:opacity-100 text-lg leading-none">&times;</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('page.settings')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage your POS configuration</p>
          </div>
          <div className="flex items-center gap-3">
            {saved && <span className="text-sm text-green-600 font-semibold">✓ Saved!</span>}
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm">
              {saving ? t('lbl.loading') : t('set.save')}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-6 bg-slate-100 dark:bg-[#252525] p-1 rounded-2xl overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-150 shrink-0
                ${activeTab === tab.key
                  ? 'bg-white dark:bg-[#1e1e1e] text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
              <span className="text-base leading-none">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'shop'       && <ShopTab       form={form} set={set} logoInputRef={logoInputRef} handleLogoUpload={handleLogoUpload} t={t} />}
        {activeTab === 'appearance' && <AppearanceTab form={form} set={set} t={t} />}
        {activeTab === 'pos'        && <POSTab        form={form} set={set} />}
        {activeTab === 'receipt'    && <ReceiptTab    form={form} set={set} t={t} />}
        {activeTab === 'system'     && <SystemTab     form={form} set={set} bool={bool} handleBackup={handleBackup} backing={backing} seedState={seedState} handleSeed={handleSeed} showToast={showToast} />}
      </form>
    </>
  );
}
