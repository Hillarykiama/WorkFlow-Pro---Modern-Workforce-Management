// scripts/run-migrations.js
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { executeQuery } = require('../config/database');

async function runMigrations() {
  console.log('🚀 Running migrations...');

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

  // Sort to run in order (001_init.sql, 002_add_users.sql, etc.)
  files.sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    try {
      await executeQuery(sql);
      console.log(`✅ Migration applied: ${file}`);
    } catch (err) {
      console.error(`❌ Failed to apply migration: ${file}`);
      console.error(err.message);
      process.exit(1); // stop so you can fix the error
    }
  }

  console.log('🎉 All migrations applied successfully!');
  process.exit(0);
}

runMigrations();

