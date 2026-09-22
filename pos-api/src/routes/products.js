const router = require('express').Router();
const { Op }  = require('sequelize');
const auth    = require('../middleware/auth');
const role    = require('../middleware/role');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 300 });

function productToItem(p) {
  const today = new Date().toISOString().slice(0, 10);
  const promoActive = p.promo_price
    && p.promo_start_date <= today
    && p.promo_end_date   >= today;

  return {
    id:              p.id,
    name:            p.name,
    name_si:         p.name_si,
    barcode:         p.barcode,
    image:           p.image,
    selling_price:   parseFloat(p.selling_price),
    wholesale_price: parseFloat(p.wholesale_price),
    cost_price:      parseFloat(p.cost_price),
    stock_qty:       parseFloat(p.stock_qty),
    unit:            p.unit ?? 'pcs',
    promo_price:     promoActive ? parseFloat(p.promo_price) : null,
    our_price:       p.our_price ? parseFloat(p.our_price) : null,
    is_fast_moving: !!p.is_fast_moving,
    sizes: (p.variants || []).map(v => ({
      id:                v.id,
      label:             v.label,
      price:             parseFloat(v.selling_price),
      conversion_factor: parseFloat(v.conversion_factor ?? 1),
    })),
  };
}

// GET /api/products/all  — full catalogue for POS client cache
router.get('/all', auth, async (req, res) => {
  const cacheKey = `${req.tenant}_products_all`;
  const cached   = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const { Product, ProductVariant } = req.models;
  const products = await Product.findAll({
    where: { active: true },
    include: [{ model: ProductVariant, as: 'variants' }],
    order: [['id', 'ASC']],
  });

  const data = products.map(productToItem);
  cache.set(cacheKey, data);
  res.json(data);
});

// GET /api/products/version
router.get('/version', auth, async (req, res) => {
  const { Product, ProductVariant } = req.models;
  const [pVer, vVer] = await Promise.all([
    Product.max('updated_at', { where: { active: true } }),
    ProductVariant.max('updated_at'),
  ]);
  const version = String(pVer || '') > String(vVer || '') ? String(pVer) : String(vVer);
  res.json({ version });
});

// GET /api/products/export — CSV download
router.get('/export', auth, async (req, res) => {
  const { Product } = req.models;
  const products = await Product.findAll({
    where: { active: true },
    order: [['id', 'ASC']],
    attributes: ['id', 'name', 'stock_qty', 'cost_price', 'selling_price'],
  });

  const header = 'ID,Name,Qty,Cost Price,Selling Price\n';
  const rows   = products.map(p =>
    [p.id, `"${(p.name || '').replace(/"/g, '""')}"`, parseFloat(p.stock_qty), parseFloat(p.cost_price), parseFloat(p.selling_price)].join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="products-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(header + rows);
});

// GET /api/products/intake-lookup?barcode=  — finds any product (active or not)
router.get('/intake-lookup', auth, async (req, res) => {
  const { Product, Category } = req.models;
  const barcode = (req.query.barcode || '').trim();
  if (!barcode) return res.status(400).json({ error: 'barcode required' });
  const product = await Product.findOne({
    where: { barcode },
    include: [{ model: Category, as: 'category' }],
  });
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

// GET /api/products/search?q=&barcode=
router.get('/search', auth, async (req, res) => {
  const { Product, ProductVariant } = req.models;

  if (req.query.barcode) {
    const product = await Product.findOne({
      where: { active: true, barcode: req.query.barcode.trim() },
      include: [{ model: ProductVariant, as: 'variants' }],
    });
    return res.json(product ? [productToItem(product)] : []);
  }

  const q = (req.query.q || '').trim();
  const products = await Product.findAll({
    where: {
      active: true,
      [Op.or]: [
        { name:     { [Op.like]: `%${q}%` } },
        { name_si:  { [Op.like]: `%${q}%` } },
        { barcode:  { [Op.like]: `%${q}%` } },
      ],
    },
    include: [{ model: ProductVariant, as: 'variants' }],
    order: [['id', 'ASC']],
    limit: 20,
  });
  res.json(products.map(productToItem));
});

// GET /api/products
router.get('/', auth, async (req, res) => {
  const { Product, ProductVariant, Category } = req.models;
  const where = {};
  if (req.query.search) {
    const s = req.query.search;
    where[Op.or] = [
      { name:    { [Op.like]: `%${s}%` } },
      { name_si: { [Op.like]: `%${s}%` } },
      { barcode: { [Op.like]: `%${s}%` } },
    ];
  }
  if (req.query.category_id) where.category_id = req.query.category_id;
  if (req.query.active !== undefined) where.active = req.query.active === 'true' || req.query.active === '1';
  if (req.query.low_stock === 'true') {
    where[Op.and] = [
      ...(where[Op.and] || []),
      req.db.literal('`Product`.`stock_qty` <= `Product`.`alert_qty`'),
    ];
  }

  const page  = parseInt(req.query.page || '1');
  const limit = parseInt(req.query.limit || '20');
  const { count, rows } = await Product.findAndCountAll({
    where,
    include: [
      { model: Category,        as: 'category' },
      { model: ProductVariant,  as: 'variants' },
    ],
    order: [['id', 'ASC']],
    limit,
    offset: (page - 1) * limit,
  });

  res.json({ data: rows, total: count, page, last_page: Math.ceil(count / limit) });
});

// POST /api/products/import — batch CSV import
router.post('/import', auth, async (req, res) => {
  const { Product } = req.models;
  const rows = Array.isArray(req.body) ? req.body : (req.body.products || []);
  let created = 0, skipped = 0;
  for (const row of rows) {
    if (!row.name) { skipped++; continue; }
    try {
      await Product.create({
        name:          row.name,
        barcode:       row.barcode || null,
        selling_price: parseFloat(row.selling_price) || 0,
        cost_price:    parseFloat(row.cost_price)    || 0,
        wholesale_price: parseFloat(row.wholesale_price) || 0,
        stock_qty:     parseFloat(row.stock_qty)     || 0,
        alert_qty:     parseFloat(row.alert_qty)     || 5,
        unit:          row.unit  || 'pcs',
        active:        true,
      });
      created++;
    } catch { skipped++; }
  }
  cache.del(`${req.tenant}_products_all`);
  res.json({ created, skipped });
});

// POST /api/products/truncate — remove all products (admin only)
router.post('/truncate', auth, async (req, res) => {
  const confirmed = req.body?.confirm === 'TRUNCATE_PRODUCTS';
  if (!confirmed) {
    return res.status(400).json({ error: 'Confirmation token required (TRUNCATE_PRODUCTS).' });
  }

  try {
    const { Product, ProductVariant } = req.models;
    const deletedVariants = await ProductVariant.destroy({ where: {} });
    const deletedProducts = await Product.destroy({ where: {} });
    cache.del(`${req.tenant}_products_all`);
    res.json({ deletedProducts, deletedVariants });
  } catch (error) {
    res.status(422).json({ error: error.message || 'Unable to truncate products table.' });
  }
});

// POST /api/products
router.post('/', auth, async (req, res) => {
  const { Product, ProductVariant } = req.models;
  const { variants = [], ...data } = req.body;

  if (!data.barcode) data.barcode = data.name.replace(/\s+/g, '').toUpperCase().slice(0, 8) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();

  if (data.barcode) {
    const existing = await Product.findOne({ where: { barcode: data.barcode } });
    if (existing) return res.status(409).json({ error: `Barcode already used by "${existing.name}"` });
  }

  const product = await Product.create(data);
  for (const v of variants) await ProductVariant.create({ ...v, product_id: product.id });

  cache.del(`${req.tenant}_products_all`);
  res.status(201).json(product);
});

// GET /api/products/:id
router.get('/:id', auth, async (req, res) => {
  const { Product, ProductVariant, Category } = req.models;
  const product = await Product.findByPk(req.params.id, {
    include: [
      { model: Category,       as: 'category' },
      { model: ProductVariant, as: 'variants' },
    ],
  });
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

// PUT /api/products/:id
router.put('/:id', auth, async (req, res) => {
  const { Product, ProductVariant } = req.models;
  const product = await Product.findByPk(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });

  const { variants = [], ...data } = req.body;

  if (data.barcode) {
    const existing = await Product.findOne({ where: { barcode: data.barcode } });
    if (existing && existing.id !== product.id) return res.status(409).json({ error: `Barcode already used by "${existing.name}"` });
  }

  await product.update(data);

  // Sync variants
  const keptIds = [];
  for (const v of variants) {
    if (v.id) {
      const variant = await ProductVariant.findOne({ where: { id: v.id, product_id: product.id } });
      if (variant) { await variant.update(v); keptIds.push(variant.id); }
    } else {
      const newV = await ProductVariant.create({ ...v, product_id: product.id });
      keptIds.push(newV.id);
    }
  }
  await ProductVariant.destroy({ where: { product_id: product.id, id: { [Op.notIn]: keptIds.length ? keptIds : [0] } } });

  cache.del(`${req.tenant}_products_all`);
  res.json(product);
});

// DELETE /api/products/:id
router.delete('/:id', auth, async (req, res) => {
  const { Product } = req.models;
  const product = await Product.findByPk(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  await product.destroy();
  cache.del(`${req.tenant}_products_all`);
  res.json({ message: 'Deleted' });
});

module.exports = router;
