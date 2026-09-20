/**
 * export-seed.js
 * Exports categories and products from anura_v2 MySQL → pos-api/seeds/data.json
 * Run once: node scripts/export-seed.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

const DB = {
  host:     '127.0.0.1',
  port:     3306,
  user:     'root',
  password: 'root',
  database: 'anura_v2',
};

async function run() {
  console.log('Connecting to', DB.database, '...');
  const conn = await mysql.createConnection(DB);

  console.log('Exporting categories...');
  const [categories] = await conn.execute(
    `SELECT id, name FROM categories ORDER BY id`
  );

  console.log(`Exporting products (this may take a moment)...`);
  const [products] = await conn.execute(
    `SELECT id, category_id, name, name_si, barcode, sku, description,
            cost_price, selling_price, wholesale_price, promo_price,
            promo_start_date, promo_end_date, our_price, expiry_date,
            stock_qty, alert_qty, unit, active, is_fast_moving
     FROM products
     ORDER BY id`
  );

  await conn.end();

  const out = { categories, products };
  const outPath = path.join(__dirname, '../seeds/data.json');
  fs.writeFileSync(outPath, JSON.stringify(out));

  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`Done! Exported ${categories.length} categories, ${products.length} products → seeds/data.json (${sizeMB} MB)`);
}

run().catch(e => { console.error(e.message); process.exit(1); });
