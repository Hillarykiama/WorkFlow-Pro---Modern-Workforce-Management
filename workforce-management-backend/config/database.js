const { createClient } = require('@libsql/client');
const fs = require('fs').promises;
const path = require('path');

let db = null;

// Database configuration
const dbConfig = {
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
};

/**
 * Initialize database connection and run migrations
 */
async function initializeDatabase() {
  try {
    db = createClient(dbConfig);

    console.log('🔌 Connecting to Turso database...');
    console.log(`📍 Database URL: ${dbConfig.url.replace(/\/\/.*@/, '//***@')}`);

    // Test connection
    const result = await db.execute('SELECT 1 as test');
    if (result.rows[0].test === 1) {
      console.log('✅ Database connection successful');
    }

    await runMigrations();
    return db;
  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);

    if (error.message.includes('ENOTFOUND') || error.message.includes('network')) {
      console.error('💡 Check your TURSO_DATABASE_URL and internet connection');
    }
    if (error.message.includes('UNAUTHORIZED') || error.message.includes('token')) {
      console.error('💡 Check your TURSO_AUTH_TOKEN');
    }

    throw error;
  }
}

/**
 * Run database migrations
 */
async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...');

    const migrationTableExists = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='migrations'
    `);

    if (migrationTableExists.rows.length === 0) {
      console.log('📋 Creating migrations table...');
      await db.execute(`
        CREATE TABLE migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT UNIQUE NOT NULL,
          executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    const executedMigrations = await db.execute('SELECT filename FROM migrations');
    const executedFiles = executedMigrations.rows.map(row => row.filename);

    const migrationsDir = path.join(__dirname, '..', 'migrations');
    try {
      await fs.access(migrationsDir);
    } catch {
      await fs.mkdir(migrationsDir, { recursive: true });
      console.log('📁 Created migrations directory');

      await createBasicSchema();
      return;
    }

    const migrationFiles = await fs.readdir(migrationsDir);
    const sqlFiles = migrationFiles.filter(f => f.endsWith('.sql')).sort();

    if (sqlFiles.length === 0) {
      console.log('📋 No migration files found, creating basic schema...');
      await createBasicSchema();
      return;
    }

    for (const filename of sqlFiles) {
      if (!executedFiles.includes(filename)) {
        console.log(`⬆️  Executing migration: ${filename}`);

        try {
          await executeMigrationFile(filename, migrationsDir);
          await db.execute({
            sql: 'INSERT INTO migrations (filename) VALUES (?)',
            args: [filename],
          });
          console.log(`✅ Migration completed: ${filename}`);
        } catch (error) {
          console.error(`❌ Migration failed: ${filename}`);
          throw error;
        }
      }
    }

    console.log('✅ All migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration process failed:', error.message);
    throw error;
  }
}

/**
 * Trigger-aware SQL parser
 */
function parseSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let inTriggerBlock = false;

  for (const line of sql.split('\n')) {
    const trimmed = line.trim();

    if (/^CREATE\s+TRIGGER/i.test(trimmed)) {
      inTriggerBlock = true;
    }

    current += line + '\n';

    for (const char of line) {
      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar) {
        inString = false;
        stringChar = '';
      }
    }

    if (!inString && !inTriggerBlock && trimmed.endsWith(';')) {
      statements.push(current.trim());
      current = '';
    }

    if (inTriggerBlock && /^END;$/i.test(trimmed)) {
      statements.push(current.trim());
      current = '';
      inTriggerBlock = false;
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

/**
 * Execute a single migration file
 */
async function executeMigrationFile(filename, migrationsDir) {
  const filePath = path.join(migrationsDir, filename);
  const sql = await fs.readFile(filePath, 'utf8');

  const cleanSql = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\r\n/g, '\n')
    .trim();

  if (!cleanSql) {
    console.log(`⚠️  Empty migration file: ${filename}`);
    return;
  }

  const statements = parseSqlStatements(cleanSql);
  console.log(`📝 Found ${statements.length} SQL statements in ${filename}`);

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i].replace(/;+$/, '');
    if (statement.trim().length < 5) continue;

    try {
      console.log(`🔄 Executing statement ${i + 1}/${statements.length}`);
      await db.execute(statement);
    } catch (error) {
      console.error(`❌ Error in statement ${i + 1}:`);
      console.error(`   SQL: ${statement}`);
      console.error(`   Error: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Create basic schema if no migrations exist
 */
async function createBasicSchema() {
  console.log('🏗️  Creating basic WorkFlow Pro schema...');

  const basicSchema = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee')),
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'completed')),
      priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
      assigned_to INTEGER,
      created_by INTEGER NOT NULL,
      due_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_to) REFERENCES users (id),
      FOREIGN KEY (created_by) REFERENCES users (id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks (assigned_to);
  `;

  await executeSQLStatements(basicSchema);

  await db.execute({
    sql: 'INSERT INTO migrations (filename) VALUES (?)',
    args: ['000_basic_schema.sql'],
  });

  console.log('✅ Basic schema created successfully');
}

/**
 * Execute multiple SQL statements (also trigger-safe)
 */
async function executeSQLStatements(sql) {
  const cleanSql = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\r\n/g, '\n')
    .trim();

  if (!cleanSql) return;

  const statements = parseSqlStatements(cleanSql);

  for (const statement of statements) {
    if (statement.trim().length > 0) {
      await db.execute(statement);
    }
  }
}

function getDatabase() {
  if (!db) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return db;
}

async function executeQuery(sql, params = []) {
  try {
    const result = await db.execute({ sql, args: params });
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

async function closeDatabase() {
  if (db) {
    await db.close();
    console.log('📪 Database connection closed');
  }
}

module.exports = {
  initializeDatabase,
  getDatabase,
  executeQuery,
  closeDatabase,
};

