require('dotenv').config();
const express = require('express');
const path    = require('path');
const fs      = require('fs');

// Prevent unhandled DB errors from crashing the process
process.on('unhandledRejection', (err) => {
  console.error('[Unhandled Rejection]', err?.message || err);
});
const cors    = require('cors');
const tenant  = require('./middleware/tenant');

const app = express();

app.use(cors({
  origin: (origin, cb) => cb(null, true), // tighten in production
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Tenant DB switch — must be before all routes
app.use(tenant);

// Health check
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// Routes
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/me',        require('./routes/auth')); // /api/me is in auth router
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/products',  require('./routes/products'));
app.use('/api/categories',require('./routes/categories'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/sales',     require('./routes/sales'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/settings',  require('./routes/settings'));
app.use('/api/users',     require('./routes/users'));
app.use('/api/features',  require('./routes/features'));
app.use('/api/roles',     require('./routes/roles'));
app.use('/api/reports',   require('./routes/reports'));
app.use('/api/imagekit',       require('./routes/imagekit'));
app.use('/api/notifications',  require('./routes/notifications'));
app.use('/api/tenants',        require('./routes/tenants'));
app.use('/api/scale',          require('./routes/scale'));

// Wrap all async route handlers so thrown errors flow to the error handler
function wrapAsync(router) {
  router.stack.forEach(layer => {
    if (layer.handle?.stack) wrapAsync(layer.handle);
    else if (layer.route) {
      layer.route.stack.forEach(r => {
        const orig = r.handle;
        r.handle = (req, res, next) => {
          const result = orig(req, res, next);
          if (result?.catch) result.catch(next);
        };
      });
    }
  });
}

// Apply async wrapper to all mounted routers
['auth', 'dashboard', 'products', 'categories', 'suppliers', 'customers', 'sales', 'purchases', 'settings', 'users', 'reports'].forEach(name => {
  try { wrapAsync(require(`./routes/${name}`)); } catch {}
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err?.message || err);

  const DB_ERRORS = new Set([
    'SequelizeConnectionRefusedError',
    'SequelizeAccessDeniedError',
    'SequelizeConnectionError',
    'SequelizeHostNotFoundError',
    'SequelizeHostNotReachableError',
    'SequelizeInvalidConnectionError',
  ]);

  if (DB_ERRORS.has(err.name) && req.tenant) {
    // Evict both caches so the next request tries fresh
    const { bustCache } = require('./config/tenantCache');
    bustCache(req.tenant);
    return res.status(503).json({ error: `Cannot connect to tenant database for "${req.tenant}". Check the DB mapping.` });
  }

  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ── Static file serving (offline mode) ───────────────────────────────────────
const publicDir = path.join(__dirname, '../public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  // Catch-all: serve React index.html for any non-API route
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 8000;

async function runMigrations(sequelize) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      ran_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const [ran] = await sequelize.query(`SELECT name FROM _migrations`);
  const done = new Set(ran.map(r => r.name));

  // Add future schema migrations here — they run once and are never repeated
  const migrations = [
    // { name: '001_example', sql: `ALTER TABLE products ADD COLUMN weight REAL DEFAULT 0` },
  ];

  for (const m of migrations) {
    if (done.has(m.name)) continue;
    try {
      await sequelize.query(m.sql);
      await sequelize.query(`INSERT INTO _migrations (name) VALUES ('${m.name}')`);
      console.log('[migration] ran:', m.name);
    } catch (e) {
      console.error('[migration] failed:', m.name, e.message);
    }
  }
}

async function seedProducts(sequelize, models) {
  const { Product } = models;
  const seedFile = path.join(__dirname, '../seeds/data.json');
  console.log('[seed] file path:', seedFile);
  if (!fs.existsSync(seedFile)) return { ok: false, error: 'Seed file not found: ' + seedFile };

  const { categories, products } = JSON.parse(fs.readFileSync(seedFile, 'utf8'));

  // SQLite max bind variables = 999.
  // categories: 2 cols → max 499 per chunk. Products: 20 cols → max 49 per chunk.
  const CAT_CHUNK  = 400;
  const PROD_CHUNK = 40;

  await sequelize.transaction(async (t) => {
    for (let i = 0; i < categories.length; i += CAT_CHUNK) {
      const batch = categories.slice(i, i + CAT_CHUNK);
      const placeholders = batch.map(() => '(?,?)').join(',');
      const values = batch.flatMap(c => [c.id, c.name]);
      await sequelize.query(`INSERT OR IGNORE INTO categories (id, name) VALUES ${placeholders}`, { replacements: values, transaction: t });
    }
    console.log(`[seed] ${categories.length} categories done`);

    const cols = 'id,category_id,name,name_si,barcode,sku,description,cost_price,selling_price,wholesale_price,promo_price,promo_start_date,promo_end_date,our_price,expiry_date,stock_qty,alert_qty,unit,active,is_fast_moving';
    const colList = cols.split(',');
    for (let i = 0; i < products.length; i += PROD_CHUNK) {
      const batch = products.slice(i, i + PROD_CHUNK);
      const placeholders = batch.map(() => `(${colList.map(() => '?').join(',')})`).join(',');
      const values = batch.flatMap(p => colList.map(c => p[c] ?? null));
      await sequelize.query(`INSERT OR IGNORE INTO products (${cols}) VALUES ${placeholders}`, { replacements: values, transaction: t });
      if (i % 400 === 0) console.log(`[seed] products ${Math.min(i + PROD_CHUNK, products.length)}/${products.length}`);
    }
    console.log(`[seed] ${products.length} products done`);
  });

  const productCount = await Product.count();
  return { ok: true, categories: categories.length, products: products.length, total_in_db: productCount };
}

// Manual seed endpoint (SQLite/offline mode only)
app.post('/api/seed', async (req, res) => {
  if (process.env.DIALECT !== 'sqlite') return res.status(403).json({ error: 'Only available in offline mode' });
  try {
    const { getTenantDb } = require('./config/db');
    const { sequelize, models } = getTenantDb({}, 'local');
    const result = await seedProducts(sequelize, models);
    res.json(result);
  } catch (e) {
    console.error('[seed endpoint]', e.message, e.stack);
    res.status(500).json({ error: e.message });
  }
});

async function startServer() {
  // SQLite/offline mode — sync schema and seed default admin before accepting requests
  if (process.env.DIALECT === 'sqlite') {
    const { getTenantDb } = require('./config/db');
    const { sequelize, models } = getTenantDb({}, 'local');
    await runMigrations(sequelize);
    try {
      await sequelize.query('PRAGMA foreign_keys = OFF');
      await sequelize.sync({ alter: true });
      await sequelize.query('PRAGMA foreign_keys = ON');
    } catch (e) {
      console.error('[DB sync error]', e.message);
      // continue — tables may already be correct from a prior run
    }
    try {
      const bcrypt = require('bcryptjs');
      const { User, Role } = models;
      const [role] = await Role.findOrCreate({ where: { name: 'admin' }, defaults: { name: 'admin' } });
      const hash = await bcrypt.hash('admin123', 10);
      const existing = await User.findOne({ where: { email: 'admin@pos.local' } });
      if (!existing) {
        const user = await User.create({ name: 'Admin', email: 'admin@pos.local', password: hash });
        await sequelize.query(`INSERT OR IGNORE INTO user_role (user_id, role_id) VALUES (${user.id}, ${role.id})`);
        console.log('[DB] Default admin created — email: admin@pos.local  password: admin123');
      } else {
        await existing.update({ password: hash });
        await sequelize.query(`INSERT OR IGNORE INTO user_role (user_id, role_id) VALUES (${existing.id}, ${role.id})`);
        console.log('[DB] Admin password reset — email: admin@pos.local  password: admin123');
      }
    } catch (e) { console.error('[DB seed error]', e.message); }

    // Seed features and assign all to admin role
    try {
      const { Feature, Role } = models;
      const DEFAULT_FEATURES = [
        { key: 'dashboard',  label: 'Dashboard',   path: '/dashboard',      group: 'main', sort_order: 1,  icon: 'dashboard',  offline_ok: true },
        { key: 'pos',        label: 'POS',          path: '/sales/create',   group: 'main', sort_order: 2,  icon: 'pos',        offline_ok: true },
        { key: 'sales',      label: 'Sales',        path: '/sales',          group: 'main', sort_order: 3,  icon: 'sales',      offline_ok: true },
        { key: 'products',   label: 'Products',     path: '/products',       group: 'main', sort_order: 4,  icon: 'products',   offline_ok: true },
        { key: 'customers',  label: 'Customers',    path: '/customers',      group: 'main', sort_order: 5,  icon: 'customers',  offline_ok: true },
        { key: 'credit',     label: 'Credit Book',  path: '/credit',         group: 'main', sort_order: 6,  icon: 'credit',     offline_ok: true },
        { key: 'purchases',  label: 'Purchases',    path: '/purchases',      group: 'main', sort_order: 7,  icon: 'purchases',  offline_ok: true },
        { key: 'suppliers',  label: 'Suppliers',    path: '/suppliers',      group: 'main', sort_order: 8,  icon: 'suppliers',  offline_ok: true },
        { key: 'categories', label: 'Categories',   path: '/categories',     group: 'main', sort_order: 9,  icon: 'categories', offline_ok: true },
        { key: 'reports',    label: 'Reports',      path: '/reports',        group: 'mgmt', sort_order: 1,  icon: 'reports',    offline_ok: true },
        { key: 'invoices',   label: 'Invoices',     path: '/invoices',       group: 'mgmt', sort_order: 2,  icon: 'invoices',   offline_ok: true },
        { key: 'users',      label: 'Users',        path: '/users',          group: 'mgmt', sort_order: 3,  icon: 'users',      offline_ok: true },
        { key: 'settings',   label: 'Settings',     path: '/settings',       group: 'mgmt', sort_order: 4,  icon: 'settings',   offline_ok: true },
      ];

      for (const f of DEFAULT_FEATURES) {
        await Feature.findOrCreate({ where: { key: f.key }, defaults: f });
      }

      // Assign every feature to the admin role
      const adminRole = await Role.findOne({ where: { name: 'admin' } });
      if (adminRole) {
        const allFeatures = await Feature.findAll();
        await adminRole.setFeatures(allFeatures);
      }
      console.log('[DB] Features seeded and assigned to admin role');
    } catch (e) { console.error('[DB feature seed error]', e.message); }

    // Seed products and categories from bundled data.json (first install only)
    try {
      const { Product } = models;
      const productCount = await Product.count();
      if (productCount === 0) {
        console.log('[DB] First install — running product seed...');
        const result = await seedProducts(sequelize, models);
        if (result.ok) console.log(`[DB] Seed complete: ${result.categories} categories, ${result.products} products`);
        else console.error('[DB] Seed failed:', result.error);
      } else {
        console.log(`[DB] Skipping product seed — ${productCount} products already exist`);
      }
    } catch (e) { console.error('[DB product seed error]', e.message, e.stack); }
  }

  app.listen(PORT, () => console.log(`POS API running on http://localhost:${PORT}`));
}

startServer().catch(e => { console.error('[startup]', e.message); });
