const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

router.get('/', auth, async (req, res) => {
  const { Supplier } = req.models;
  res.json(await Supplier.findAll({ order: [['name', 'ASC']] }));
});

router.post('/', auth, async (req, res) => {
  const { Supplier } = req.models;
  res.status(201).json(await Supplier.create(req.body));
});

router.get('/:id', auth, async (req, res) => {
  const { Supplier } = req.models;
  const s = await Supplier.findByPk(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});

router.put('/:id', auth, async (req, res) => {
  const { Supplier } = req.models;
  const s = await Supplier.findByPk(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  await s.update(req.body);
  res.json(s);
});

router.delete('/:id', auth, async (req, res) => {
  const { Supplier } = req.models;
  const s = await Supplier.findByPk(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  await s.destroy();
  res.json({ message: 'Deleted' });
});

module.exports = router;
