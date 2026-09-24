const router = require('express').Router();
const auth   = require('../middleware/auth');
const { Op }  = require('sequelize');

router.use(auth);

const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Cash',                 type: 'Asset',     description: 'Cash on hand' },
  { code: '1100', name: 'Bank',                 type: 'Asset',     description: 'Bank account' },
  { code: '1200', name: 'Accounts Receivable',  type: 'Asset',     description: 'Money owed by customers' },
  { code: '1300', name: 'Inventory',            type: 'Asset',     description: 'Stock value' },
  { code: '2000', name: 'Accounts Payable',     type: 'Liability', description: 'Money owed to suppliers' },
  { code: '3000', name: "Owner's Equity",       type: 'Equity',    description: 'Owner investment' },
  { code: '4000', name: 'Sales Revenue',        type: 'Revenue',   description: 'Revenue from sales' },
  { code: '5000', name: 'Cost of Goods Sold',   type: 'Expense',   description: 'Cost of sold products' },
  { code: '6000', name: 'Rent Expense',         type: 'Expense',   description: 'Shop rent' },
  { code: '6100', name: 'Utilities',            type: 'Expense',   description: 'Electricity, water, internet' },
  { code: '6200', name: 'Salaries',             type: 'Expense',   description: 'Staff salaries' },
  { code: '6300', name: 'Miscellaneous',        type: 'Expense',   description: 'Other expenses' },
];

let _synced = false;
async function ensureTables(models) {
  if (_synced) return;
  try {
    await models.Account.sync({ force: false });
    await models.JournalEntry.sync({ force: false });
    await models.JournalLine.sync({ force: false });
    _synced = true;
  } catch {}
}

async function seedAccounts(Account) {
  for (const a of DEFAULT_ACCOUNTS) {
    await Account.findOrCreate({ where: { code: a.code }, defaults: a });
  }
}

// GET /api/accounting/accounts
router.get('/accounts', async (req, res) => {
  const { Account } = req.models;
  await ensureTables(req.models);
  await seedAccounts(Account);
  const accounts = await Account.findAll({ order: [['code', 'ASC']] });
  res.json(accounts);
});

// POST /api/accounting/accounts
router.post('/accounts', async (req, res) => {
  const { Account } = req.models;
  await ensureTables(req.models);
  const { code, name, type, description } = req.body;
  if (!code || !name || !type) return res.status(422).json({ error: 'code, name, type required' });
  try {
    const acc = await Account.create({ code, name, type, description });
    res.status(201).json(acc);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT /api/accounting/accounts/:id
router.put('/accounts/:id', async (req, res) => {
  const { Account } = req.models;
  await ensureTables(req.models);
  const acc = await Account.findByPk(req.params.id);
  if (!acc) return res.status(404).json({ error: 'Account not found' });
  const { name, description, active } = req.body;
  await acc.update({ name, description, active });
  res.json(acc);
});

// GET /api/accounting/entries?page=1&limit=20&from=&to=
router.get('/entries', async (req, res) => {
  const { JournalEntry, JournalLine, Account } = req.models;
  await ensureTables(req.models);
  const page  = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const where = {};
  if (req.query.from && req.query.to) {
    where.date = { [Op.between]: [req.query.from, req.query.to] };
  }
  const { count, rows } = await JournalEntry.findAndCountAll({
    where, limit, offset: (page - 1) * limit,
    include: [{ model: JournalLine, as: 'lines', include: [{ model: Account, as: 'account' }] }],
    order: [['date', 'DESC'], ['id', 'DESC']],
  });
  res.json({ data: rows, total: count, page, pages: Math.ceil(count / limit) });
});

// POST /api/accounting/entries
router.post('/entries', async (req, res) => {
  const { JournalEntry, JournalLine } = req.models;
  await ensureTables(req.models);
  const { date, description, reference, lines } = req.body;
  if (!date || !description || !lines?.length) return res.status(422).json({ error: 'date, description, lines required' });
  const totalDebit  = lines.reduce((s, l) => s + Number(l.debit  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) return res.status(422).json({ error: 'Debits must equal credits' });
  const entry = await JournalEntry.create({ date, description, reference });
  await JournalLine.bulkCreate(lines.map(l => ({ entry_id: entry.id, account_id: l.account_id, debit: l.debit || 0, credit: l.credit || 0, memo: l.memo || null })));
  res.status(201).json({ id: entry.id });
});

// DELETE /api/accounting/entries/:id
router.delete('/entries/:id', async (req, res) => {
  const { JournalEntry, JournalLine } = req.models;
  await ensureTables(req.models);
  await JournalLine.destroy({ where: { entry_id: req.params.id } });
  await JournalEntry.destroy({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// GET /api/accounting/stock-value
router.get('/stock-value', async (req, res) => {
  const { Product } = req.models;
  try {
    const products = await Product.findAll();
    const value = products.reduce((s, p) => s + parseFloat(p.cost_price || 0) * parseFloat(p.stock_qty || 0), 0);
    res.json({ value: Math.round(value * 100) / 100, count: products.length });
  } catch {
    res.json({ value: 0, count: 0 });
  }
});

// GET /api/accounting/opening-balance-status
router.get('/opening-balance-status', async (req, res) => {
  const { JournalEntry } = req.models;
  await ensureTables(req.models);
  const entry = await JournalEntry.findOne({ where: { reference: 'OPENING-BALANCE' } });
  res.json({ exists: !!entry, date: entry?.date || null });
});

// POST /api/accounting/opening-balance
router.post('/opening-balance', async (req, res) => {
  const { JournalEntry, JournalLine, Account } = req.models;
  await ensureTables(req.models);
  await seedAccounts(Account);
  const already = await JournalEntry.findOne({ where: { reference: 'OPENING-BALANCE' } });
  if (already) return res.status(400).json({ error: 'Opening balance already posted' });
  const { date, lines } = req.body;
  if (!date || !lines?.length) return res.status(422).json({ error: 'date and lines required' });
  const totalDebit  = lines.reduce((s, l) => s + Number(l.debit  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) return res.status(422).json({ error: 'Debits must equal credits' });
  const entry = await JournalEntry.create({ date, description: 'Opening Balance', reference: 'OPENING-BALANCE' });
  await JournalLine.bulkCreate(lines.map(l => ({
    entry_id: entry.id, account_id: l.account_id,
    debit: Number(l.debit || 0), credit: Number(l.credit || 0), memo: 'Opening Balance',
  })));
  res.status(201).json({ id: entry.id });
});

// GET /api/accounting/trial-balance?from=&to=
router.get('/trial-balance', async (req, res) => {
  const { Account, JournalLine, JournalEntry } = req.models;
  await ensureTables(req.models);
  const accounts = await Account.findAll({ where: { active: true }, order: [['code', 'ASC']] });
  const result = await Promise.all(accounts.map(async acc => {
    const entryWhere = {};
    if (req.query.from && req.query.to) entryWhere.date = { [Op.between]: [req.query.from, req.query.to] };
    const lines = await JournalLine.findAll({
      where: { account_id: acc.id },
      include: entryWhere.date ? [{ model: JournalEntry, as: 'entry', where: entryWhere, required: true }] : [],
    });
    const debit  = lines.reduce((s, l) => s + Number(l.debit  || 0), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    return { id: acc.id, code: acc.code, name: acc.name, type: acc.type, debit, credit, balance: debit - credit };
  }));
  res.json(result.filter(r => r.debit !== 0 || r.credit !== 0 || true));
});

module.exports = router;
