const router = require('express').Router();
const auth   = require('../middleware/auth');
const https  = require('https');

// All extension routes require auth
router.use(auth);

// Ensure the extensions table exists (runs once, no-op after first call)
let _tableSynced = false;
async function ensureTable(Extension) {
  if (_tableSynced) return;
  try { await Extension.sync({ force: false }); _tableSynced = true; } catch {}
}

// GET /api/extensions — list all known extension keys with their DB state
router.get('/', async (req, res) => {
  const { Extension } = req.models;
  await ensureTable(Extension);
  try {
    const rows = await Extension.findAll();
    const map  = Object.fromEntries(rows.map(r => [r.key, r]));
    res.json(map);
  } catch {
    res.json({});
  }
});

// POST /api/extensions/:key/toggle — enable/disable
router.post('/:key/toggle', async (req, res) => {
  const { Extension } = req.models;
  await ensureTable(Extension);
  const [ext] = await Extension.findOrCreate({
    where:    { key: req.params.key },
    defaults: { key: req.params.key, enabled: false },
  });
  await ext.update({ enabled: !ext.enabled });
  res.json({ key: ext.key, enabled: ext.enabled });
});

// POST /api/extensions/:key/configure — save config JSON
router.post('/:key/configure', async (req, res) => {
  const { Extension } = req.models;
  await ensureTable(Extension);
  const [ext] = await Extension.findOrCreate({
    where:    { key: req.params.key },
    defaults: { key: req.params.key },
  });
  await ext.update({ config: JSON.stringify(req.body.config || {}) });
  res.json({ ok: true });
});

// GET /api/extensions/:key/config — read config (for admin configure modal)
router.get('/:key/config', async (req, res) => {
  const { Extension } = req.models;
  const ext = await Extension.findOne({ where: { key: req.params.key } });
  if (!ext) return res.json({});
  try { res.json(JSON.parse(ext.config || '{}')); }
  catch { res.json({}); }
});

// POST /api/extensions/sms_receipt/send — send SMS via SMSGenz
router.post('/sms_receipt/send', async (req, res) => {
  const { Extension } = req.models;
  const ext = await Extension.findOne({ where: { key: 'sms_receipt', enabled: true } });
  if (!ext) return res.status(400).json({ error: 'SMS Receipt extension not enabled' });

  let cfg = {};
  try { cfg = JSON.parse(ext.config || '{}'); } catch {}

  const { phone, message } = req.body;
  if (!phone || !message) return res.status(422).json({ error: 'phone and message required' });
  if (!cfg.api_url)  return res.status(400).json({ error: 'SMS gateway API URL not configured' });
  if (!cfg.user_id || !cfg.api_key) return res.status(400).json({ error: 'user_id and api_key not configured' });

  try {
    const url  = new URL(cfg.api_url);
    const lib  = url.protocol === 'https:' ? https : require('http');
    const body = JSON.stringify({
      user_id: cfg.user_id,
      api_key: cfg.api_key,
      sender:  cfg.sender_id || '',
      to:      phone.replace(/\D/g, '').replace(/^0/, '94'),
      message,
    });
    const responseText = await new Promise((resolve, reject) => {
      const req2 = lib.request({
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname + url.search,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, r => {
        let data = '';
        r.on('data', c => data += c);
        r.on('end', () => resolve(data));
      });
      req2.on('error', reject);
      req2.write(body);
      req2.end();
    });
    let parsed;
    try { parsed = JSON.parse(responseText); } catch { parsed = { raw: responseText }; }
    if (parsed.status === 'error' || parsed.error) return res.status(400).json({ error: parsed.message || parsed.error || 'SMSGenz error' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
