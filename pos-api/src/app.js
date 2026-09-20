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

async function startServer() {
  // SQLite/offline mode — sync schema and seed default admin before accepting requests
  if (process.env.DIALECT === 'sqlite') {
    const { getTenantDb } = require('./config/db');
    const { sequelize, models } = getTenantDb({}, 'local');
    await sequelize.sync({ alter: true });
    try {
      const bcrypt = require('bcryptjs');
      const { User, Role } = models;
      const [role] = await Role.findOrCreate({ where: { name: 'admin' }, defaults: { name: 'admin' } });
      const hash = await bcrypt.hash('admin123', 10);
      const existing = await User.findOne({ where: { email: 'admin@pos.local' } });
      if (!existing) {
        const user = await User.create({ name: 'Admin', email: 'admin@pos.local', password: hash });
        await sequelize.query(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (${user.id}, ${role.id})`);
        console.log('[DB] Default admin created — email: admin@pos.local  password: admin123');
      } else {
        await existing.update({ password: hash });
        await sequelize.query(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (${existing.id}, ${role.id})`);
        console.log('[DB] Admin password reset — email: admin@pos.local  password: admin123');
      }
    } catch (e) { console.error('[DB seed error]', e.message); }
  }

  app.listen(PORT, () => console.log(`POS API running on http://localhost:${PORT}`));
}

startServer().catch(e => { console.error('[startup]', e.message); process.exit(1); });
