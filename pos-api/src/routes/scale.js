const net    = require('net');
const os     = require('os');
const router = require('express').Router();
const auth   = require('../middleware/auth');

// GET /api/scale/interfaces
// Returns all local IPv4 network interfaces with their /24 subnets.
router.get('/interfaces', auth, (req, res) => {
  const ifaces = os.networkInterfaces();
  const result = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      const parts  = addr.address.split('.');
      const subnet = parts.slice(0, 3).join('.');
      result.push({ name, address: addr.address, subnet, netmask: addr.netmask });
    }
  }
  res.json({ interfaces: result });
});

// GET /api/scale/status
// Connects to the scale and waits up to 1.5 s for actual data.
// connected=true only when the scale responds with bytes — prevents false positives
// when the device is off but the network port is still reachable.
router.get('/status', auth, async (req, res) => {
  const { Setting } = req.models;
  const rows = await Setting.findAll();
  const cfg  = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const host = cfg.scale_host || '';
  const port = parseInt(cfg.scale_port, 10) || 0;

  if (!host || !port) {
    return res.json({ connected: false, error: 'Scale host or port not configured' });
  }

  const result = await checkScaleActive(host, port);
  res.json(result);
});

// Checks whether the scale is truly active by waiting for it to send at least one byte.
function checkScaleActive(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let   gotData = false;

    const connectTimer = setTimeout(() => {
      socket.destroy();
      resolve({ connected: false, error: 'Connection timed out' });
    }, 3000);

    socket.connect(port, host, () => {
      clearTimeout(connectTimer);
      // Wait up to 1.5 s for the scale to send anything
      const dataTimer = setTimeout(() => {
        socket.destroy();
        resolve({
          connected: false,
          error: 'Scale not responding (TCP open but no data received)',
        });
      }, 1500);

      socket.on('data', () => {
        if (gotData) return;
        gotData = true;
        clearTimeout(dataTimer);
        socket.destroy();
        resolve({ connected: true });
      });
    });

    socket.on('error', (err) => {
      clearTimeout(connectTimer);
      resolve({ connected: false, error: err.message });
    });
  });
}

function checkTcp(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer  = setTimeout(() => {
      socket.destroy();
      resolve({ connected: false, error: 'Connection timed out' });
    }, timeoutMs);

    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ connected: true });
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      resolve({ connected: false, error: err.message });
    });
  });
}

// GET /api/scale/read?host=&port=&duration=2000
// Connects to the scale, collects raw data for `duration` ms, returns it as ASCII + hex dump.
router.get('/read', auth, async (req, res) => {
  const host     = req.query.host || '';
  const port     = parseInt(req.query.port, 10) || 0;
  const duration = Math.min(parseInt(req.query.duration, 10) || 2000, 8000);

  if (!host || !port) {
    return res.status(400).json({ error: 'host and port are required' });
  }

  const result = await readRaw(host, port, duration);
  res.json(result);
});

function readRaw(host, port, durationMs) {
  return new Promise((resolve) => {
    const socket  = new net.Socket();
    const chunks  = [];
    let connected = false;

    const finish = () => {
      socket.destroy();
      const raw = Buffer.concat(chunks);
      resolve({
        connected,
        bytes:   raw.length,
        ascii:   raw.toString('ascii').replace(/[\x00-\x08\x0e-\x1f\x7f]/g, '.'),
        hex:     raw.toString('hex').match(/.{1,2}/g)?.join(' ') || '',
        lines:   raw.toString('ascii').split(/\r?\n/).filter(l => l.trim()),
      });
    };

    const connectTimer = setTimeout(() => {
      if (!connected) resolve({ connected: false, error: 'Connection timed out', bytes: 0 });
      socket.destroy();
    }, 3000);

    socket.connect(port, host, () => {
      connected = true;
      clearTimeout(connectTimer);
      setTimeout(finish, durationMs);
    });

    socket.on('data', (d) => chunks.push(d));
    socket.on('error', (err) => {
      clearTimeout(connectTimer);
      resolve({ connected: false, error: err.message, bytes: 0 });
    });
  });
}

// POST /api/scale/scan
// Body: { subnet: "192.168.1", port: 8000 }
// Scans all 254 hosts in the subnet and returns those that accept a TCP connection.
router.post('/scan', auth, async (req, res) => {
  const { subnet, port = 8000 } = req.body;
  if (!subnet || !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(subnet)) {
    return res.status(400).json({ error: 'Invalid subnet — expected format: "192.168.1"' });
  }
  const targets = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
  const found   = await scanSubnet(targets, parseInt(port, 10));
  res.json({ found });
});

async function scanSubnet(hosts, port, timeoutMs = 600, concurrency = 40) {
  const found = [];
  for (let i = 0; i < hosts.length; i += concurrency) {
    const chunk   = hosts.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(host => checkTcp(host, port, timeoutMs).then(r => ({ host, ...r })))
    );
    results.filter(r => r.connected).forEach(r => found.push(r.host));
  }
  return found;
}

module.exports = router;
