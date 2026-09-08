/**
 * Seed sample data for Lover Fashion Shop
 * Usage:
 *   node scripts/seed-lover.js <host>
 *   node scripts/seed-lover.js <host> --clear    (clear products/categories first)
 */
require('dotenv').config();
const { Sequelize } = require('sequelize');
const getModels     = require('../src/models');
const tenants       = require('../src/config/tenants');

const host  = process.argv[2];
const clear = process.argv.includes('--clear');

if (!host) {
  console.log('Usage: node scripts/seed-lover.js <host> [--clear]');
  process.exit(1);
}
const tenant = tenants[host];
if (!tenant) { console.error(`Host "${host}" not in tenants.js`); process.exit(1); }

const log  = m => console.log(`\x1b[32m✔\x1b[0m  ${m}`);
const warn = m => console.log(`\x1b[33m⚠\x1b[0m  ${m}`);

const CATEGORIES = [
  { name: 'Women\'s Wear',   name_si: 'කාන්තා ඇඳුම්' },
  { name: 'Men\'s Wear',     name_si: 'පිරිමි ඇඳුම්' },
  { name: 'Lingerie',        name_si: 'ඇඳුම් යට' },
  { name: 'Kids Wear',       name_si: 'ළමා ඇඳුම්' },
  { name: 'Accessories',     name_si: 'ආයිත්තම්' },
  { name: 'Perfumes',        name_si: 'සුවඳ' },
  { name: 'Cosmetics',       name_si: 'රූපලාවන්' },
  { name: 'Gifts & Toys',    name_si: 'තෑගි' },
];

const PRODUCTS = [
  // Women's Wear
  { category: 'Women\'s Wear', name: 'Frock - Blue Floral',    name_si: 'නිල් මල් ෆ්‍රොක්',       price: 2800, cost: 1600, stock: 20, unit: 'pcs' },
  { category: 'Women\'s Wear', name: 'Frock - Pink Solid',     name_si: 'රෝස ෆ්‍රොක්',             price: 2500, cost: 1400, stock: 15, unit: 'pcs' },
  { category: 'Women\'s Wear', name: 'Kurti - Cotton Print',   name_si: 'කොටන් කුර්ති',            price: 1800, cost: 900,  stock: 25, unit: 'pcs' },
  { category: 'Women\'s Wear', name: 'Blouse - Silk',          name_si: 'සිල්ක් බ්ලවුස්',          price: 1500, cost: 750,  stock: 30, unit: 'pcs' },
  { category: 'Women\'s Wear', name: 'Leggings - Black',       name_si: 'කළු ලෙගිංස්',             price: 900,  cost: 400,  stock: 50, unit: 'pcs' },
  { category: 'Women\'s Wear', name: 'Saree - Batik',          name_si: 'බටික් සාරිය',              price: 4500, cost: 2500, stock: 10, unit: 'pcs' },
  { category: 'Women\'s Wear', name: 'Saree - Georgette',      name_si: 'ජෝජෙට් සාරිය',            price: 5500, cost: 3000, stock: 8,  unit: 'pcs' },
  { category: 'Women\'s Wear', name: 'T-Shirt - Ladies',       name_si: 'කාන්තා ටී-ෂර්ට්',         price: 1200, cost: 600,  stock: 40, unit: 'pcs' },

  // Men's Wear
  { category: 'Men\'s Wear',   name: 'T-Shirt - Round Neck',   name_si: 'රවුම් ගෙල ටී-ෂර්ට්',      price: 1400, cost: 650,  stock: 35, unit: 'pcs' },
  { category: 'Men\'s Wear',   name: 'Shirt - Formal',         name_si: 'ෆෝමල් ෂර්ට්',             price: 2200, cost: 1100, stock: 20, unit: 'pcs' },
  { category: 'Men\'s Wear',   name: 'Shirt - Casual Cotton',  name_si: 'කොටන් කැෂුවල් ෂර්ට්',     price: 1800, cost: 850,  stock: 25, unit: 'pcs' },
  { category: 'Men\'s Wear',   name: 'Trouser - Slim Fit',     name_si: 'ස්ලිම් ෆිට් ට්‍රවුසර්',   price: 2800, cost: 1400, stock: 18, unit: 'pcs' },
  { category: 'Men\'s Wear',   name: 'Shorts - Beach',         name_si: 'බීච් ෂෝට්ස්',             price: 1200, cost: 550,  stock: 30, unit: 'pcs' },
  { category: 'Men\'s Wear',   name: 'Sarong - Batik',         name_si: 'බටික් සාරොං',              price: 1600, cost: 800,  stock: 40, unit: 'pcs' },

  // Lingerie
  { category: 'Lingerie',      name: 'Bra - Cotton (M)',       name_si: 'කොටන් බ්‍රා (M)',          price: 950,  cost: 420,  stock: 50, unit: 'pcs' },
  { category: 'Lingerie',      name: 'Bra - Cotton (L)',       name_si: 'කොටන් බ්‍රා (L)',          price: 950,  cost: 420,  stock: 50, unit: 'pcs' },
  { category: 'Lingerie',      name: 'Bra - Lace (M)',         name_si: 'ලේස් බ්‍රා (M)',           price: 1400, cost: 650,  stock: 30, unit: 'pcs' },
  { category: 'Lingerie',      name: 'Panty - Cotton Pack 3',  name_si: 'කොටන් පෑන්ටි (3)',         price: 750,  cost: 320,  stock: 60, unit: 'pcs' },
  { category: 'Lingerie',      name: 'Nightie - Satin',        name_si: 'සාටන් නයිටි',             price: 2200, cost: 1100, stock: 20, unit: 'pcs' },
  { category: 'Lingerie',      name: 'Men Underwear Pack 3',   name_si: 'පිරිමි යට ඇඳුම් (3)',      price: 900,  cost: 400,  stock: 45, unit: 'pcs' },

  // Kids Wear
  { category: 'Kids Wear',     name: 'Baby Frock (0-6m)',      name_si: 'ළදරු ෆ්‍රොක් (0-6m)',      price: 850,  cost: 380,  stock: 25, unit: 'pcs' },
  { category: 'Kids Wear',     name: 'Kids T-Shirt (2-4yr)',   name_si: 'ළමා ටී-ෂර්ට් (2-4)',       price: 750,  cost: 320,  stock: 30, unit: 'pcs' },
  { category: 'Kids Wear',     name: 'Kids Dress (4-6yr)',     name_si: 'ළමා ඇඳුම (4-6)',           price: 1200, cost: 550,  stock: 20, unit: 'pcs' },
  { category: 'Kids Wear',     name: 'Baby Set (Top+Bottom)',  name_si: 'ළදරු සෙට් (Top+Bottom)',   price: 1100, cost: 500,  stock: 15, unit: 'pcs' },
  { category: 'Kids Wear',     name: 'School Socks (3 pair)',  name_si: 'පාසල් කොලු (3)',           price: 450,  cost: 180,  stock: 60, unit: 'pcs' },

  // Accessories
  { category: 'Accessories',   name: 'Hair Band Set',          name_si: 'හෙයාර් බෑන්ඩ් සෙට්',      price: 350,  cost: 120,  stock: 80, unit: 'pcs' },
  { category: 'Accessories',   name: 'Necklace - Fashion',     name_si: 'ෆැෂන් හාරය',              price: 650,  cost: 250,  stock: 40, unit: 'pcs' },
  { category: 'Accessories',   name: 'Earrings - Gold Plated', name_si: 'රන් ආලේපිත කරාබු',        price: 550,  cost: 200,  stock: 50, unit: 'pcs' },
  { category: 'Accessories',   name: 'Bracelet - Beaded',      name_si: 'මිදි රෝකමල',              price: 480,  cost: 180,  stock: 45, unit: 'pcs' },
  { category: 'Accessories',   name: 'Handbag - Ladies Small', name_si: 'කුඩා කාන්තා බෑගය',        price: 2200, cost: 1000, stock: 15, unit: 'pcs' },
  { category: 'Accessories',   name: 'Wallet - Ladies',        name_si: 'කාන්තා පසුම්බිය',          price: 1400, cost: 600,  stock: 20, unit: 'pcs' },
  { category: 'Accessories',   name: 'Belt - Men Leather',     name_si: 'පිරිමි සම් බෙල්ට්',       price: 1200, cost: 550,  stock: 25, unit: 'pcs' },
  { category: 'Accessories',   name: 'Sunglasses - Unisex',    name_si: 'හිරු කණ්ණාඩි',            price: 1800, cost: 750,  stock: 20, unit: 'pcs' },

  // Perfumes
  { category: 'Perfumes',      name: 'Rose Fantasy 50ml',      name_si: 'රෝස ෆැන්ටසි 50ml',        price: 1800, cost: 900,  stock: 25, unit: 'pcs' },
  { category: 'Perfumes',      name: 'Midnight Oud 100ml',     name_si: 'මිඩ්නයිට් ඔද් 100ml',     price: 3500, cost: 1800, stock: 15, unit: 'pcs' },
  { category: 'Perfumes',      name: 'Sweet Love 50ml',        name_si: 'ස්වීට් ලව් 50ml',         price: 1600, cost: 800,  stock: 20, unit: 'pcs' },
  { category: 'Perfumes',      name: 'Blue Ocean Men 100ml',   name_si: 'බ්ලූ ඕෂන් (පිරිමි) 100ml',price: 2800, cost: 1400, stock: 12, unit: 'pcs' },
  { category: 'Perfumes',      name: 'Body Mist - Vanilla',    name_si: 'වැනිලා බොඩි මිස්ට්',       price: 950,  cost: 400,  stock: 30, unit: 'pcs' },

  // Cosmetics
  { category: 'Cosmetics',     name: 'Lipstick - Red',         name_si: 'රතු ලිප්ස්ටික්',          price: 650,  cost: 250,  stock: 60, unit: 'pcs' },
  { category: 'Cosmetics',     name: 'Lipstick - Pink',        name_si: 'රෝස ලිප්ස්ටික්',          price: 650,  cost: 250,  stock: 55, unit: 'pcs' },
  { category: 'Cosmetics',     name: 'Foundation - Medium',    name_si: 'ෆවුන්ඩේෂන් (Medium)',      price: 1200, cost: 550,  stock: 30, unit: 'pcs' },
  { category: 'Cosmetics',     name: 'Mascara - Black',        name_si: 'කළු මස්කාරා',             price: 950,  cost: 400,  stock: 35, unit: 'pcs' },
  { category: 'Cosmetics',     name: 'Nail Polish Set 12pc',   name_si: 'නේල් පොලිෂ් (12)',         price: 850,  cost: 350,  stock: 25, unit: 'pcs' },
  { category: 'Cosmetics',     name: 'Face Powder - Ivory',    name_si: 'ෆේස් පවුඩර් (Ivory)',      price: 780,  cost: 320,  stock: 40, unit: 'pcs' },
  { category: 'Cosmetics',     name: 'BB Cream SPF30',         name_si: 'BB ක්‍රීම් SPF30',         price: 1400, cost: 650,  stock: 25, unit: 'pcs' },
  { category: 'Cosmetics',     name: 'Eyeliner - Kajal',       name_si: 'කාජල් ඇයිලයිනර්',         price: 480,  cost: 180,  stock: 50, unit: 'pcs' },

  // Gifts & Toys
  { category: 'Gifts & Toys',  name: 'Teddy Bear - 30cm',      name_si: 'ටෙඩි බෙයාර් 30cm',        price: 1800, cost: 800,  stock: 20, unit: 'pcs' },
  { category: 'Gifts & Toys',  name: 'Teddy Bear - 50cm',      name_si: 'ටෙඩි බෙයාර් 50cm',        price: 3200, cost: 1500, stock: 12, unit: 'pcs' },
  { category: 'Gifts & Toys',  name: 'Gift Box - Valentine',   name_si: 'වැලන්ටයින් ගිෆ්ට් බොක්ස්',price: 2500, cost: 1100, stock: 15, unit: 'pcs' },
  { category: 'Gifts & Toys',  name: 'Chocolate Box 200g',     name_si: 'චොකලට් පෙට්ටිය 200g',     price: 1200, cost: 600,  stock: 25, unit: 'pcs' },
  { category: 'Gifts & Toys',  name: 'Scented Candle Set',     name_si: 'සුවඳ ඉටිපන්දම් සෙට්',     price: 950,  cost: 400,  stock: 20, unit: 'pcs' },
  { category: 'Gifts & Toys',  name: 'Doll - Fashion (30cm)',  name_si: 'ෆැෂන් බෝනික්කා 30cm',     price: 1400, cost: 600,  stock: 18, unit: 'pcs' },
];

async function main() {
  console.log(`\n\x1b[1m── Lover Fashion Shop Seed: ${host} → ${tenant.database} ──\x1b[0m\n`);

  const seq = new Sequelize(tenant.database, tenant.username, tenant.password, {
    host: tenant.host || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    dialect: 'mysql',
    logging: false,
    define: { timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at', underscored: true },
  });

  await seq.authenticate();
  const { Category, Product } = getModels(seq);

  if (clear) {
    console.log('\x1b[33m⚠\x1b[0m  Clearing existing products and categories…');
    await Product.destroy({ where: {} });
    await Category.destroy({ where: {} });
    log('Cleared.');
  }

  // Seed categories
  console.log('\n\x1b[1mCategories\x1b[0m');
  const catMap = {};
  for (const cat of CATEGORIES) {
    const [row, created] = await Category.findOrCreate({ where: { name: cat.name }, defaults: { name: cat.name } });
    catMap[cat.name] = row;
    created ? log(`Created: ${cat.name}`) : warn(`Exists:  ${cat.name}`);
  }

  // Seed products
  console.log('\n\x1b[1mProducts\x1b[0m');
  let created = 0, skipped = 0;
  for (const p of PRODUCTS) {
    const cat = catMap[p.category];
    if (!cat) { warn(`Category not found: ${p.category}`); continue; }
    const existing = await Product.findOne({ where: { name: p.name } });
    if (existing) { skipped++; continue; }
    await Product.create({
      name:          p.name,
      selling_price: p.price,
      cost_price:    p.cost,
      stock_qty:     p.stock,
      unit:          p.unit || 'pcs',
      category_id:   cat.id,
      barcode:       null,
      image_url:     null,
    });
    created++;
  }
  log(`Created ${created} products, skipped ${skipped} existing.`);

  // Update shop settings
  console.log('\n\x1b[1mShop Settings\x1b[0m');
  const { Setting } = getModels(seq);
  const updates = {
    shop_name: 'Lover Fashion',
    currency: 'Rs.',
    receipt_language: 'en',
  };
  for (const [key, value] of Object.entries(updates)) {
    await Setting.upsert({ key, value });
    log(`Set: ${key} = ${value}`);
  }

  await seq.close();
  console.log(`\n\x1b[1mDone.\x1b[0m\n`);
}

main().catch(e => { console.error(`\x1b[31m✖\x1b[0m  ${e.message}`); process.exit(1); });
