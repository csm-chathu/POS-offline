import { useState } from 'react';
import {
  useGetUsersQuery, useCreateUserMutation,
  useUpdateUserMutation, useDeleteUserMutation,
  useGetAllFeaturesQuery, useGetUserFeaturesQuery, useSetUserFeaturesMutation,
} from '../../features/users/usersApi';
import { useGetRolesQuery } from '../../features/roles/rolesApi';
import { useSelector } from 'react-redux';
import { selectCurrentUser, selectRole } from '../../features/auth/authSlice';
import { useLocale } from '../../contexts/LocaleContext';

const empty = { name: '', email: '', password: '', role: 'cashier' };

// ── Feature assignment modal ────────────────────────────────────────────────
function FeatureModal({ user, onClose }) {
  const { data: allFeatures = [] } = useGetAllFeaturesQuery();
  const { data: userFeats, isLoading } = useGetUserFeaturesQuery(user.id);
  const [setFeatures, { isLoading: saving }] = useSetUserFeaturesMutation();
  const [selected, setSelected] = useState(null); // null until loaded
  const [saved, setSaved] = useState(false);

  // Initialise selected from server once loaded
  if (userFeats && selected === null) {
    setSelected(new Set(userFeats.features));
  }

  const toggle = key => setSelected(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const selectAll  = () => setSelected(new Set(allFeatures.map(f => f.key)));
  const clearAll   = () => setSelected(new Set());
  const resetRole  = async () => {
    await setFeatures({ id: user.id, features: [] });
    setSaved(true); setTimeout(() => { setSaved(false); onClose(); }, 800);
  };

  async function handleSave() {
    await setFeatures({ id: user.id, features: [...(selected || [])] });
    setSaved(true); setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  // Group features
  const groups = {};
  allFeatures.forEach(f => {
    const g = f.group || 'other';
    if (!groups[g]) groups[g] = [];
    groups[g].push(f);
  });

  const isOverride = userFeats?.hasOverride;
  const checkedCount = selected?.size ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-slate-800 text-base">Feature Access — {user.name}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isOverride
                  ? <span className="text-blue-600 font-semibold">Custom override active</span>
                  : <span className="text-slate-400">Using role defaults ({user.role})</span>
                }
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button onClick={selectAll} className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold">All</button>
            <button onClick={clearAll}  className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold">None</button>
            <button onClick={resetRole} className="text-xs px-2.5 py-1 rounded-lg border border-amber-300 text-amber-600 hover:bg-amber-50 font-semibold">
              Reset to role defaults
            </button>
            <span className="ml-auto text-xs text-slate-400">{checkedCount} selected</span>
          </div>
        </div>

        {/* Feature list */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading || selected === null ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
          ) : (
            <div className="space-y-5">
              {Object.entries(groups).map(([group, features]) => (
                <div key={group}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{group}</p>
                  <div className="space-y-1">
                    {features.map(f => (
                      <label key={f.key}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${selected.has(f.key) ? 'bg-blue-50 border border-blue-200' : 'border border-transparent hover:bg-slate-50'}`}>
                        <input type="checkbox" className="w-4 h-4 accent-blue-600 shrink-0"
                          checked={selected.has(f.key)}
                          onChange={() => toggle(f.key)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-700">{f.label}</p>
                          {f.path && <p className="text-[10px] text-slate-400 font-mono">{f.path}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSave} disabled={saving || selected === null}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Features'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function UsersIndex() {
  const { t } = useLocale();
  const me   = useSelector(selectCurrentUser);
  const myRole = useSelector(selectRole);
  const isAdmin = myRole === 'admin';
  const canManageFeatures = isAdmin || myRole === 'setup' || myRole === 'manager';

  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState(empty);
  const [err, setErr]               = useState('');
  const [featureUser, setFeatureUser] = useState(null);

  const { data: users = [], isLoading } = useGetUsersQuery();
  const { data: rolesData = [] }        = useGetRolesQuery();
  const roleNames = rolesData.map(r => r.name).filter(r => r !== 'admin');
  const [create, { isLoading: creating }] = useCreateUserMutation();
  const [update, { isLoading: updating }] = useUpdateUserMutation();
  const [del] = useDeleteUserMutation();

  function openCreate() { setForm(empty); setErr(''); setModal('new'); }
  function openEdit(u)  { setForm({ name: u.name, email: u.email, password: '', role: u.role }); setErr(''); setModal({ edit: u }); }
  function close()      { setModal(null); }

  async function handleSave(e) {
    e.preventDefault(); setErr('');
    try {
      if (modal?.edit) await update({ id: modal.edit.id, ...form }).unwrap();
      else await create(form).unwrap();
      close();
    } catch (e) { setErr(e?.data?.error || 'Failed'); }
  }

  async function handleDelete(u) {
    if (u.id === me?.id) return;
    if (!window.confirm(`Delete "${u.name}"?`)) return;
    await del(u.id);
  }

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }));

  const roleBadge = role => {
    const cls = { admin: 'bg-red-100 text-red-700', manager: 'bg-blue-100 text-blue-700', cashier: 'bg-green-100 text-green-700', custom: 'bg-indigo-100 text-indigo-700' };
    return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${cls[role] || 'bg-slate-100 text-slate-600'}`}>{role}</span>;
  };

  return (
    <div className="p-3 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t('page.users')}</h1>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
          + {t('btn.add')} {t('nav.users')}
        </button>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {isLoading && <div className="p-8 text-center text-slate-400 text-sm bg-white rounded-xl border border-slate-100">{t('lbl.loading')}</div>}
        {!isLoading && users.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-sm bg-white rounded-xl border border-slate-100">{t('usr.no_users')}</div>
        )}
        {users.map(u => (
          <div key={u.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="font-semibold text-slate-800">
                  {u.name} {u.id === me?.id && <span className="text-xs text-slate-400 font-normal">(you)</span>}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>
              </div>
              {roleBadge(u.role)}
            </div>
            <div className="flex gap-2 pt-3 border-t border-slate-50 mt-3">
              <button onClick={() => openEdit(u)}
                className="flex-1 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                {t('btn.edit')}
              </button>
              {canManageFeatures && u.role !== 'admin' && (
                <button onClick={() => setFeatureUser(u)}
                  className="flex-1 py-1.5 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors">
                  Features
                </button>
              )}
              {u.id !== me?.id && (
                <button onClick={() => handleDelete(u)}
                  className="flex-1 py-1.5 text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                  {t('btn.delete')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-slate-400 text-sm">{t('lbl.loading')}</div> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">{t('usr.name')}</th>
                <th className="px-4 py-3 text-left font-semibold">{t('usr.email')}</th>
                <th className="px-4 py-3 text-center font-semibold">{t('usr.role')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('th.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {u.name} {u.id === me?.id && <span className="text-xs text-slate-400">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{u.email}</td>
                  <td className="px-4 py-3 text-center">{roleBadge(u.role)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap space-x-3">
                    <button onClick={() => openEdit(u)} className="text-blue-600 hover:text-blue-800 font-medium">{t('btn.edit')}</button>
                    {canManageFeatures && u.role !== 'admin' && (
                      <button onClick={() => setFeatureUser(u)} className="text-violet-600 hover:text-violet-800 font-medium">Features</button>
                    )}
                    {u.id !== me?.id && (
                      <button onClick={() => handleDelete(u)} className="text-red-500 hover:text-red-700 font-medium">{t('btn.delete')}</button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">{t('usr.no_users')}</td></tr>
              )}
            </tbody>
          </table></div>
        )}
      </div>

      {/* Create / Edit modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-800">{modal?.edit ? `${t('btn.edit')} ${t('nav.users')}` : `${t('btn.add')} ${t('nav.users')}`}</h2>
              <button onClick={close} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              {err && <p className="text-sm text-red-600">{err}</p>}
              {[[`${t('usr.name')} *`, 'name', 'text', { required: true }], [`${t('usr.email')} / Username *`, 'email', 'text', { required: true }]].map(([label, field, type, props = {}]) => (
                <div key={field}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
                  <input type={type} value={form[field]} onChange={set(field)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" {...props} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('usr.password')} {modal?.edit && `(${t('usr.password_note')})`}</label>
                <input type="password" value={form.password} onChange={set('password')}
                  required={!modal?.edit}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('usr.role')}</label>
                <select value={form.role} onChange={set('role')}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                  {roleNames.map(r => (
                    <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={close} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">{t('btn.cancel')}</button>
                <button type="submit" disabled={creating || updating}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-60 hover:bg-blue-700">
                  {creating || updating ? t('lbl.loading') : t('btn.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Feature assignment modal */}
      {featureUser && (
        <FeatureModal user={featureUser} onClose={() => setFeatureUser(null)} />
      )}
    </div>
  );
}
