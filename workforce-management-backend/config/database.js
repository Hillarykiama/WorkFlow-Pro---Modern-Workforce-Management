// config/database.js
require('dotenv').config();
const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL || 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url.startsWith('file:') && !authToken) {
  console.error('❌ Missing TURSO_AUTH_TOKEN for remote DB');
  process.exit(1);
}

const client = createClient({
  url,
  authToken: url.startsWith('file:') ? undefined : authToken, // no token for local sqlite
});

/**
 * executeQuery(sql, params = [])
 * Runs queries and normalizes results into { rows, lastInsertRowid, rowsAffected }
 */
async function executeQuery(sql, params = []) {
  try {
    const result = await client.execute({ sql, args: params });
    return {
      rows: result.rows || [],
      lastInsertRowid: result.lastInsertRowid || null,
      rowsAffected:
        typeof result.rowsAffected !== 'undefined'
          ? result.rowsAffected
          : result.changes || 0,
    };
  } catch (err) {
    console.error(`❌ DB Error: ${err.message}`);
    throw err;
  }
}

/**
 * initializeDatabase()
 * Simple health check to verify DB connectivity at startup
 */
async function initializeDatabase() {
  try {
    await client.execute('SELECT 1;'); // test query
    console.log('✅ Database connection successful');
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    throw err;
  }
}

module.exports = {
  client,
  executeQuery,
  initializeDatabase, // ✅ exported now
};


