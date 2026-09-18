const { Sequelize, DataTypes } = require('sequelize');

let _master   = null;
let _Tenant   = null;
let _Feature  = null;
let _Category = null;
let _Product  = null;

function getMasterDb() {
  if (!_master) {
    _master = new Sequelize(
      process.env.MASTER_DB_NAME || 'pos_master',
      process.env.MASTER_DB_USER || 'root',
      process.env.MASTER_DB_PASS || 'root',
      {
        host:    process.env.MASTER_DB_HOST || '127.0.0.1',
        port:    parseInt(process.env.MASTER_DB_PORT || '3306'),
        dialect: 'mysql',
        logging: false,
        pool: { max: 3, min: 0, acquire: 10000, idle: 5000 },
      }
    );

    _Tenant = _master.define('Tenant', {
      id:          { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      hostname:    { type: DataTypes.STRING(255), allowNull: false, unique: true },
      db_name:     { type: DataTypes.STRING(64),  allowNull: false },
      db_user:     { type: DataTypes.STRING(64),  allowNull: false, defaultValue: 'pos_user' },
      db_password: { type: DataTypes.STRING(255), allowNull: false },
      db_host:     { type: DataTypes.STRING(255), allowNull: false, defaultValue: '127.0.0.1' },
      db_port:     { type: DataTypes.INTEGER,     allowNull: false, defaultValue: 3306 },
      active:      { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: true },
    }, { tableName: 'tenants', timestamps: false });

    _Category = _master.define('Category', {
      id:   { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(191), allowNull: false },
    }, { tableName: 'categories' });

    _Product = _master.define('Product', {
      id:               { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      category_id:      { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      name:             { type: DataTypes.STRING(191), allowNull: false },
      name_si:          { type: DataTypes.STRING(191), allowNull: true },
      barcode:          { type: DataTypes.STRING(191), allowNull: true },
      sku:              { type: DataTypes.STRING(191), allowNull: true },
      description:      { type: DataTypes.TEXT, allowNull: true },
      image:            { type: DataTypes.STRING(512), allowNull: true },
      cost_price:       { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
      selling_price:    { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
      wholesale_price:  { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
      promo_price:      { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      promo_start_date: { type: DataTypes.DATEONLY, allowNull: true },
      promo_end_date:   { type: DataTypes.DATEONLY, allowNull: true },
      our_price:        { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      expiry_date:      { type: DataTypes.DATEONLY, allowNull: true },
      stock_qty:        { type: DataTypes.DECIMAL(10, 3), defaultValue: 0 },
      alert_qty:        { type: DataTypes.DECIMAL(10, 3), defaultValue: 5 },
      unit:             { type: DataTypes.STRING(191), defaultValue: 'pcs' },
      active:           { type: DataTypes.BOOLEAN, defaultValue: true },
      is_fast_moving:   { type: DataTypes.BOOLEAN, defaultValue: false },
    }, { tableName: 'products' });

    _Feature = _master.define('Feature', {
      id:         { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      key:        { type: DataTypes.STRING(64),  allowNull: false, unique: true },
      label:      { type: DataTypes.STRING(191), allowNull: false },
      path:       { type: DataTypes.STRING(191), allowNull: true },
      group:      { type: DataTypes.STRING(50),  allowNull: true },
      sort_order: { type: DataTypes.INTEGER,     defaultValue: 0 },
      icon:       { type: DataTypes.STRING(32),  allowNull: true },
      offline_ok: { type: DataTypes.BOOLEAN,     defaultValue: false },
    }, { tableName: 'features', timestamps: false });
  }

  return { master: _master, Tenant: _Tenant, Feature: _Feature, Category: _Category, Product: _Product };
}

module.exports = { getMasterDb };
