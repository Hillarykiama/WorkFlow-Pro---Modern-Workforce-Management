require('dotenv').config();
const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL?.trim() || 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (!url.startsWith('file:') && !authToken) {
  console.error('❌ Missing TURSO_AUTH_TOKEN for remote DB');
  process.exit(1);
}

const client = createClient({
  url,
  authToken: url.startsWith('file:') ? undefined : authToken,
});

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

module.exports = { client, executeQuery };

