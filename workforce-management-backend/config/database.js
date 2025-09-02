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
    // Create database client
    db = createClient(dbConfig);
    
    console.log('🔌 Connecting to Turso database...');
    
    // Test connection
    const result = await db.execute('SELECT 1 as test');
    if (result.rows[0].test === 1) {
      console.log('✅ Database connection successful');
    }
    
    // Run migrations
    await runMigrations();
    
    return db;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

/**
 * Run database migrations
 */
async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...');
    
    // Check if migrations table exists
    const migrationTableExists = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='migrations'
    `);
    
    // Create migrations table if it doesn't exist
    if (migrationTableExists.rows.length === 0) {
      await db.execute(`
        CREATE TABLE migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT UNIQUE NOT NULL,
          executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    
    // Get list of executed migrations
    const executedMigrations = await db.execute('SELECT filename FROM migrations');
    const executedFiles = executedMigrations.rows.map(row => row.filename);
    
    // Read migration files
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    try {
      await fs.access(migrationsDir);
    } catch {
      // Create migrations directory if it doesn't exist
      await fs.mkdir(migrationsDir, { recursive: true });
      console.log('📁 Created migrations directory');
    }
    
    const migrationFiles = await fs.readdir(migrationsDir);
    const sqlFiles = migrationFiles
      .filter(file => file.endsWith('.sql'))
      .sort(); // Execute in alphabetical order
    
    // Execute pending migrations
    for (const filename of sqlFiles) {
      if (!executedFiles.includes(filename)) {
        console.log(`⬆️  Executing migration: ${filename}`);
        
        const filePath = path.join(migrationsDir, filename);
        const sql = await fs.readFile(filePath, 'utf8');
        
        // Split SQL into individual statements
        const statements = sql
          .split(';')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0);
        
        // Execute each statement
        for (const statement of statements) {
          if (statement.toLowerCase().includes('create') || 
              statement.toLowerCase().includes('insert') ||
              statement.toLowerCase().includes('alter') ||
              statement.toLowerCase().includes('drop')) {
            await db.execute(statement);
          }
        }
        
        // Record migration as executed
        await db.execute({
          sql: 'INSERT INTO migrations (filename) VALUES (?)',
          args: [filename]
        });
        
        console.log(`✅ Migration completed: ${filename}`);
      }
    }
    
    // If no migration files exist, create the initial schema
    if (sqlFiles.length === 0) {
      console.log('📋 No migration files found, creating initial schema...');
      await createInitialSchema();
    }
    
    console.log('✅ All migrations completed successfully');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Create initial database schema
 */
async function createInitialSchema() {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  
  try {
    const schema = await fs.readFile(schemaPath, 'utf8');
    const statements = schema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    for (const statement of statements) {
      if (statement.toLowerCase().includes('create') || 
          statement.toLowerCase().includes('insert')) {
        await db.execute(statement);
      }
    }
    
    console.log('✅ Initial schema created successfully');
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('⚠️  No schema.sql file found, skipping initial schema creation');
    } else {
      throw error;
    }
  }
}

/**
 * Get database connection
 */
function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Execute a prepared statement with parameters
 */
async function executeQuery(sql, params = []) {
  try {
    const result = await db.execute({
      sql: sql,
      args: params
    });
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Execute multiple queries in a transaction
 */
async function executeTransaction(queries) {
  try {
    await db.execute('BEGIN TRANSACTION');
    
    for (const query of queries) {
      if (typeof query === 'string') {
        await db.execute(query);
      } else {
        await db.execute({
          sql: query.sql,
          args: query.args || []
        });
      }
    }
    
    await db.execute('COMMIT');
    console.log('✅ Transaction completed successfully');
    
  } catch (error) {
    await db.execute('ROLLBACK');
    console.error('❌ Transaction failed, rolled back:', error);
    throw error;
  }
}

/**
 * Get user by ID with team information
 */
async function getUserWithTeams(userId) {
  const query = `
    SELECT 
      u.*,
      GROUP_CONCAT(t.name) as team_names,
      GROUP_CONCAT(t.id) as team_ids
    FROM users u
    LEFT JOIN team_members tm ON u.id = tm.user_id
    LEFT JOIN teams t ON tm.team_id = t.id
    WHERE u.id = ?
    GROUP BY u.id
  `;
  
  const result = await executeQuery(query, [userId]);
  return result.rows[0] || null;
}

/**
 * Get paginated results with counting
 */
async function getPaginatedResults(baseQuery, countQuery, params = [], page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  
  // Get total count
  const countResult = await executeQuery(countQuery, params);
  const total = countResult.rows[0].count;
  
  // Get paginated data
  const dataQuery = `${baseQuery} LIMIT ${limit} OFFSET ${offset}`;
  const dataResult = await executeQuery(dataQuery, params);
  
  return {
    data: dataResult.rows,
    pagination: {
      page: page,
      limit: limit,
      total: total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    }
  };
}

/**
 * Search users with filters
 */
async function searchUsers(filters = {}) {
  let whereClause = '1=1';
  const params = [];
  
  if (filters.search) {
    whereClause += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)';
    const searchTerm = `%${filters.search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  
  if (filters.role) {
    whereClause += ' AND role = ?';
    params.push(filters.role);
  }
  
  if (filters.status) {
    whereClause += ' AND status = ?';
    params.push(filters.status);
  }
  
  if (filters.teamId) {
    whereClause += ' AND id IN (SELECT user_id FROM team_members WHERE team_id = ?)';
    params.push(filters.teamId);
  }
  
  const baseQuery = `
    SELECT u.*, GROUP_CONCAT(t.name) as team_names
    FROM users u
    LEFT JOIN team_members tm ON u.id = tm.user_id
    LEFT JOIN teams t ON tm.team_id = t.id
    WHERE ${whereClause}
    GROUP BY u.id
    ORDER BY u.first_name, u.last_name
  `;
  
  const countQuery = `
    SELECT COUNT(DISTINCT u.id) as count
    FROM users u
    LEFT JOIN team_members tm ON u.id = tm.user_id
    WHERE ${whereClause}
  `;
  
  return getPaginatedResults(
    baseQuery, 
    countQuery, 
    params, 
    filters.page || 1, 
    filters.limit || 20
  );
}

/**
 * Get dashboard stats
 */
async function getDashboardStats(userId, userRole) {
  const stats = {};
  
  try {
    // Get team IDs for the user (if not admin)
    let teamFilter = '';
    let teamParams = [];
    
    if (userRole !== 'admin') {
      const userTeams = await executeQuery(`
        SELECT team_id FROM team_members WHERE user_id = ?
      `, [userId]);
      
      const teamIds = userTeams.rows.map(row => row.team_id);
      if (teamIds.length > 0) {
        teamFilter = `WHERE team_id IN (${teamIds.map(() => '?').join(',')})`;
        teamParams = teamIds;
      }
    }
    
    // Total active users
    const usersResult = await executeQuery(`
      SELECT COUNT(*) as count FROM users WHERE status = 'active'
    `);
    stats.activeUsers = usersResult.rows[0].count;
    
    // Total tasks by status
    const tasksResult = await executeQuery(`
      SELECT status, COUNT(*) as count 
      FROM tasks 
      ${teamFilter ? `WHERE board_id IN (SELECT id FROM boards ${teamFilter})` : ''}
      GROUP BY status
    `, teamParams);
    
    stats.tasks = {
      todo: 0,
      in_progress: 0,
      completed: 0,
      total: 0
    };
    
    tasksResult.rows.forEach(row => {
      stats.tasks[row.status] = row.count;
      stats.tasks.total += row.count;
    });
    
    // Upcoming shifts (next 7 days)
    const shiftsResult = await executeQuery(`
      SELECT COUNT(*) as count 
      FROM shifts 
      WHERE shift_date BETWEEN date('now') AND date('now', '+7 days')
      AND status = 'scheduled'
      ${userRole !== 'admin' ? 'AND user_id = ?' : ''}
    `, userRole !== 'admin' ? [userId] : []);
    
    stats.upcomingShifts = shiftsResult.rows[0].count;
    
    // Unread notifications
    const notificationsResult = await executeQuery(`
      SELECT COUNT(*) as count 
      FROM notifications 
      WHERE user_id = ? AND is_read = FALSE
    `, [userId]);
    
    stats.unreadNotifications = notificationsResult.rows[0].count;
    
    return stats;
    
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    throw error;
  }
}

/**
 * Close database connection
 */
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
  executeTransaction,
  getUserWithTeams,
  getPaginatedResults,
  searchUsers,
  getDashboardStats,
  closeDatabase,
  db: () => db // Getter function for db
};