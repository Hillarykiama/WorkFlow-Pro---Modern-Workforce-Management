// routes/tasks.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Protect all routes
router.use(authenticateToken);

/* ---------- Validation schemas ---------- */
const validateTask = [
  body('title').trim().isLength({ min: 1, max: 255 }),
  body('description').optional().isLength({ max: 1000 }),
  body('priority').optional().isIn(['low', 'medium', 'high']),
  body('status').optional().isIn(['todo', 'in_progress', 'review', 'completed', 'cancelled']),
  body('assignedTo').optional().isInt(),
  body('dueDate').optional().isISO8601().toDate(),
  body('estimatedHours').optional().isFloat({ min: 0 }),
  body('tags').optional().isArray(),
  body('boardId').optional().isInt()
];

const validateTaskUpdate = [
  body('title').optional().trim().isLength({ min: 1, max: 255 }),
  body('description').optional().isLength({ max: 1000 }),
  body('priority').optional().isIn(['low', 'medium', 'high']),
  body('status').optional().isIn(['todo', 'in_progress', 'review', 'completed', 'cancelled']),
  body('assignedTo').optional().custom(val => (val === null || Number.isInteger(val)) ? true : false),
  body('dueDate').optional().isISO8601().toDate(),
  body('estimatedHours').optional().isFloat({ min: 0 }),
  body('actualHours').optional().isFloat({ min: 0 }),
  body('tags').optional().isArray(),
  body('boardId').optional().isInt()
];

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array() });
  next();
}

/* ---------- Helpers ---------- */

async function canAccessTask(userId, taskId, userRole) {
  if (userRole === 'admin') return true;
  const rr = await executeQuery('SELECT created_by, assigned_to FROM tasks WHERE id = ? AND deleted_at IS NULL', [taskId]);
  if (rr.rows.length === 0) return false;
  const t = rr.rows[0];
  if (t.created_by === userId || t.assigned_to === userId) return true;
  // TODO: extend for team/manager access
  return false;
}

/* ---------- Routes ---------- */

// GET /api/tasks
router.get('/', asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 20, status, priority, assignedTo, createdBy, boardId, search,
    sortBy = 'created_at', sortOrder = 'DESC'
  } = req.query;

  const userId = req.user.id;
  const userRole = req.user.role;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const whereConditions = ['t.deleted_at IS NULL'];
  const queryParams = [];

  if (userRole !== 'admin') {
    whereConditions.push('(t.created_by = ? OR t.assigned_to = ?)');
    queryParams.push(userId, userId);
  }

  if (status) { whereConditions.push('t.status = ?'); queryParams.push(status); }
  if (priority) { whereConditions.push('t.priority = ?'); queryParams.push(priority); }
  if (assignedTo) { whereConditions.push('t.assigned_to = ?'); queryParams.push(parseInt(assignedTo)); }
  if (createdBy) { whereConditions.push('t.created_by = ?'); queryParams.push(parseInt(createdBy)); }
  if (boardId) { whereConditions.push('t.board_id = ?'); queryParams.push(parseInt(boardId)); }
  if (search) { whereConditions.push('(t.title LIKE ? OR t.description LIKE ?)'); const s = `%${search}%`; queryParams.push(s, s); }

  const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

  const validSortColumns = ['id', 'title', 'priority', 'status', 'created_at', 'updated_at', 'due_date'];
  const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const safeSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

  const countQ = `SELECT COUNT(*) as total FROM tasks t ${whereClause}`;
  const countR = await executeQuery(countQ, queryParams);
  const total = countR.rows[0] ? Number(countR.rows[0].total) : 0;

  const tasksQ = `
    SELECT t.*, creator.first_name AS creator_first_name, creator.last_name AS creator_last_name,
           creator.email AS creator_email, assignee.first_name AS assignee_first_name,
           assignee.last_name AS assignee_last_name, assignee.email AS assignee_email,
           b.name AS board_name
    FROM tasks t
    LEFT JOIN users creator ON t.created_by = creator.id
    LEFT JOIN users assignee ON t.assigned_to = assignee.id
    LEFT JOIN boards b ON t.board_id = b.id
    ${whereClause}
    ORDER BY t.${safeSortBy} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `;

  const tasksR = await executeQuery(tasksQ, [...queryParams, parseInt(limit), offset]);

  const tasks = tasksR.rows.map(task => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    estimatedHours: task.estimated_hours,
    actualHours: task.actual_hours,
    dueDate: task.due_date,
    tags: task.tags ? JSON.parse(task.tags) : [],
    boardId: task.board_id,
    boardName: task.board_name,
    createdBy: {
      id: task.created_by,
      firstName: task.creator_first_name,
      lastName: task.creator_last_name,
      email: task.creator_email
    },
    assignedTo: task.assigned_to ? {
      id: task.assigned_to,
      firstName: task.assignee_first_name,
      lastName: task.assignee_last_name,
      email: task.assignee_email
    } : null,
    createdAt: task.created_at,
    updatedAt: task.updated_at
  }));

  res.json({
    success: true,
    tasks,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
      hasPrev: parseInt(page) > 1
    }
  });
}));

// GET /api/tasks/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const taskId = parseInt(req.params.id);
  const userId = req.user.id;
  const userRole = req.user.role;

  const access = await canAccessTask(userId, taskId, userRole);
  if (!access) return res.status(403).json({ success: false, error: 'Access denied', code: 'ACCESS_DENIED' });

  const r = await executeQuery(`
    SELECT t.*, creator.first_name AS creator_first_name, creator.last_name AS creator_last_name,
           creator.email AS creator_email, assignee.first_name AS assignee_first_name,
           assignee.last_name AS assignee_last_name, assignee.email AS assignee_email,
           b.name AS board_name
    FROM tasks t
    LEFT JOIN users creator ON t.created_by = creator.id
    LEFT JOIN users assignee ON t.assigned_to = assignee.id
    LEFT JOIN boards b ON t.board_id = b.id
    WHERE t.id = ? AND t.deleted_at IS NULL
  `, [taskId]);

  if (r.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found', code: 'TASK_NOT_FOUND' });

  const task = r.rows[0];
  res.json({ success: true, task: {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    estimatedHours: task.estimated_hours,
    actualHours: task.actual_hours,
    dueDate: task.due_date,
    tags: task.tags ? JSON.parse(task.tags) : [],
    boardId: task.board_id,
    boardName: task.board_name,
    createdBy: {
      id: task.created_by,
      firstName: task.creator_first_name,
      lastName: task.creator_last_name,
      email: task.creator_email
    },
    assignedTo: task.assigned_to ? {
      id: task.assigned_to,
      firstName: task.assignee_first_name,
      lastName: task.assignee_last_name,
      email: task.assignee_email
    } : null,
    createdAt: task.created_at,
    updatedAt: task.updated_at
  }});
}));

// POST /api/tasks
router.post('/', validateTask, handleValidationErrors, asyncHandler(async (req, res) => {
  const {
    title, description = '', priority = 'medium', status = 'todo',
    assignedTo, dueDate, estimatedHours, tags = [], boardId
  } = req.body;
  const userId = req.user.id;

  if (assignedTo) {
    const u = await executeQuery('SELECT id FROM users WHERE id = ? AND status = "active"', [assignedTo]);
    if (u.rows.length === 0) return res.status(400).json({ success: false, error: 'Assigned user not found or inactive', code: 'INVALID_ASSIGNEE' });
  }

  if (boardId) {
    const b = await executeQuery('SELECT id FROM boards WHERE id = ?', [boardId]);
    if (b.rows.length === 0) return res.status(400).json({ success: false, error: 'Board not found', code: 'INVALID_BOARD' });
  }

  const insert = await executeQuery(`
    INSERT INTO tasks (
      title, description, priority, status, assigned_to, due_date,
      estimated_hours, tags, board_id, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [title, description, priority, status, assignedTo || null, dueDate || null,
      estimatedHours || null, JSON.stringify(tags), boardId || null, userId, new Date().toISOString(), new Date().toISOString()
  ]);

  const id = insert.lastInsertRowid;
  const newTaskR = await executeQuery(`
    SELECT t.*, creator.first_name AS creator_first_name, creator.last_name AS creator_last_name,
           creator.email AS creator_email, assignee.first_name AS assignee_first_name,
           assignee.last_name AS assignee_last_name, assignee.email AS assignee_email,
           b.name AS board_name
    FROM tasks t
    LEFT JOIN users creator ON t.created_by = creator.id
    LEFT JOIN users assignee ON t.assigned_to = assignee.id
    LEFT JOIN boards b ON t.board_id = b.id
    WHERE t.id = ?
  `, [id]);

  const task = newTaskR.rows[0];
  res.status(201).json({ success: true, message: 'Task created successfully', task: {
    id: task.id, title: task.title, description: task.description, status: task.status,
    priority: task.priority, estimatedHours: task.estimated_hours, actualHours: task.actual_hours,
    dueDate: task.due_date, tags: task.tags ? JSON.parse(task.tags) : [], boardId: task.board_id,
    boardName: task.board_name,
    createdBy: { id: task.created_by, firstName: task.creator_first_name, lastName: task.creator_last_name, email: task.creator_email },
    assignedTo: task.assigned_to ? { id: task.assigned_to, firstName: task.assignee_first_name, lastName: task.assignee_last_name, email: task.assignee_email } : null,
    createdAt: task.created_at, updatedAt: task.updated_at
  }});
}));

// PUT /api/tasks/:id
router.put('/:id', validateTaskUpdate, handleValidationErrors, asyncHandler(async (req, res) => {
  const taskId = parseInt(req.params.id);
  const userId = req.user.id;
  const userRole = req.user.role;

  const access = await canAccessTask(userId, taskId, userRole);
  if (!access) return res.status(403).json({ success: false, error: 'Access denied', code: 'ACCESS_DENIED' });

  const { title, description, priority, status, assignedTo, dueDate, estimatedHours, actualHours, tags, boardId } = req.body;

  const updates = [];
  const values = [];

  if (title !== undefined) { updates.push('title = ?'); values.push(title); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }
  if (priority !== undefined) { updates.push('priority = ?'); values.push(priority); }
  if (status !== undefined) { updates.push('status = ?'); values.push(status); }
  if (assignedTo !== undefined) {
    if (assignedTo !== null) {
      const u = await executeQuery('SELECT id FROM users WHERE id = ? AND status = "active"', [assignedTo]);
      if (u.rows.length === 0) return res.status(400).json({ success: false, error: 'Assigned user not found or inactive', code: 'INVALID_ASSIGNEE' });
    }
    updates.push('assigned_to = ?'); values.push(assignedTo);
  }
  if (dueDate !== undefined) { updates.push('due_date = ?'); values.push(dueDate); }
  if (estimatedHours !== undefined) { updates.push('estimated_hours = ?'); values.push(estimatedHours); }
  if (actualHours !== undefined) { updates.push('actual_hours = ?'); values.push(actualHours); }
  if (tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(tags)); }
  if (boardId !== undefined) { updates.push('board_id = ?'); values.push(boardId); }

  if (updates.length === 0) return res.status(400).json({ success: false, error: 'No valid fields to update', code: 'NO_UPDATES' });

  updates.push('updated_at = ?'); values.push(new Date().toISOString());
  values.push(taskId);

  await executeQuery(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, values);

  const updatedR = await executeQuery(`
    SELECT t.*, creator.first_name AS creator_first_name, creator.last_name AS creator_last_name,
           creator.email AS creator_email, assignee.first_name AS assignee_first_name,
           assignee.last_name AS assignee_last_name, assignee.email AS assignee_email,
           b.name AS board_name
    FROM tasks t
    LEFT JOIN users creator ON t.created_by = creator.id
    LEFT JOIN users assignee ON t.assigned_to = assignee.id
    LEFT JOIN boards b ON t.board_id = b.id
    WHERE t.id = ?
  `, [taskId]);

  const task = updatedR.rows[0];
  res.json({ success: true, message: 'Task updated successfully', task: {
    id: task.id, title: task.title, description: task.description, status: task.status,
    priority: task.priority, estimatedHours: task.estimated_hours, actualHours: task.actual_hours,
    dueDate: task.due_date, tags: task.tags ? JSON.parse(task.tags) : [], boardId: task.board_id,
    boardName: task.board_name,
    createdBy: { id: task.created_by, firstName: task.creator_first_name, lastName: task.creator_last_name, email: task.creator_email },
    assignedTo: task.assigned_to ? { id: task.assigned_to, firstName: task.assignee_first_name, lastName: task.assignee_last_name, email: task.assignee_email } : null,
    createdAt: task.created_at, updatedAt: task.updated_at
  }});
}));

// DELETE /api/tasks/:id (soft delete)
router.delete('/:id', asyncHandler(async (req, res) => {
  const taskId = parseInt(req.params.id);
  const userId = req.user.id;
  const userRole = req.user.role;

  const access = await canAccessTask(userId, taskId, userRole);
  if (!access) return res.status(403).json({ success: false, error: 'Access denied', code: 'ACCESS_DENIED' });

  await executeQuery('UPDATE tasks SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [new Date().toISOString(), taskId]);

  const check = await executeQuery('SELECT id FROM tasks WHERE id = ? AND deleted_at IS NOT NULL', [taskId]);
  if (check.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found', code: 'TASK_NOT_FOUND' });

  res.json({ success: true, message: 'Task deleted (soft) successfully' });
}));

// GET /api/tasks/stats/overview
router.get('/stats/overview', asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  let baseWhere = 'WHERE t.deleted_at IS NULL';
  const params = [];

  if (userRole !== 'admin') {
    baseWhere += ' AND (t.created_by = ? OR t.assigned_to = ?)';
    params.push(userId, userId);
  }

  const statusResult = await executeQuery(`SELECT status, COUNT(*) as count FROM tasks t ${baseWhere} GROUP BY status`, params);
  const priorityResult = await executeQuery(`SELECT priority, COUNT(*) as count FROM tasks t ${baseWhere} GROUP BY priority`, params);

  const overdueQuery = `
    SELECT COUNT(*) as count
    FROM tasks t
    ${baseWhere} AND t.due_date IS NOT NULL AND t.due_date < ? AND t.status NOT IN ('completed','cancelled')
  `;
  const overdueResult = await executeQuery(overdueQuery, [...params, new Date().toISOString()]);

  const stats = { byStatus: {}, byPriority: {}, overdue: overdueResult.rows[0] ? overdueResult.rows[0].count : 0, total: 0 };
  (statusResult.rows || []).forEach(r => { stats.byStatus[r.status] = r.count; stats.total += r.count; });
  (priorityResult.rows || []).forEach(r => { stats.byPriority[r.priority] = r.count; });

  res.json({ success: true, stats });
}));

module.exports = router;
