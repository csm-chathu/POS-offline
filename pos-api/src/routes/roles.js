const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

const DEFAULT_FEATURES = [
  { key: 'dashboard',        label: 'Dashboard',       path: '/dashboard',          group: 'main', sort_order: 1,  icon: 'dashboard',  offline_ok: false },
  { key: 'new_sale',         label: 'New Sale (POS)',   path: '/sales/create',       group: 'main', sort_order: 2,  icon: 'pos',        offline_ok: true  },
  { key: 'sales',            label: 'Sales History',   path: '/sales',              group: 'main', sort_order: 3,  icon: 'sales',      offline_ok: true  },
  { key: 'invoices',         label: 'Day End',          path: '/invoices',           group: 'main', sort_order: 4,  icon: 'sales',      offline_ok: false },
  { key: 'products',         label: 'Products',         path: '/products',           group: 'main', sort_order: 5,  icon: 'products',   offline_ok: false },
  { key: 'stock_intake',     label: 'Stock Intake',     path: '/products/intake',    group: 'main', sort_order: 6,  icon: 'intake',     offline_ok: false },
  { key: 'purchases',        label: 'Purchases',        path: '/purchases',          group: 'main', sort_order: 7,  icon: 'purchases',  offline_ok: false },
  { key: 'customers',        label: 'Customers',        path: '/customers',          group: 'main', sort_order: 8,  icon: 'customers',  offline_ok: false },
  { key: 'credit',           label: 'Credit Book',      path: '/credit',             group: 'main', sort_order: 9,  icon: 'credit',     offline_ok: false },
  { key: 'suppliers',        label: 'Suppliers',        path: '/suppliers',          group: 'main', sort_order: 10, icon: 'suppliers',  offline_ok: false },
  { key: 'categories',       label: 'Categories',       path: '/categories',         group: 'main', sort_order: 11, icon: 'categories', offline_ok: false },
  { key: 'reports',          label: 'Reports',          path: '/reports',            group: 'mgmt', sort_order: 12, icon: 'reports',    offline_ok: false },
  { key: 'users',            label: 'Users',            path: '/users',              group: 'mgmt', sort_order: 13, icon: 'users',      offline_ok: false },
  { key: 'settings',         label: 'Settings',         path: '/settings',           group: 'mgmt', sort_order: 14, icon: 'settings',   offline_ok: false },
  { key: 'data_import',      label: 'Data Import',      path: '/admin/data-import',  group: 'mgmt', sort_order: 15, icon: 'upload',     offline_ok: false },
  { key: 'role_permissions', label: 'Role Permissions', path: '/settings/roles',     group: 'mgmt', sort_order: 16, icon: 'users',      offline_ok: false },
];

async function ensureFeatures(Feature) {
  for (const f of DEFAULT_FEATURES) {
    const [record, created] = await Feature.findOrCreate({ where: { key: f.key }, defaults: f });
    if (!created && (!record.icon || record.icon !== f.icon)) {
      await record.update({ icon: f.icon, offline_ok: f.offline_ok, label: f.label });
    }
  }
}

// GET /api/roles — list all roles with their assigned feature keys
router.get('/', auth, async (req, res) => {
  const { Role, Feature } = req.models;
  await ensureFeatures(Feature);
  const roles = await Role.findAll({
    include: [{ model: Feature, through: { attributes: [] } }],
    order: [['name', 'ASC']],
  });
  res.json(roles.map(r => ({
    id:       r.id,
    name:     r.name,
    features: r.Features.map(f => f.key),
  })));
});

// GET /api/roles/features — list all available features
router.get('/features', auth, async (req, res) => {
  const { Feature } = req.models;
  await ensureFeatures(Feature);
  const features = await Feature.findAll({ order: [['sort_order', 'ASC']] });
  res.json(features);
});

// POST /api/roles — create a new role
router.post('/', auth, role('admin'), async (req, res) => {
  const { Role } = req.models;
  const name = (req.body.name || '').trim().toLowerCase();
  if (!name) return res.status(422).json({ error: 'Role name is required' });
  if (name === 'admin') return res.status(400).json({ error: 'Cannot create a role named admin' });
  const [r, created] = await Role.findOrCreate({ where: { name }, defaults: { name } });
  if (!created) return res.status(409).json({ error: 'Role already exists' });
  res.status(201).json({ id: r.id, name: r.name, features: [] });
});

// PUT /api/roles/:id — rename a role
router.put('/:id', auth, role('admin'), async (req, res) => {
  const { Role } = req.models;
  const r = await Role.findByPk(req.params.id);
  if (!r) return res.status(404).json({ error: 'Role not found' });
  if (r.name === 'admin') return res.status(400).json({ error: 'Cannot rename admin role' });
  const name = (req.body.name || '').trim().toLowerCase();
  if (!name) return res.status(422).json({ error: 'Role name is required' });
  await r.update({ name });
  res.json({ id: r.id, name: r.name });
});

// DELETE /api/roles/:id — delete a role
router.delete('/:id', auth, role('admin'), async (req, res) => {
  const { Role } = req.models;
  const r = await Role.findByPk(req.params.id);
  if (!r) return res.status(404).json({ error: 'Role not found' });
  if (r.name === 'admin') return res.status(400).json({ error: 'Cannot delete admin role' });
  await r.destroy();
  res.json({ ok: true });
});

// PUT /api/roles/:id/features — assign features to a role (admin only)
router.put('/:id/features', auth, role('admin'), async (req, res) => {
  const { Role, Feature } = req.models;
  const r = await Role.findByPk(req.params.id);
  if (!r) return res.status(404).json({ error: 'Role not found' });

  const keys     = req.body.features || [];
  const features = await Feature.findAll({ where: { key: keys } });
  await r.setFeatures(features);
  res.json({ message: 'Updated', features: features.map(f => f.key) });
});

module.exports = router;
