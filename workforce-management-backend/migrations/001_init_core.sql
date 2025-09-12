-- 001_init_core.sql
PRAGMA foreign_keys = ON;

-- USERS
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'manager', 'employee')) NOT NULL DEFAULT 'employee',
    avatar_url TEXT,
    phone TEXT,
    timezone TEXT DEFAULT 'UTC',
    status TEXT CHECK(status IN ('active', 'inactive', 'suspended')) DEFAULT 'active',
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TEAMS
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    manager_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TEAM MEMBERS
CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(team_id, user_id)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- TRIGGERS (update updated_at on update, but only if updated_at wasn't explicitly changed)
DROP TRIGGER IF EXISTS update_users_timestamp;
CREATE TRIGGER update_users_timestamp
AFTER UPDATE ON users
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS update_teams_timestamp;
CREATE TRIGGER update_teams_timestamp
AFTER UPDATE ON teams
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE teams SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;


