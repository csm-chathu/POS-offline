const { Sequelize } = require('sequelize');
const getModels = require('../models');

// Per-tenant connection cache — one pool per subdomain
const connectionCache = {};

function createConnection(tenant) {
  return new Sequelize(tenant.database, tenant.username, tenant.password, {
    host: tenant.host || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    dialect: 'mysql',
    logging: false,
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
    define: {
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
    },
  });
}

function getTenantDb(tenant, host) {
  if (!connectionCache[host]) {
    connectionCache[host] = {
      sequelize: createConnection(tenant),
    };
    connectionCache[host].models = getModels(connectionCache[host].sequelize);
  }
  return connectionCache[host];
}

function evictTenantDb(host) {
  if (connectionCache[host]) {
    try { connectionCache[host].sequelize.close(); } catch {}
    delete connectionCache[host];
  }
}

module.exports = { getTenantDb, evictTenantDb };
