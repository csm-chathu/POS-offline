// Shared cache store — imported by both tenant middleware and routes
// so they are guaranteed to operate on the same Map/object instances.
const { evictTenantDb } = require('./db');

const lookupCache = new Map(); // hostname → { config, expiresAt }
const TTL_MS = 5 * 60 * 1000;

function getCache() { return lookupCache; }

function bustCache(hostname) {
  console.log(`[cache] busting: ${hostname}`);
  lookupCache.delete(hostname);
  evictTenantDb(hostname);
}

module.exports = { lookupCache, TTL_MS, getCache, bustCache };
