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

async function startServer() {
  // SQLite/offline mode — sync schema and seed default admin before accepting requests
  if (process.env.DIALECT === 'sqlite') {
    const { getTenantDb } = require('./config/db');
    const { sequelize, models } = getTenantDb({}, 'local');
    await runMigrations(sequelize);
    await sequelize.sync({ alter: true });
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
      const { Category, Product } = models;
      const productCount = await Product.count();
      if (productCount === 0) {
        const seedFile = path.join(__dirname, '../seeds/data.json');
        if (fs.existsSync(seedFile)) {
          console.log('[DB] First install detected — seeding products...');
          const { categories, products } = JSON.parse(fs.readFileSync(seedFile, 'utf8'));

          // Insert categories preserving original IDs
          const CHUNK = 200;
          for (let i = 0; i < categories.length; i += CHUNK) {
            await Category.bulkCreate(categories.slice(i, i + CHUNK), { ignoreDuplicates: true });
          }
          console.log(`[DB] ${categories.length} categories seeded`);

          // Insert products in chunks to avoid memory pressure
          for (let i = 0; i < products.length; i += CHUNK) {
            await Product.bulkCreate(products.slice(i, i + CHUNK), { ignoreDuplicates: true });
            if (i % 2000 === 0) console.log(`[DB] Products seeded: ${Math.min(i + CHUNK, products.length)}/${products.length}`);
          }
          console.log(`[DB] ${products.length} products seeded`);
        }
      }
    } catch (e) { console.error('[DB product seed error]', e.message); }
  }

  app.listen(PORT, () => console.log(`POS API running on http://localhost:${PORT}`));
}

startServer().catch(e => { console.error('[startup]', e.message); process.exit(1); });
