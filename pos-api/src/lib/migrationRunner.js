const fs   = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '../../_pos_migrations');

async function runMigrations(sequelize) {
  // Ensure tracking table exists
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS _pos_migrations (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get already-applied _pos_migrations
  const [applied] = await sequelize.query('SELECT name FROM _pos_migrations');
  const appliedSet = new Set(applied.map(r => r.name));

  // Read migration files sorted
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const results = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      results.push({ file, status: 'skipped' });
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    // Split on semicolons, run each non-empty statement
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      try {
        await sequelize.query(stmt);
      } catch (err) {
        // 1060 = duplicate column — column already exists, safe to skip
        if (err.original?.errno === 1060 || err.parent?.errno === 1060) continue;
        throw err;
      }
    }

    await sequelize.query('INSERT INTO _pos_migrations (name) VALUES (?)', {
      replacements: [file],
    });

    results.push({ file, status: 'applied' });
  }

  return results;
}

module.exports = { runMigrations };
