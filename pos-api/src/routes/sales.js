const router = require('express').Router();
const { Op, fn, col, literal } = require('sequelize');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

function nextInvoiceNo(sequelize) {
  const d = new Date();
  const ds = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return sequelize.query(
    `SELECT invoice_no FROM sales ORDER BY id DESC LIMIT 1`,
    { type: sequelize.QueryTypes.SELECT }
  ).then(rows => {
    if (!rows.length) return `INV-${ds}-0001`;
    const last  = rows[0].invoice_no || '';
    const parts = last.split('-');
    const num   = parseInt(parts[parts.length - 1] || '0') + 1;
    return `INV-${ds}-${String(num).padStart(4, '0')}`;
  });
}

// GET /api/sales
router.get('/', auth, async (req, res) => {
  const { Sale, SaleItem, Payment, User, Customer } = req.models;
  const where = { status: { [Op.ne]: 'held' } };
  if (req.query.date) {
    const d = req.query.date;
    where.created_at = { [Op.between]: [`${d} 00:00:00`, `${d} 23:59:59`] };
  }
  if (req.query.search) {
    where.invoice_no = { [Op.like]: `%${req.query.search}%` };
  }
  if (req.query.method) {
    const allowed = ['cash', 'card', 'credit', 'qr'];
    if (allowed.includes(req.query.method)) {
      where.id = { [Op.in]: literal(`(SELECT DISTINCT sale_id FROM payments WHERE method = '${req.query.method}')`) };
    }
  }

  const page  = parseInt(req.query.page || '1');
  const limit = 20;
  const { count, rows } = await Sale.findAndCountAll({
    where,
    include: [
      { model: User,     as: 'user',     attributes: ['id', 'name'] },
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'] },
      { model: Payment,  as: 'payments' },
    ],
    order: [['id', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });
  res.json({ data: rows, total: count, page, last_page: Math.ceil(count / limit) });
});

// POST /api/sales
router.post('/', auth, async (req, res) => {
  const { Sale, SaleItem, Payment, Product, Customer, StockMovement } = req.models;
  const { items = [], payments = [], customer_id, client_id, ...saleData } = req.body;

  // Idempotency: if this client_id was already synced, return the existing sale
  if (client_id) {
    const existing = await Sale.findOne({
      where: { client_id },
      include: [
        { model: SaleItem, as: 'items' },
        { model: Payment,  as: 'payments' },
      ],
    });
    if (existing) return res.status(200).json(existing);
  }

  const invoice_no = await nextInvoiceNo(req.db);

  const sale = await Sale.create({ ...saleData, client_id: client_id || null, invoice_no, user_id: req.user.id, customer_id: customer_id || null });

  for (const item of items) {
    await SaleItem.create({ ...item, sale_id: sale.id });

    const product = await Product.findByPk(item.product_id);
    if (product) {
      const before = parseFloat(product.stock_qty);
      const after  = Math.max(0, before - parseFloat(item.qty));
      await product.update({ stock_qty: after });
      await StockMovement.create({
        product_id:   product.id,
        user_id:      req.user.id,
        type:         'out',
        qty:          item.qty,
        stock_before: before,
        stock_after:  after,
        reference:    invoice_no,
      });
    }
  }

  for (const pay of payments) await Payment.create({ ...pay, sale_id: sale.id });

  // Update customer credit balance if credit payment
  const creditPay = payments.find(p => p.method === 'credit');
  if (creditPay && customer_id) {
    const customer = await Customer.findByPk(customer_id);
    if (customer) {
      const newBalance = parseFloat(customer.credit_balance) + parseFloat(creditPay.amount);
      await customer.update({ credit_balance: newBalance });
    }
  }

  const created = await Sale.findByPk(sale.id, {
    include: [
      { model: SaleItem, as: 'items' },
      { model: Payment,  as: 'payments' },
    ],
  });
  res.status(201).json(created);
});

// GET /api/sales/held
router.get('/held', auth, async (req, res) => {
  const { Sale, SaleItem } = req.models;
  const held = await Sale.findAll({
    where: { status: 'held', user_id: req.user.id },
    include: [{ model: SaleItem, as: 'items' }],
    order: [['id', 'DESC']],
  });
  res.json(held);
});

// POST /api/sales/hold
router.post('/hold', auth, async (req, res) => {
  const { Sale, SaleItem } = req.models;
  const { items = [], ...saleData } = req.body;
  const invoice_no = await nextInvoiceNo(req.db);
  const sale = await Sale.create({ ...saleData, invoice_no, user_id: req.user.id, status: 'held' });
  for (const item of items) await SaleItem.create({ ...item, sale_id: sale.id });
  res.status(201).json(sale);
});

// GET /api/sales/:id
router.get('/:id', auth, async (req, res) => {
  const { Sale, SaleItem, Payment, User, Customer } = req.models;
  const sale = await Sale.findByPk(req.params.id, {
    include: [
      { model: SaleItem, as: 'items' },
      { model: Payment,  as: 'payments' },
      { model: User,     as: 'user',     attributes: ['id', 'name'] },
      { model: Customer, as: 'customer', attributes: ['id', 'name', 'phone'] },
    ],
  });
  if (!sale) return res.status(404).json({ error: 'Not found' });
  res.json(sale);
});

// DELETE /api/sales/:id
router.delete('/:id', auth, async (req, res) => {
  const { Sale } = req.models;
  const sale = await Sale.findByPk(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Not found' });
  await sale.destroy();
  res.json({ message: 'Deleted' });
});

// POST /api/sales/:id/mark-paid
router.post('/:id/mark-paid', auth, async (req, res) => {
  const { Sale, Payment, Customer } = req.models;
  const sale = await Sale.findByPk(req.params.id, { include: [{ model: Payment, as: 'payments' }] });
  if (!sale) return res.status(404).json({ error: 'Not found' });

  const balance = parseFloat(sale.balance || 0);
  if (balance <= 0) return res.status(400).json({ error: 'Invoice already paid' });

  await sale.update({ paid: parseFloat(sale.total), balance: 0 });

  if (sale.customer_id) {
    const customer = await Customer.findByPk(sale.customer_id);
    if (customer) {
      const newBalance = Math.max(0, parseFloat(customer.credit_balance) - balance);
      await customer.update({ credit_balance: newBalance });
    }
  }

  res.json({ message: 'Marked as paid' });
});

// GET /api/sales/:id/return
router.get('/:id/return', auth, async (req, res) => {
  const { Sale, SaleItem } = req.models;
  const sale = await Sale.findByPk(req.params.id, {
    include: [{ model: SaleItem, as: 'items' }],
  });
  if (!sale) return res.status(404).json({ error: 'Not found' });
  res.json(sale);
});

// POST /api/sales/:id/return
router.post('/:id/return', auth, async (req, res) => {
  const { Sale, SaleReturn, Product, StockMovement } = req.models;
  const sale = await Sale.findByPk(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Not found' });

  const { items = [], reason, total } = req.body;
  const return_no = `RET-${Date.now()}`;

  const ret = await SaleReturn.create({ sale_id: sale.id, user_id: req.user.id, return_no, reason, total, items });

  for (const item of items) {
    const product = await Product.findByPk(item.product_id);
    if (product) {
      const before = parseFloat(product.stock_qty);
      const after  = before + parseFloat(item.qty);
      await product.update({ stock_qty: after });
      await StockMovement.create({
        product_id: product.id, user_id: req.user.id, type: 'return',
        qty: item.qty, stock_before: before, stock_after: after, reference: return_no,
      });
    }
  }

  await sale.update({ status: 'returned' });
  res.status(201).json(ret);
});

module.exports = router;
