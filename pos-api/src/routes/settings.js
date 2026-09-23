const router = require('express').Router();
const { spawn } = require('child_process');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');

// Public — no auth needed (login page uses this)
router.get('/public', async (req, res) => {
  const { Setting } = req.models;
  const PUBLIC_KEYS = new Set(['shop_name', 'shop_logo', 'address', 'phone', 'receipt_footer', 'currency', 'interface_language', 'receipt_language', 'default_login_email', 'sidebar_theme', 'primary_color']);
  const rows = await Setting.findAll();
  const result = {};
  rows.forEach(s => { if (PUBLIC_KEYS.has(s.key)) result[s.key] = s.value; });
  res.json(result);
});

router.get('/', auth, async (req, res) => {
  const { Setting } = req.models;
  const settings = await Setting.findAll();
  res.json(Object.fromEntries(settings.map(s => [s.key, s.value])));
});

router.post('/', auth, async (req, res) => {
  const { Setting } = req.models;
  for (const [key, value] of Object.entries(req.body)) {
    await Setting.upsert({ key, value: value ?? '' });
  }
  const settings = await Setting.findAll();
  res.json(Object.fromEntries(settings.map(s => [s.key, s.value])));
});

// POST /api/settings/backup — streams a mysqldump of the tenant database
router.post('/backup', auth, (req, res) => {
  const cfg      = req.db.config;
  const db       = cfg.database;
  const stamp    = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const filename = `backup-${db}-${stamp}.sql`;

  const args = [
    '-h', cfg.host || 'localhost',
    '-P', String(cfg.port || 3306),
    '-u', cfg.username,
    `--password=${cfg.password}`,
    '--single-transaction',
    '--set-gtid-purged=OFF',
    db,
  ];

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const dump = spawn('mysqldump', args);
  dump.stdout.pipe(res);
  dump.stderr.on('data', d => console.error('mysqldump:', d.toString()));
  dump.on('error', err => {
    console.error('mysqldump error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'mysqldump failed: ' + err.message });
  });
});

module.exports = router;
