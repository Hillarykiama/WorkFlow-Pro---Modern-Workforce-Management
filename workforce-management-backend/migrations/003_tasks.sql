-- 003_tasks.sql
PRAGMA foreign_keys = ON;

-- BOARDS
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER REFERENCES teams(id),
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#6366f1',
    is_active BOOLEAN DEFAULT 1,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TASK COLUMNS
CREATE TABLE IF NOT EXISTS task_columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    color TEXT DEFAULT '#f1f5f9',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TASKS
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER REFERENCES boards(id),
    column_id INTEGER REFERENCES task_columns(id),
    title TEXT NOT NULL,
    description TEXT,
    assigned_to INTEGER REFERENCES users(id),
    created_by INTEGER REFERENCES users(id),
    priority TEXT CHECK(priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
    due_date DATETIME,
    estimated_hours REAL,
    actual_hours REAL DEFAULT 0,
    status TEXT CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending',
    position INTEGER,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
);

-- TASK COMMENTS
CREATE TABLE IF NOT EXISTS task_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TASK ATTACHMENTS
CREATE TABLE IF NOT EXISTS task_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    uploaded_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_board ON tasks(board_id);

-- TRIGGERS: update timestamps for boards & tasks
DROP TRIGGER IF EXISTS update_boards_timestamp;
CREATE TRIGGER update_boards_timestamp
AFTER UPDATE ON boards
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS update_tasks_timestamp;
CREATE TRIGGER update_tasks_timestamp
AFTER UPDATE ON tasks
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- After creating a board, create default columns (drop existing trigger then create)
DROP TRIGGER IF EXISTS create_default_columns;
CREATE TRIGGER create_default_columns
AFTER INSERT ON boards
FOR EACH ROW
BEGIN
  INSERT INTO task_columns (board_id, name, position, color) VALUES
    (NEW.id, 'Pending', 1, '#f1f5f9'),
    (NEW.id, 'In Progress', 2, '#fef3c7'),
    (NEW.id, 'Completed', 3, '#d1fae5'),
    (NEW.id, 'Cancelled', 4, '#fecaca');
END;
