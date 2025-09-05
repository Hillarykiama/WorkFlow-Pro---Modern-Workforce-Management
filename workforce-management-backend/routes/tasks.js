const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database'); // FIXED: Use executeQuery instead of db
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * Validation middleware for task operations
 */
const validateTask = [
  body('title').trim().isLength({ min: 1, max: 255 }).withMessage('Title is required and must be less than 255 characters'),
  body('description').optional().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('priority').optional().isIn(['low', 'medium', 'high']).withMessage('Priority must be one of: low, medium, high'),
  body('status').optional().isIn(['todo', 'in_progress', 'review', 'completed', 'cancelled'])
    .withMessage('Status must be one of: todo, in_progress, review, completed, cancelled'),
  body('assignedTo').optional().isInt().withMessage('Assigned user must be a valid user ID'),
  body('dueDate').optional().isISO8601().toDate().withMessage('Due date must be a valid date'),
  body('estimatedHours').optional().isFloat({ min: 0 }).withMessage('Estimated hours must be a positive number'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  body('boardId').optional().isInt().withMessage('Board ID must be a valid integer')
];

const validateTaskUpdate = [
  body('title').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Title must be less than 255 characters'),
  body('description').optional().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('priority').optional().isIn(['low', 'medium', 'high']).withMessage('Priority must be one of: low, medium, high'),
  body('status').optional().isIn(['todo', 'in_progress', 'review', 'completed', 'cancelled'])
    .withMessage('Status must be one of: todo, in_progress, review, completed, cancelled'),
  body('assignedTo').optional().isInt().withMessage('Assigned user must be a valid user ID'),
  body('dueDate').optional().isISO8601().toDate().withMessage('Due date must be a valid date'),
  body('estimatedHours').optional().isFloat({ min: 0 }).withMessage('Estimated hours must be a positive number'),
  body('actualHours').optional().isFloat({ min: 0 }).withMessage('Actual hours must be a positive number'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  body('boardId').optional().isInt().withMessage('Board ID must be a valid integer')
];

/**
 * Helper function to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errors.array()
    });
  }
  next();
};

/**
 * Helper function to check if user can access task
 */
const canAccessTask = async (userId, taskId, userRole) => {
  if (userRole === 'admin') return true;

  const taskResult = await executeQuery(
    'SELECT created_by, assigned_to FROM tasks WHERE id = ?',
    [taskId]
  );

  if (taskResult.rows.length === 0) return false;

  const task = taskResult.rows[0];
  return task.created_by === userId || task.assigned_to === userId;
};

/**
 * @route GET /api/tasks
 * @desc Get all tasks with filtering and pagination
 * @access Private
 */
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      assignedTo,
      createdBy,
      boardId,
      search,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const userId = req.user.id;
    const userRole = req.user.role;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];

    if (userRole !== 'admin') {
      whereConditions.push('(t.created_by = ? OR t.assigned_to = ?)');
      queryParams.push(userId, userId);
    }

    if (status) {
      whereConditions.push('t.status = ?');
      queryParams.push(status);
    }

    if (priority) {
      whereConditions.push('t.priority = ?');
      queryParams.push(priority);
    }

    if (assignedTo) {
      whereConditions.push('t.assigned_to = ?');
      queryParams.push(parseInt(assignedTo));
    }

    if (createdBy) {
      whereConditions.push('t.created_by = ?');
      queryParams.push(parseInt(createdBy));
    }

    if (boardId) {
      whereConditions.push('t.board_id = ?');
      queryParams.push(parseInt(boardId));
    }

    if (search) {
      whereConditions.push('(t.title LIKE ? OR t.description LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const validSortColumns = ['id', 'title', 'priority', 'status', 'created_at', 'updated_at', 'due_date'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM tasks t
      ${whereClause}
    `;
    
    const countResult = await executeQuery(countQuery, queryParams);
    const total = countResult.rows[0].total;

    const tasksQuery = `
      SELECT 
        t.*,
        creator.first_name as creator_first_name,
        creator.last_name as creator_last_name,
        creator.email as creator_email,
        assignee.first_name as assignee_first_name,
        assignee.last_name as assignee_last_name,
        assignee.email as assignee_email,
        b.name as board_name
      FROM tasks t
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN users assignee ON t.assigned_to = assignee.id
      LEFT JOIN boards b ON t.board_id = b.id
      ${whereClause}
      ORDER BY t.${safeSortBy} ${safeSortOrder}
      LIMIT ? OFFSET ?
    `;

    const tasksResult = await executeQuery(tasksQuery, [...queryParams, parseInt(limit), offset]);

    const tasks = tasksResult.rows.map(task => ({
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

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      tasks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tasks',
      code: 'FETCH_TASKS_ERROR'
    });
  }
});

/**
 * @route POST /api/tasks
 * @desc Create a new task
 * @access Private
 */
router.post('/', validateTask, handleValidationErrors, async (req, res) => {
  try {
    const {
      title,
      description = '',
      priority = 'medium',
      status = 'todo',   // ✅ default is "todo"
      assignedTo,
      dueDate,
      estimatedHours,
      tags = [],
      boardId
    } = req.body;

    const userId = req.user.id;

    if (assignedTo) {
      const userResult = await executeQuery(
        'SELECT id FROM users WHERE id = ? AND status = "active"',
        [assignedTo]
      );
      if (userResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Assigned user not found or inactive',
          code: 'INVALID_ASSIGNEE'
        });
      }
    }

    if (boardId) {
      const boardResult = await executeQuery(
        'SELECT id FROM boards WHERE id = ?',
        [boardId]
      );
      if (boardResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Board not found',
          code: 'INVALID_BOARD'
        });
      }
    }

    const taskResult = await executeQuery(`
      INSERT INTO tasks (
        title, description, priority, status, assigned_to, due_date,
        estimated_hours, tags, board_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      title,
      description,
      priority,
      status,
      assignedTo || null,
      dueDate || null,
      estimatedHours || null,
      JSON.stringify(tags),
      boardId || null,
      userId,
      new Date().toISOString(),
      new Date().toISOString()
    ]);

    const taskId = taskResult.lastInsertRowid;

    const newTaskResult = await executeQuery(`
      SELECT 
        t.*,
        creator.first_name as creator_first_name,
        creator.last_name as creator_last_name,
        creator.email as creator_email,
        assignee.first_name as assignee_first_name,
        assignee.last_name as assignee_last_name,
        assignee.email as assignee_email
      FROM tasks t
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN users assignee ON t.assigned_to = assignee.id
      WHERE t.id = ?
    `, [taskId]);

    const task = newTaskResult.rows[0];

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task: {
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
      }
    });

  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create task',
      code: 'CREATE_TASK_ERROR'
    });
  }
});

module.exports = router;
