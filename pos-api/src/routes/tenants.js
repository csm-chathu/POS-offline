const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const { Sequelize } = require('sequelize');
const auth          = require('../middleware/auth');
const getModels     = require('../models');
const { getMasterDb } = require('../config/masterDb');
const { bustCache } = require('../config/tenantCache');

// POST /api/tenants/provision — streams progress via Server-Sent Events
router.post('/provision', auth, async (req, res) => {
  const {
    hostname, db_name, db_user, db_password, db_host = '127.0.0.1', db_port = 3306,
    admin_name = 'Admin', admin_email, admin_password,
    copy_products = true,
  } = req.body;

  if (!hostname || !db_name || !db_user || !db_password || !admin_email || !admin_password) {
    return res.status(422).json({ error: 'Missing required fields' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function send(step, status = 'ok') {
    res.write(`data: ${JSON.stringify({ step, status })}\n\n`);
  }

  const db = `\`${db_name}\``;

  try {
    // master runs as root — has access to all DBs on this server
    const { master, Tenant } = getMasterDb();

    // 1. Create database
    await master.query(
      `CREATE DATABASE IF NOT EXISTS ${db} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    send(`Database ${db_name} created`);

    // 2. Sync all tables via Sequelize
    const seq = new Sequelize(db_name, db_user, db_password, {
      host:    db_host,
      port:    parseInt(db_port),
      dialect: 'mysql',
      logging: false,
      pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
      define: { timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at', underscored: true },
    });
    getModels(seq);
    await seq.sync({ force: false });
    await seq.close();
    send('Tables migrated');

    // From here use master (root) for cross-DB raw SQL — avoids all ORM column-mapping issues
    // and is orders of magnitude faster for bulk data.

    // 3. Seed roles
    await master.query(
      `INSERT IGNORE INTO ${db}.roles (name) VALUES ('admin'), ('manager'), ('cashier')`
    );
    send('Roles seeded (admin, manager, cashier)');

    // 4. Copy features from pos_master
    await master.query(
      `INSERT IGNORE INTO ${db}.features
         (\`key\`, label, path, \`group\`, sort_order, icon, offline_ok)
       SELECT \`key\`, label, path, \`group\`, sort_order, icon, offline_ok
       FROM pos_master.features`
    );
    const [[{ total: fCount }]] = await master.query(
      `SELECT COUNT(*) AS total FROM ${db}.features`
    );
    send(`Features seeded (${fCount})`);

    // 5. Create admin user + assign role
    const hash = await bcrypt.hash(admin_password, 12);
    await master.query(
      `INSERT IGNORE INTO ${db}.users (name, email, password, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())`,
      { replacements: [admin_name, admin_email, hash] }
    );
    await master.query(
      `INSERT IGNORE INTO ${db}.user_role (user_id, role_id)
       SELECT u.id, r.id FROM ${db}.users u, ${db}.roles r
       WHERE u.email = ? AND r.name = 'admin'`,
      { replacements: [admin_email] }
    );
    send(`Admin user created (${admin_email})`);

    // 6. Copy categories
    await master.query(
      `INSERT IGNORE INTO ${db}.categories (id, name, created_at, updated_at)
       SELECT id, name, created_at, updated_at FROM pos_master.categories`
    );
    const [[{ total: cCount }]] = await master.query(
      `SELECT COUNT(*) AS total FROM ${db}.categories`
    );
    send(`Categories copied (${cCount})`);

    // 7. Copy products
    if (copy_products) {
      await master.query(
        `INSERT IGNORE INTO ${db}.products
           (id, category_id, name, name_si, barcode, sku, description, image,
            cost_price, selling_price, wholesale_price, promo_price,
            promo_start_date, promo_end_date, our_price, expiry_date,
            stock_qty, alert_qty, unit, active, is_fast_moving,
            created_at, updated_at)
         SELECT
           id, category_id, name, name_si, barcode, sku, description, image,
           cost_price, selling_price, wholesale_price, promo_price,
           promo_start_date, promo_end_date, our_price, expiry_date,
           stock_qty, alert_qty, unit, active, is_fast_moving,
           created_at, updated_at
         FROM pos_master.products`
      );
      const [[{ total: pCount }]] = await master.query(
        `SELECT COUNT(*) AS total FROM ${db}.products`
      );
      send(`Products copied (${pCount})`);
    }

    // 8. Register tenant in pos_master
    await Tenant.findOrCreate({
      where: { hostname },
      defaults: { hostname, db_name, db_user, db_password, db_host, db_port, active: true },
    });
    send('Tenant registered');

    send('done', 'done');
  } catch (err) {
    console.error('[provision]', err.message);
    send(`Error: ${err.message}`, 'error');
  } finally {
    res.end();
  }
});

// GET /api/tenants
router.get('/', auth, async (req, res) => {
  const { Tenant } = getMasterDb();
  const tenants = await Tenant.findAll({ order: [['id', 'ASC']] });
  res.json(tenants);
});

// PUT /api/tenants/:id — update DB mapping
router.put('/:id', auth, async (req, res) => {
  const { Tenant } = getMasterDb();
  const { hostname, db_name, db_user, db_password, db_host, db_port, active } = req.body;

  // Read old hostname to bust its cache entry
  const old = await Tenant.findByPk(req.params.id, { attributes: ['hostname'] });

  await Tenant.update(
    { hostname, db_name, db_user, db_password, db_host, db_port, active },
    { where: { id: req.params.id } }
  );

  // Clear cached connection so next request picks up the new config
  if (old) bustCache(old.hostname);
  if (hostname !== old?.hostname) bustCache(hostname);

  res.json({ ok: true });
});

// DELETE /api/tenants/:id — deactivate only (does not drop DB)
router.delete('/:id', auth, async (req, res) => {
  const { Tenant } = getMasterDb();
  await Tenant.update({ active: false }, { where: { id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;
