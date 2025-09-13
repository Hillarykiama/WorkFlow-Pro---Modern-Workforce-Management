-- 003_alter_tasks_tags.sql
PRAGMA foreign_keys = ON;

-- Add default value to tags column in tasks
ALTER TABLE tasks RENAME TO _tasks_old;

CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE,
    column_id INTEGER REFERENCES task_columns(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to INTEGER REFERENCES users(id),
    created_by INTEGER REFERENCES users(id),
    priority TEXT CHECK(priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
    due_date DATETIME,
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2) DEFAULT 0,
    status TEXT CHECK(status IN ('todo','in-progress','completed','cancelled')) DEFAULT 'todo',
    position INTEGER,
    tags TEXT DEFAULT '[]', -- ✅ JSON array stored as TEXT
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copy data over
INSERT INTO tasks (
    id, board_id, column_id, title, description, assigned_to, created_by,
    priority, due_date, estimated_hours, actual_hours, status, position, tags,
    created_at, updated_at
)
SELECT
    id, board_id, column_id, title, description, assigned_to, created_by,
    priority, due_date, estimated_hours, actual_hours, status, position,
    COALESCE(tags, '[]'), -- ✅ ensure null becomes []
    created_at, updated_at
FROM _tasks_old;

DROP TABLE _tasks_old;
