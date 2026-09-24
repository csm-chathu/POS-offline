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
app.use('/api/extensions',     require('./routes/extensions'));
app.use('/api/accounting',     require('./routes/accounting'));

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
    { name: '002_remove_duplicate_pos_feature', sql: `DELETE FROM features WHERE \`key\` = 'pos'` },
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

  // Use bind ($1,$2,...) not replacements (?) — bind uses native SQLite C-level
  // parameterization so values containing '?' never corrupt the query.
  // created_at/updated_at must be included explicitly — they are NOT NULL with no DB default.
  const cols    = 'id,category_id,name,name_si,barcode,sku,description,cost_price,selling_price,wholesale_price,promo_price,promo_start_date,promo_end_date,our_price,expiry_date,stock_qty,alert_qty,unit,active,is_fast_moving,created_at,updated_at';
  const colList = cols.split(',');
  const now     = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const prodSql = `INSERT OR IGNORE INTO products (${cols}) VALUES (${colList.map((_, i) => `$${i + 1}`).join(',')})`;

  // Categories in their own transaction — commits even if products fail later
  // created_at/updated_at must be included — they are NOT NULL with no DB default.
  await sequelize.transaction(async (t) => {
    for (const cat of categories) {
      await sequelize.query(
        'INSERT OR IGNORE INTO categories (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)',
        { bind: [cat.id, cat.name, now, now], transaction: t }
      );
    }
  });
  console.log(`[seed] ${categories.length} categories done`);

  // Products in their own transaction
  await sequelize.transaction(async (t) => {
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const values = colList.map(c => {
        if (c === 'active') return 0;
        if (c === 'created_at' || c === 'updated_at') return now;
        return p[c] ?? null;
      });
      await sequelize.query(prodSql, { bind: values, transaction: t });
      if (i % 1000 === 0) console.log(`[seed] products ${i}/${products.length}`);
    }
  });
  console.log(`[seed] ${products.length} products done`);

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
      const hash = await bcrypt.hash('123', 10);
      const existing = await User.findOne({ where: { email: 'admin' } });
      if (!existing) {
        const user = await User.create({ name: 'Admin', email: 'admin', password: hash });
        await sequelize.query(`INSERT OR IGNORE INTO user_role (user_id, role_id) VALUES (${user.id}, ${role.id})`);
        console.log('[DB] Default admin created — email: admin  password: 123');
      } else {
        await existing.update({ password: hash });
        await sequelize.query(`INSERT OR IGNORE INTO user_role (user_id, role_id) VALUES (${existing.id}, ${role.id})`);
        console.log('[DB] Admin password reset — email: admin  password: 123');
      }
    } catch (e) { console.error('[DB seed error]', e.message); }

    // Seed features and assign all to admin role
    try {
      const { Feature, Role } = models;
      const DEFAULT_FEATURES = [
        { key: 'dashboard',  label: 'Dashboard',       path: '/dashboard',      group: 'main', sort_order: 1,  icon: 'dashboard',  offline_ok: true },
        { key: 'new_sale',   label: 'New Sale (POS)',  path: '/sales/create',   group: 'main', sort_order: 2,  icon: 'pos',        offline_ok: true },
        { key: 'sales',      label: 'Sales',           path: '/sales',          group: 'main', sort_order: 3,  icon: 'sales',      offline_ok: true },
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
        { key: 'data_import',      label: 'Data Import',       path: '/admin/data-import', group: 'mgmt', sort_order: 5, icon: 'upload',    offline_ok: false },
        { key: 'role_permissions', label: 'Role Permissions',  path: '/settings/roles',    group: 'mgmt', sort_order: 6, icon: 'settings',  offline_ok: true  },
        { key: 'extensions',       label: 'Extensions',        path: '/extensions',         group: 'mgmt', sort_order: 7, icon: 'extensions', offline_ok: true  },
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

    // Seed permission manager user (settings + users access only)
    try {
      const bcrypt = require('bcryptjs');
      const { User, Role, Feature } = models;
      const [managerRole] = await Role.findOrCreate({ where: { name: 'setup' }, defaults: { name: 'setup' } });
      const hash = await bcrypt.hash('123', 10);
      let managerUser = await User.findOne({ where: { email: 'manager' } });
      if (!managerUser) {
        managerUser = await User.create({ name: 'Permission Manager', email: 'manager', password: hash });
        await sequelize.query(`INSERT OR IGNORE INTO user_role (user_id, role_id) VALUES (${managerUser.id}, ${managerRole.id})`);
        console.log('[DB] Permission manager created — email: manager  password: 123');
      }
      // Assign settings + users to the manager role (role-level permissions)
      const allowedFeatures = await Feature.findAll({ where: { key: ['settings', 'users', 'role_permissions'] } });
      if (allowedFeatures.length > 0) {
        await managerRole.setFeatures(allowedFeatures);
        // Also sync direct user-level features for the seeded manager user
        await sequelize.query(`DELETE FROM user_features WHERE user_id = ${managerUser.id}`);
        for (const f of allowedFeatures) {
          await sequelize.query(`INSERT OR IGNORE INTO user_features (user_id, feature_id) VALUES (${managerUser.id}, ${f.id})`);
        }
      }
      console.log('[DB] Manager role permissions set — settings + users');
    } catch (e) { console.error('[DB manager seed error]', e.message); }

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
