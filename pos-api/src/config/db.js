const { Sequelize } = require('sequelize');
const path = require('path');
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

function createSqliteConnection() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../../pos.db');
  return new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false,
    define: {
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      underscored: true,
    },
  });
}

function getTenantDb(tenant, host) {
  const key = process.env.DIALECT === 'sqlite' ? '__sqlite__' : host;
  if (!connectionCache[key]) {
    const sequelize = process.env.DIALECT === 'sqlite'
      ? createSqliteConnection()
      : createConnection(tenant);
    connectionCache[key] = { sequelize, models: getModels(sequelize) };
  }
  return connectionCache[key];
}

function evictTenantDb(host) {
  if (connectionCache[host]) {
    try { connectionCache[host].sequelize.close(); } catch {}
    delete connectionCache[host];
  }
}

module.exports = { getTenantDb, evictTenantDb };
