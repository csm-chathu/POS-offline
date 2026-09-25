const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

router.get('/', auth, async (req, res) => {
  const { Category } = req.models;
  const rows = await Category.findAll({ order: [['name', 'ASC']] });
  res.json(rows);
});

router.post('/import', auth, async (req, res) => {
  const { Category } = req.models;
  const rows = Array.isArray(req.body) ? req.body : (req.body.categories || []);
  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = String(row.name || '').trim();
    if (!name) { skipped++; continue; }
    try {
      await Category.create({ name });
      created++;
    } catch {
      skipped++;
    }
  }

  res.json({ created, skipped });
});

// POST /api/categories/truncate — remove all categories (admin only)
router.post('/truncate', auth, async (req, res) => {
  const confirmed = req.body?.confirm === 'TRUNCATE_CATEGORIES';
  if (!confirmed) {
    return res.status(400).json({ error: 'Confirmation token required (TRUNCATE_CATEGORIES).' });
  }

  try {
    const { Category } = req.models;
    const deletedCategories = await Category.destroy({ where: {} });
    res.json({ deletedCategories });
  } catch (error) {
    res.status(422).json({ error: error.message || 'Unable to truncate categories table.' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(422).json({ error: 'Name is required' });
    const image = req.body.image || null;
    const cat = await req.models.Category.create({ name, image });
    res.status(201).json(cat);
  } catch (e) { res.status(422).json({ error: e.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { Category } = req.models;
    const cat = await Category.findByPk(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Not found' });
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(422).json({ error: 'Name is required' });
    const updates = { name };
    if ('image' in req.body) updates.image = req.body.image || null;
    await cat.update(updates);
    res.json(cat);
  } catch (e) { res.status(422).json({ error: e.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const { Category } = req.models;
    const cat = await Category.findByPk(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Not found' });
    await cat.destroy();
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(422).json({ error: e.message }); }
});

module.exports = router;
