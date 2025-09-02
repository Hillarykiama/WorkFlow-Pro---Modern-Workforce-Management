-- WorkFlow Pro - Complete Database Schema for Turso
-- This schema supports all features: users, scheduling, tasks, communication, and analytics

-- ================================
-- USER MANAGEMENT TABLES
-- ================================

-- Users table with role-based access
CREATE TABLE users (
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

-- Teams/Departments
CREATE TABLE teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    manager_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Team memberships (many-to-many relationship)
CREATE TABLE team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(team_id, user_id)
);

-- ================================
-- SCHEDULING TABLES
-- ================================

-- Work schedules (weekly/monthly patterns)
CREATE TABLE schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER REFERENCES teams(id),
    name TEXT NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Individual shifts
CREATE TABLE shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    shift_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_duration INTEGER DEFAULT 0, -- minutes
    position TEXT, -- role during shift (cashier, manager, etc.)
    location TEXT,
    status TEXT CHECK(status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')) DEFAULT 'scheduled',
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Shift swap requests
CREATE TABLE shift_swaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_shift_id INTEGER REFERENCES shifts(id),
    requesting_user_id INTEGER REFERENCES users(id),
    target_user_id INTEGER REFERENCES users(id),
    target_shift_id INTEGER REFERENCES shifts(id), -- if swapping specific shift
    reason TEXT,
    status TEXT CHECK(status IN ('pending', 'approved', 'rejected', 'completed')) DEFAULT 'pending',
    approved_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Time off requests
CREATE TABLE time_off_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    type TEXT CHECK(type IN ('vacation', 'sick', 'personal', 'emergency')) NOT NULL,
    reason TEXT,
    status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    approved_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- TASK MANAGEMENT TABLES
-- ================================

-- Project boards (like Kanban boards)
CREATE TABLE boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER REFERENCES teams(id),
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#6366f1',
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Task columns (To Do, In Progress, Completed, etc.)
CREATE TABLE task_columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    color TEXT DEFAULT '#f1f5f9',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tasks
CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER REFERENCES boards(id),
    column_id INTEGER REFERENCES task_columns(id),
    title TEXT NOT NULL,
    description TEXT,
    assigned_to INTEGER REFERENCES users(id),
    created_by INTEGER REFERENCES users(id),
    priority TEXT CHECK(priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
    due_date DATETIME,
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2) DEFAULT 0,
    status TEXT CHECK(status IN ('todo', 'in_progress', 'review', 'completed', 'cancelled')) DEFAULT 'todo',
    position INTEGER, -- for ordering within column
    tags TEXT, -- JSON array of tags
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Task comments/updates
CREATE TABLE task_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Task attachments
CREATE TABLE task_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    uploaded_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- COMMUNICATION TABLES
-- ================================

-- Chat channels
CREATE TABLE channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER REFERENCES teams(id),
    name TEXT NOT NULL,
    description TEXT,
    type TEXT CHECK(type IN ('team', 'direct', 'announcement')) DEFAULT 'team',
    is_private BOOLEAN DEFAULT FALSE,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Channel memberships
CREATE TABLE channel_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role TEXT CHECK(role IN ('member', 'admin')) DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_read_at DATETIME,
    UNIQUE(channel_id, user_id)
);

-- Messages
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    content TEXT NOT NULL,
    message_type TEXT CHECK(message_type IN ('text', 'file', 'system')) DEFAULT 'text',
    parent_id INTEGER REFERENCES messages(id), -- for threading
    edited_at DATETIME,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Message attachments
CREATE TABLE message_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- NOTIFICATIONS TABLES
-- ================================

-- Notifications
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    type TEXT CHECK(type IN ('schedule', 'task', 'message', 'system', 'reminder')) NOT NULL,
    related_id INTEGER, -- ID of related entity (task, shift, etc.)
    related_type TEXT, -- Type of related entity
    is_read BOOLEAN DEFAULT FALSE,
    sent_via TEXT CHECK(sent_via IN ('in_app', 'email', 'sms')) DEFAULT 'in_app',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME
);

-- ================================
-- ANALYTICS & REPORTING TABLES
-- ================================

-- Time tracking (for productivity analytics)
CREATE TABLE time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    task_id INTEGER REFERENCES tasks(id),
    shift_id INTEGER REFERENCES shifts(id),
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    duration INTEGER, -- seconds
    description TEXT,
    billable BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Attendance tracking
CREATE TABLE attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    shift_id INTEGER REFERENCES shifts(id),
    clock_in DATETIME,
    clock_out DATETIME,
    break_start DATETIME,
    break_end DATETIME,
    total_hours DECIMAL(5,2),
    status TEXT CHECK(status IN ('present', 'late', 'absent', 'partial')) DEFAULT 'present',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- SYSTEM CONFIGURATION TABLES
-- ================================

-- Company/Organization settings
CREATE TABLE organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    logo_url TEXT,
    timezone TEXT DEFAULT 'UTC',
    business_hours_start TIME DEFAULT '09:00',
    business_hours_end TIME DEFAULT '17:00',
    working_days TEXT DEFAULT '1,2,3,4,5', -- JSON array of weekdays (1=Monday)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- App settings and configurations
CREATE TABLE settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    type TEXT CHECK(type IN ('string', 'number', 'boolean', 'json')) DEFAULT 'string',
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- INDEXES for Performance
-- ================================

-- User indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- Schedule/Shift indexes
CREATE INDEX idx_shifts_date ON shifts(shift_date);
CREATE INDEX idx_shifts_user ON shifts(user_id);
CREATE INDEX idx_shifts_status ON shifts(status);

-- Task indexes
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_board ON tasks(board_id);

-- Message indexes
CREATE INDEX idx_messages_channel ON messages(channel_id);
CREATE INDEX idx_messages_user ON messages(user_id);
CREATE INDEX idx_messages_created ON messages(created_at);

-- Notification indexes
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_type ON notifications(type);

-- ================================
-- TRIGGERS for Auto-Updates
-- ================================

-- Update timestamps automatically
CREATE TRIGGER update_users_timestamp 
    AFTER UPDATE ON users
    BEGIN
        UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_teams_timestamp 
    AFTER UPDATE ON teams
    BEGIN
        UPDATE teams SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_schedules_timestamp 
    AFTER UPDATE ON schedules
    BEGIN
        UPDATE schedules SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_shifts_timestamp 
    AFTER UPDATE ON shifts
    BEGIN
        UPDATE shifts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_tasks_timestamp 
    AFTER UPDATE ON tasks
    BEGIN
        UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- ================================
-- DEFAULT DATA SETUP
-- ================================

-- Insert default task columns for new boards
CREATE TRIGGER create_default_columns
    AFTER INSERT ON boards
    BEGIN
        INSERT INTO task_columns (board_id, name, position, color) VALUES
        (NEW.id, 'To Do', 1, '#f1f5f9'),
        (NEW.id, 'In Progress', 2, '#fef3c7'),
        (NEW.id, 'Review', 3, '#ddd6fe'),
        (NEW.id, 'Completed', 4, '#d1fae5');
    END;

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value, type, description) VALUES
('company_name', 'WorkFlow Pro', 'string', 'Company name'),
('max_shift_hours', '12', 'number', 'Maximum hours per shift'),
('overtime_threshold', '8', 'number', 'Hours before overtime kicks in'),
('notification_retention_days', '30', 'number', 'Days to keep notifications'),
('file_upload_max_size', '10485760', 'number', 'Max file upload size in bytes (10MB)'),
('enable_time_tracking', 'true', 'boolean', 'Enable time tracking features'),
('enable_shift_swaps', 'true', 'boolean', 'Allow employees to request shift swaps');

-- Insert a default organization
INSERT OR IGNORE INTO organizations (name, timezone) VALUES 
('Default Organization', 'UTC');