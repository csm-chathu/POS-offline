const { getTenantDb } = require('../config/db');
const { lookupCache, TTL_MS, bustCache } = require('../config/tenantCache');

async function lookupTenant(hostname) {
  const cached = lookupCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  const { getMasterDb } = require('../config/masterDb');
  const { Tenant } = getMasterDb();
  const row = await Tenant.findOne({ where: { hostname, active: true } });
  if (!row) return null;

  const config = {
    database: row.db_name,
    username: row.db_user,
    password: row.db_password,
    host:     row.db_host,
    port:     row.db_port,
  };
  lookupCache.set(hostname, { config, expiresAt: Date.now() + TTL_MS });
  return config;
}

async function tenantMiddleware(req, res, next) {
  const host = req.hostname;

  try {
    let config = await lookupTenant(host);

    if (!config && process.env.NODE_ENV !== 'production') {
      config = await lookupTenant('localhost');
    }

    if (!config) {
      return res.status(403).json({ error: `Unknown tenant: ${host}` });
    }

    const { models, sequelize } = getTenantDb(config, host);
    req.models = models;
    req.db     = sequelize;
    req.tenant = host;
    next();
  } catch (err) {
    console.error('[tenant]', err.message);
    res.status(503).json({ error: 'Tenant lookup failed — master DB unreachable' });
  }
}

module.exports = tenantMiddleware;
