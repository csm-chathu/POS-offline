const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const auth    = require('../middleware/auth');
const role    = require('../middleware/role');

// GET /api/users/public — unauthenticated, for login screen user tiles
router.get('/public', async (req, res) => {
  try {
    const { User, Role } = req.models;
    const users = await User.findAll({
      include: [{ model: Role, through: { attributes: [] } }],
      attributes: ['id', 'name', 'email'],
      order: [['name', 'ASC']],
    });
    const result = users
      .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.Roles?.[0]?.name ?? 'cashier' }))
      .filter(u => u.role !== 'admin');
    res.json(result);
  } catch { res.json([]); }
});

// GET /api/users
router.get('/', auth, role('admin', 'manager'), async (req, res) => {
  const { User, Role } = req.models;
  const users = await User.findAll({
    include: [{ model: Role, through: { attributes: [] } }],
    attributes: { exclude: ['password'] },
    order: [['name', 'ASC']],
  });
  const mapped = users.map(u => ({ ...u.toJSON(), role: u.Roles?.[0]?.name ?? 'cashier' }));
  // Admin is a system account — hidden from user management UI
  res.json(mapped.filter(u => u.role !== 'admin'));
});

// POST /api/users
router.post('/', auth, role('admin', 'manager'), async (req, res) => {
  const { User, Role } = req.models;
  const { role: roleName, password, ...data } = req.body;
  data.password = await bcrypt.hash(password, 12);
  const user = await User.create(data);
  const roleRow = await Role.findOne({ where: { name: roleName || 'cashier' } });
  if (roleRow) await user.addRole(roleRow);
  res.status(201).json({ ...user.toJSON(), password: undefined, role: roleName });
});

// PUT /api/users/:id
router.put('/:id', auth, role('admin', 'manager'), async (req, res) => {
  const { User, Role } = req.models;
  const user = await User.findByPk(req.params.id, { include: [{ model: Role, through: { attributes: [] } }] });
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user.Roles?.[0]?.name === 'admin') return res.status(403).json({ error: 'System account cannot be modified' });
  const { role: roleName, password, ...data } = req.body;
  if (password) data.password = await bcrypt.hash(password, 12);
  await user.update(data);
  if (roleName) {
    const roleRow = await Role.findOne({ where: { name: roleName } });
    if (roleRow) await user.setRoles([roleRow]);
  }
  res.json({ ...user.toJSON(), password: undefined, role: roleName });
});

// DELETE /api/users/:id
router.delete('/:id', auth, role('admin'), async (req, res) => {
  const { User, Role } = req.models;
  if (req.params.id == req.user.id) return res.status(422).json({ error: 'Cannot delete yourself' });
  const user = await User.findByPk(req.params.id, { include: [{ model: Role, through: { attributes: [] } }] });
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user.Roles?.[0]?.name === 'admin') return res.status(403).json({ error: 'System account cannot be deleted' });
  await user.destroy();
  res.json({ message: 'Deleted' });
});

// GET /api/users/:id/features — get this user's direct feature overrides
router.get('/:id/features', auth, role('admin', 'manager'), async (req, res) => {
  const { User, Feature } = req.models;
  const user = await User.findByPk(req.params.id, {
    include: [{ model: Feature, as: 'DirectFeatures', through: { attributes: [] } }],
  });
  if (!user) return res.status(404).json({ error: 'Not found' });
  const hasOverride = (user.DirectFeatures?.length ?? 0) > 0;
  res.json({ hasOverride, features: user.DirectFeatures?.map(f => f.key) ?? [] });
});

// PUT /api/users/:id/features — assign features to user (empty array = reset to role defaults)
router.put('/:id/features', auth, role('admin'), async (req, res) => {
  const { User, Feature } = req.models;
  const { features } = req.body;
  const user = await User.findByPk(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (!features || features.length === 0) {
    await user.setDirectFeatures([]);
    return res.json({ hasOverride: false, features: [] });
  }
  const rows = await Feature.findAll({ where: { key: features } });
  await user.setDirectFeatures(rows);
  res.json({ hasOverride: true, features: rows.map(f => f.key) });
});

module.exports = router;
