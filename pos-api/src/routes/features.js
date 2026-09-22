const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

// GET /api/features — list all features grouped
router.get('/', auth, async (req, res) => {
  const { Feature } = req.models;
  const features = await Feature.findAll({ order: [['group', 'ASC'], ['sort_order', 'ASC']] });
  res.json(features);
});

module.exports = router;
