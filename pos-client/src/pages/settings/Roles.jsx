import { useState } from 'react';
import {
  useGetRolesQuery, useGetFeaturesQuery,
  useCreateRoleMutation, useUpdateRoleMutation,
  useDeleteRoleMutation, useSetRoleFeaturesMutation,
} from '../../features/roles/rolesApi';

const GROUP_LABEL = { main: 'Main Menu', mgmt: 'Management' };

const IconEdit   = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>;
const IconDelete = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16"/></svg>;
const IconPlus   = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>;
const IconCheck  = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>;
const IconX      = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>;

export default function RolesPage() {
  const { data: roles,    isLoading: loadingRoles }    = useGetRolesQuery();
  const { data: features, isLoading: loadingFeatures } = useGetFeaturesQuery();

  const [createRole] = useCreateRoleMutation();
  const [updateRole] = useUpdateRoleMutation();
  const [deleteRole] = useDeleteRoleMutation();
  const [setFeatures, { isLoading: saving }] = useSetRoleFeaturesMutation();

  const [selectedId, setSelectedId]   = useState(null);
  const [checked, setChecked]         = useState({});
  const [saved, setSaved]             = useState(false);

  // Inline edit / add state
  const [editingId, setEditingId]     = useState(null); // role id being renamed
  const [editName, setEditName]       = useState('');
  const [addingNew, setAddingNew]     = useState(false);
  const [newName, setNewName]         = useState('');
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState('');

  const nonAdminRoles = (roles || []).filter(r => r.name !== 'admin');

  function selectRole(r) {
    setSelectedId(r.id);
    const map = {};
    (r.features || []).forEach(k => { map[k] = true; });
    setChecked(map);
    setSaved(false);
    setEditingId(null);
  }

  function toggle(key) {
    setChecked(c => ({ ...c, [key]: !c[key] }));
    setSaved(false);
  }

  async function handleSave() {
    const keys = Object.keys(checked).filter(k => checked[k]);
    await setFeatures({ id: selectedId, features: keys });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true); setError('');
    try {
      const r = await createRole({ name }).unwrap();
      setAddingNew(false);
      setNewName('');
      selectRole({ ...r, features: [] });
    } catch (e) {
      setError(e?.data?.error || 'Failed to create role');
    } finally { setBusy(false); }
  }

  async function handleRename(id) {
    const name = editName.trim();
    if (!name) return;
    setBusy(true); setError('');
    try {
      await updateRole({ id, name }).unwrap();
      setEditingId(null);
    } catch (e) {
      setError(e?.data?.error || 'Failed to rename role');
    } finally { setBusy(false); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this role? Users with this role will lose access.')) return;
    setBusy(true); setError('');
    try {
      await deleteRole({ id }).unwrap();
      if (selectedId === id) { setSelectedId(null); setChecked({}); }
    } catch (e) {
      setError(e?.data?.error || 'Failed to delete role');
    } finally { setBusy(false); }
  }

  const currentRole = (roles || []).find(r => r.id === selectedId);
  const grouped = {};
  (features || []).forEach(f => {
    const g = f.group || 'main';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(f);
  });

  if (loadingRoles || loadingFeatures) {
    return <div className="p-6 text-slate-400 text-sm">Loading…</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Role Permissions</h1>
        <p className="text-sm text-slate-400 mt-1">Manage roles and control which menu items each role can access. Admin always has full access.</p>
      </div>

      {error && (
        <div className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
      )}

      {/* ── Roles table ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-700">Roles</h2>
          <button
            onClick={() => { setAddingNew(true); setEditingId(null); setNewName(''); setError(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            {IconPlus} Add Role
          </button>
        </div>

        <div className="divide-y divide-slate-50">
          {/* Admin row — read only */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-sm font-semibold text-slate-500 capitalize">admin</span>
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Full Access</span>
            </div>
            <span className="text-xs text-slate-400">Protected</span>
          </div>

          {nonAdminRoles.map(r => (
            <div
              key={r.id}
              onClick={() => editingId !== r.id && selectRole(r)}
              className={`flex items-center justify-between px-5 py-3.5 cursor-pointer transition-colors ${selectedId === r.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${selectedId === r.id ? 'bg-blue-500' : 'bg-slate-300'}`} />

                {editingId === r.id ? (
                  <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(r.id); if (e.key === 'Escape') setEditingId(null); }}
                      className="flex-1 border border-blue-300 rounded-lg px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={() => handleRename(r.id)} disabled={busy} className="p-1 text-green-600 hover:text-green-700">{IconCheck}</button>
                    <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:text-slate-600">{IconX}</button>
                  </div>
                ) : (
                  <span className="text-sm font-semibold text-slate-700 capitalize">{r.name}</span>
                )}
              </div>

              {editingId !== r.id && (
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => { setEditingId(r.id); setEditName(r.name); setError(''); }}
                    className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                    title="Rename role"
                  >{IconEdit}</button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={busy}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    title="Delete role"
                  >{IconDelete}</button>
                </div>
              )}
            </div>
          ))}

          {/* Add new role row */}
          {addingNew && (
            <div className="flex items-center gap-3 px-5 py-3.5 bg-blue-50/50">
              <span className="w-2 h-2 rounded-full bg-blue-300 shrink-0" />
              <input
                autoFocus
                placeholder="Role name (e.g. supervisor)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setAddingNew(false); }}
                className="flex-1 border border-blue-300 rounded-lg px-2.5 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={handleCreate} disabled={busy} className="p-1 text-green-600 hover:text-green-700">{IconCheck}</button>
              <button onClick={() => setAddingNew(false)} className="p-1 text-slate-400 hover:text-slate-600">{IconX}</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Feature assignment ──────────────────────────────────────────── */}
      {!selectedId && (
        <div className="py-10 text-center text-slate-400 text-sm bg-slate-50 rounded-2xl border border-slate-100">
          Select a role above to manage its permissions
        </div>
      )}

      {selectedId && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-700 capitalize">{currentRole?.name} — menu access</h2>
            <button onClick={handleSave} disabled={saving}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                saved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60'
              }`}>
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
            </button>
          </div>

          {Object.entries(grouped).map(([group, feats]) => (
            <div key={group}>
              <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{GROUP_LABEL[group] || group}</p>
              </div>
              <div className="divide-y divide-slate-50">
                {feats.map(f => (
                  <label key={f.key}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 cursor-pointer transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{f.label}</p>
                      <p className="text-xs text-slate-400 font-mono">{f.path}</p>
                    </div>
                    <div className={`relative w-10 h-5 rounded-full transition-colors ${checked[f.key] ? 'bg-blue-500' : 'bg-slate-200'}`}>
                      <input type="checkbox" className="sr-only" checked={!!checked[f.key]} onChange={() => toggle(f.key)} />
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked[f.key] ? 'translate-x-5' : ''}`} />
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
