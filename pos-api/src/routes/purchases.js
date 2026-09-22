const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

router.get('/', auth, async (req, res) => {
  const { Purchase, Supplier, User } = req.models;
  const page  = parseInt(req.query.page || '1');
  const limit = 20;
  const { count, rows } = await Purchase.findAndCountAll({
    include: [
      { model: Supplier, as: 'supplier', attributes: ['id', 'name'] },
      { model: User,     as: 'user',     attributes: ['id', 'name'] },
    ],
    order: [['id', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });
  res.json({ data: rows, total: count, page, last_page: Math.ceil(count / limit) });
});

router.post('/', auth, async (req, res) => {
  const { Purchase, PurchaseItem, Product, StockMovement } = req.models;
  const { items = [], ...data } = req.body;

  if (!data.supplier_id) return res.status(422).json({ error: 'Please select a supplier' });
  if (!items.length)     return res.status(422).json({ error: 'Please add at least one item' });

  data.paid = parseFloat(data.paid) || 0;
  if (!data.supplier_id) data.supplier_id = null;

  const lastGrn = await Purchase.findOne({ order: [['id', 'DESC']], attributes: ['grn_no'] });
  const grnNum  = parseInt(lastGrn?.grn_no?.split('-').pop() || '0') + 1;
  const grn_no  = `GRN-${String(grnNum).padStart(4, '0')}`;

  const purchase = await Purchase.create({ ...data, grn_no, user_id: req.user.id });

  for (const item of items) {
    const itemTotal = (parseFloat(item.cost_price) || 0) * (parseFloat(item.qty) || 0);
    await PurchaseItem.create({ ...item, purchase_id: purchase.id, total: itemTotal });
    const product = await Product.findByPk(item.product_id);
    if (product) {
      const before = parseFloat(product.stock_qty);
      const after  = before + parseFloat(item.qty);
      const updates = { stock_qty: after, cost_price: item.cost_price };
      if (item.selling_price) updates.selling_price = item.selling_price;
      await product.update(updates);
      await StockMovement.create({
        product_id: product.id, user_id: req.user.id, type: 'in',
        qty: item.qty, stock_before: before, stock_after: after, reference: grn_no,
      });
    }
  }

  res.status(201).json(purchase);
});

router.get('/:id', auth, async (req, res) => {
  const { Purchase, PurchaseItem, Supplier, User } = req.models;
  const purchase = await Purchase.findByPk(req.params.id, {
    include: [
      { model: PurchaseItem, as: 'items' },
      { model: Supplier,     as: 'supplier', attributes: ['id', 'name'] },
      { model: User,         as: 'user',     attributes: ['id', 'name'] },
    ],
  });
  if (!purchase) return res.status(404).json({ error: 'Not found' });
  res.json(purchase);
});

router.delete('/:id', auth, async (req, res) => {
  const { Purchase } = req.models;
  const p = await Purchase.findByPk(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  await p.destroy();
  res.json({ message: 'Deleted' });
});

module.exports = router;
