const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { body, validationResult, param, query } = require('express-validator');

// Validation middleware
const validateTask = [
    body('title')
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Title is required and must be between 1-200 characters'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Description must not exceed 1000 characters'),
    body('priority')
        .optional()
        .isIn(['low', 'medium', 'high', 'urgent'])
        .withMessage('Priority must be one of: low, medium, high, urgent'),
    body('status')
        .optional()
        .isIn(['pending', 'in_progress', 'completed', 'cancelled'])
        .withMessage('Status must be one of: pending, in_progress, completed, cancelled'),
    body('assigned_to')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Assigned to must be a valid user ID'),
    body('project_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Project ID must be a valid integer'),
    body('due_date')
        .optional()
        .isISO8601()
        .withMessage('Due date must be a valid ISO 8601 date'),
    body('estimated_hours')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Estimated hours must be a positive number'),
    body('tags')
        .optional()
        .isArray()
        .withMessage('Tags must be an array'),
    body('tags.*')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Each tag must be between 1-50 characters')
];

const validateTaskUpdate = [
    body('title')
        .optional()
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Title must be between 1-200 characters'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Description must not exceed 1000 characters'),
    body('priority')
        .optional()
        .isIn(['low', 'medium', 'high', 'urgent'])
        .withMessage('Priority must be one of: low, medium, high, urgent'),
    body('status')
        .optional()
        .isIn(['pending', 'in_progress', 'completed', 'cancelled'])
        .withMessage('Status must be one of: pending, in_progress, completed, cancelled'),
    body('assigned_to')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Assigned to must be a valid user ID'),
    body('project_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Project ID must be a valid integer'),
    body('due_date')
        .optional()
        .isISO8601()
        .withMessage('Due date must be a valid ISO 8601 date'),
    body('estimated_hours')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Estimated hours must be a positive number'),
    body('actual_hours')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Actual hours must be a positive number'),
    body('tags')
        .optional()
        .isArray()
        .withMessage('Tags must be an array'),
    body('tags.*')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Each tag must be between 1-50 characters')
];

const validateId = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Task ID must be a positive integer')
];

const validateUserId = [
    param('userId')
        .isInt({ min: 1 })
        .withMessage('User ID must be a positive integer')
];

const validateProjectId = [
    param('projectId')
        .isInt({ min: 1 })
        .withMessage('Project ID must be a positive integer')
];

// Helper function to handle validation errors
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

// Helper function to check if user can access task
const checkTaskAccess = async (taskId, userId, role) => {
    const query = `
        SELECT t.*, u.email as assigned_email 
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.id = ?
    `;
    
    const [tasks] = await db.execute(query, [taskId]);
    
    if (tasks.length === 0) {
        return { accessible: false, task: null, message: 'Task not found' };
    }
    
    const task = tasks[0];
    
    // Admin and manager can access all tasks
    if (role === 'admin' || role === 'manager') {
        return { accessible: true, task };
    }
    
    // Employees can only access tasks assigned to them or created by them
    if (task.created_by === userId || task.assigned_to === userId) {
        return { accessible: true, task };
    }
    
    return { accessible: false, task: null, message: 'Access denied' };
};

// GET /api/tasks - Get all tasks with filtering and pagination
router.get('/', [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1-100'),
    query('status').optional().isIn(['pending', 'in_progress', 'completed', 'cancelled']),
    query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
    query('assigned_to').optional().isInt({ min: 1 }),
    query('project_id').optional().isInt({ min: 1 }),
    query('search').optional().trim().isLength({ max: 100 }),
    handleValidationErrors
], async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            priority,
            assigned_to,
            project_id,
            search,
            sort_by = 'created_at',
            sort_order = 'DESC'
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);
        const userId = req.user.id;
        const userRole = req.user.role;

        // Build WHERE clause based on user role and filters
        let whereClause = '1=1';
        let queryParams = [];

        // Role-based access control
        if (userRole === 'employee') {
            whereClause += ' AND (t.created_by = ? OR t.assigned_to = ?)';
            queryParams.push(userId, userId);
        }

        // Apply filters
        if (status) {
            whereClause += ' AND t.status = ?';
            queryParams.push(status);
        }

        if (priority) {
            whereClause += ' AND t.priority = ?';
            queryParams.push(priority);
        }

        if (assigned_to) {
            whereClause += ' AND t.assigned_to = ?';
            queryParams.push(assigned_to);
        }

        if (project_id) {
            whereClause += ' AND t.project_id = ?';
            queryParams.push(project_id);
        }

        if (search) {
            whereClause += ' AND (t.title LIKE ? OR t.description LIKE ?)';
            const searchPattern = `%${search}%`;
            queryParams.push(searchPattern, searchPattern);
        }

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM tasks t
            WHERE ${whereClause}
        `;

        const [countResult] = await db.execute(countQuery, queryParams);
        const totalTasks = countResult[0].total;

        // Get tasks with details
        const tasksQuery = `
            SELECT 
                t.*,
                creator.email as creator_email,
                creator.first_name as creator_first_name,
                creator.last_name as creator_last_name,
                assignee.email as assignee_email,
                assignee.first_name as assignee_first_name,
                assignee.last_name as assignee_last_name,
                p.name as project_name
            FROM tasks t
            LEFT JOIN users creator ON t.created_by = creator.id
            LEFT JOIN users assignee ON t.assigned_to = assignee.id
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE ${whereClause}
            ORDER BY t.${sort_by} ${sort_order}
            LIMIT ? OFFSET ?
        `;

        queryParams.push(parseInt(limit), offset);
        const [tasks] = await db.execute(tasksQuery, queryParams);

        // Parse tags for each task
        tasks.forEach(task => {
            task.tags = task.tags ? JSON.parse(task.tags) : [];
        });

        res.json({
            success: true,
            data: {
                tasks,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total: totalTasks,
                    total_pages: Math.ceil(totalTasks / parseInt(limit))
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/tasks - Create new task
router.post('/', validateTask, handleValidationErrors, async (req, res, next) => {
    try {
        const {
            title,
            description,
            priority = 'medium',
            status = 'pending',
            assigned_to,
            project_id,
            due_date,
            estimated_hours,
            tags = []
        } = req.body;

        const userId = req.user.id;
        const userRole = req.user.role;

        // Check if user can assign tasks to others
        if (assigned_to && assigned_to !== userId && userRole === 'employee') {
            return res.status(403).json({
                success: false,
                message: 'Employees can only assign tasks to themselves'
            });
        }

        // Verify assigned user exists if provided
        if (assigned_to) {
            const [assigneeCheck] = await db.execute(
                'SELECT id FROM users WHERE id = ? AND is_active = true',
                [assigned_to]
            );
            
            if (assigneeCheck.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Assigned user not found or inactive'
                });
            }
        }

        // Verify project exists if provided
        if (project_id) {
            const [projectCheck] = await db.execute(
                'SELECT id FROM projects WHERE id = ?',
                [project_id]
            );
            
            if (projectCheck.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Project not found'
                });
            }
        }

        const insertQuery = `
            INSERT INTO tasks (
                title, description, priority, status, created_by, assigned_to,
                project_id, due_date, estimated_hours, tags, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;

        const [result] = await db.execute(insertQuery, [
            title,
            description,
            priority,
            status,
            userId,
            assigned_to,
            project_id,
            due_date,
            estimated_hours,
            JSON.stringify(tags)
        ]);

        // Fetch the created task with details
        const [createdTask] = await db.execute(`
            SELECT 
                t.*,
                creator.email as creator_email,
                assignee.email as assignee_email,
                p.name as project_name
            FROM tasks t
            LEFT JOIN users creator ON t.created_by = creator.id
            LEFT JOIN users assignee ON t.assigned_to = assignee.id
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE t.id = ?
        `, [result.insertId]);

        const task = createdTask[0];
        task.tags = JSON.parse(task.tags || '[]');

        res.status(201).json({
            success: true,
            message: 'Task created successfully',
            data: task
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/tasks/:id - Get task by ID
router.get('/:id', validateId, handleValidationErrors, async (req, res, next) => {
    try {
        const taskId = parseInt(req.params.id);
        const userId = req.user.id;
        const userRole = req.user.role;

        const { accessible, task, message } = await checkTaskAccess(taskId, userId, userRole);

        if (!accessible) {
            return res.status(task ? 403 : 404).json({
                success: false,
                message
            });
        }

        // Get full task details
        const [taskDetails] = await db.execute(`
            SELECT 
                t.*,
                creator.email as creator_email,
                creator.first_name as creator_first_name,
                creator.last_name as creator_last_name,
                assignee.email as assignee_email,
                assignee.first_name as assignee_first_name,
                assignee.last_name as assignee_last_name,
                p.name as project_name
            FROM tasks t
            LEFT JOIN users creator ON t.created_by = creator.id
            LEFT JOIN users assignee ON t.assigned_to = assignee.id
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE t.id = ?
        `, [taskId]);

        const taskDetail = taskDetails[0];
        taskDetail.tags = JSON.parse(taskDetail.tags || '[]');

        res.json({
            success: true,
            data: taskDetail
        });
    } catch (error) {
        next(error);
    }
});

// PUT /api/tasks/:id - Update task
router.put('/:id', [...validateId, ...validateTaskUpdate], handleValidationErrors, async (req, res, next) => {
    try {
        const taskId = parseInt(req.params.id);
        const userId = req.user.id;
        const userRole = req.user.role;

        const { accessible, task, message } = await checkTaskAccess(taskId, userId, userRole);

        if (!accessible) {
            return res.status(task ? 403 : 404).json({
                success: false,
                message
            });
        }

        const {
            title,
            description,
            priority,
            status,
            assigned_to,
            project_id,
            due_date,
            estimated_hours,
            actual_hours,
            tags
        } = req.body;

        // Check permissions for certain updates
        if (userRole === 'employee') {
            // Employees can only update tasks assigned to them or created by them
            // and cannot change assignment
            if (assigned_to && assigned_to !== task.assigned_to && assigned_to !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Employees cannot reassign tasks to other users'
                });
            }
        }

        // Verify assigned user exists if being changed
        if (assigned_to && assigned_to !== task.assigned_to) {
            const [assigneeCheck] = await db.execute(
                'SELECT id FROM users WHERE id = ? AND is_active = true',
                [assigned_to]
            );
            
            if (assigneeCheck.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Assigned user not found or inactive'
                });
            }
        }

        // Verify project exists if being changed
        if (project_id && project_id !== task.project_id) {
            const [projectCheck] = await db.execute(
                'SELECT id FROM projects WHERE id = ?',
                [project_id]
            );
            
            if (projectCheck.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Project not found'
                });
            }
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (title !== undefined) {
            updates.push('title = ?');
            values.push(title);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description);
        }
        if (priority !== undefined) {
            updates.push('priority = ?');
            values.push(priority);
        }
        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);
        }
        if (assigned_to !== undefined) {
            updates.push('assigned_to = ?');
            values.push(assigned_to);
        }
        if (project_id !== undefined) {
            updates.push('project_id = ?');
            values.push(project_id);
        }
        if (due_date !== undefined) {
            updates.push('due_date = ?');
            values.push(due_date);
        }
        if (estimated_hours !== undefined) {
            updates.push('estimated_hours = ?');
            values.push(estimated_hours);
        }
        if (actual_hours !== undefined) {
            updates.push('actual_hours = ?');
            values.push(actual_hours);
        }
        if (tags !== undefined) {
            updates.push('tags = ?');
            values.push(JSON.stringify(tags));
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }

        updates.push('updated_at = NOW()');
        values.push(taskId);

        const updateQuery = `
            UPDATE tasks SET ${updates.join(', ')}
            WHERE id = ?
        `;

        await db.execute(updateQuery, values);

        // Fetch updated task
        const [updatedTask] = await db.execute(`
            SELECT 
                t.*,
                creator.email as creator_email,
                assignee.email as assignee_email,
                p.name as project_name
            FROM tasks t
            LEFT JOIN users creator ON t.created_by = creator.id
            LEFT JOIN users assignee ON t.assigned_to = assignee.id
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE t.id = ?
        `, [taskId]);

        const updatedTaskData = updatedTask[0];
        updatedTaskData.tags = JSON.parse(updatedTaskData.tags || '[]');

        res.json({
            success: true,
            message: 'Task updated successfully',
            data: updatedTaskData
        });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', validateId, handleValidationErrors, async (req, res, next) => {
    try {
        const taskId = parseInt(req.params.id);
        const userId = req.user.id;
        const userRole = req.user.role;

        const { accessible, task, message } = await checkTaskAccess(taskId, userId, userRole);

        if (!accessible) {
            return res.status(task ? 403 : 404).json({
                success: false,
                message
            });
        }

        // Only admin, manager, or task creator can delete tasks
        if (userRole === 'employee' && task.created_by !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Employees can only delete tasks they created'
            });
        }

        await db.execute('DELETE FROM tasks WHERE id = ?', [taskId]);

        res.json({
            success: true,
            message: 'Task deleted successfully'
        });
    } catch (error) {
        next(error);
    }
});

// PATCH /api/tasks/:id/status - Update task status
router.patch('/:id/status', [
    ...validateId,
    body('status')
        .isIn(['pending', 'in_progress', 'completed', 'cancelled'])
        .withMessage('Status must be one of: pending, in_progress, completed, cancelled'),
    handleValidationErrors
], async (req, res, next) => {
    try {
        const taskId = parseInt(req.params.id);
        const { status } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;

        const { accessible, task, message } = await checkTaskAccess(taskId, userId, userRole);

        if (!accessible) {
            return res.status(task ? 403 : 404).json({
                success: false,
                message
            });
        }

        await db.execute(
            'UPDATE tasks SET status = ?, updated_at = NOW() WHERE id = ?',
            [status, taskId]
        );

        res.json({
            success: true,
            message: 'Task status updated successfully',
            data: { id: taskId, status }
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/tasks/user/:userId - Get tasks by user
router.get('/user/:userId', validateUserId, handleValidationErrors, async (req, res, next) => {
    try {
        const targetUserId = parseInt(req.params.userId);
        const currentUserId = req.user.id;
        const userRole = req.user.role;

        // Check if user can view other user's tasks
        if (userRole === 'employee' && targetUserId !== currentUserId) {
            return res.status(403).json({
                success: false,
                message: 'Employees can only view their own tasks'
            });
        }

        // Verify target user exists
        const [userCheck] = await db.execute(
            'SELECT id, email, first_name, last_name FROM users WHERE id = ?',
            [targetUserId]
        );

        if (userCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const [tasks] = await db.execute(`
            SELECT 
                t.*,
                creator.email as creator_email,
                p.name as project_name
            FROM tasks t
            LEFT JOIN users creator ON t.created_by = creator.id
            LEFT JOIN projects p ON t.project_id = p.id
            WHERE t.assigned_to = ?
            ORDER BY t.created_at DESC
        `, [targetUserId]);

        // Parse tags for each task
        tasks.forEach(task => {
            task.tags = JSON.parse(task.tags || '[]');
        });

        res.json({
            success: true,
            data: {
                user: userCheck[0],
                tasks
            }
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/tasks/project/:projectId - Get tasks by project
router.get('/project/:projectId', validateProjectId, handleValidationErrors, async (req, res, next) => {
    try {
        const projectId = parseInt(req.params.projectId);
        const userId = req.user.id;
        const userRole = req.user.role;

        // Verify project exists
        const [projectCheck] = await db.execute(
            'SELECT id, name, description FROM projects WHERE id = ?',
            [projectId]
        );

        if (projectCheck.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // Build query based on user role
        let whereClause = 't.project_id = ?';
        let queryParams = [projectId];

        if (userRole === 'employee') {
            whereClause += ' AND (t.created_by = ? OR t.assigned_to = ?)';
            queryParams.push(userId, userId);
        }

        const [tasks] = await db.execute(`
            SELECT 
                t.*,
                creator.email as creator_email,
                creator.first_name as creator_first_name,
                creator.last_name as creator_last_name,
                assignee.email as assignee_email,
                assignee.first_name as assignee_first_name,
                assignee.last_name as assignee_last_name
            FROM tasks t
            LEFT JOIN users creator ON t.created_by = creator.id
            LEFT JOIN users assignee ON t.assigned_to = assignee.id
            WHERE ${whereClause}
            ORDER BY t.created_at DESC
        `, queryParams);

        // Parse tags for each task
        tasks.forEach(task => {
            task.tags = JSON.parse(task.tags || '[]');
        });

        res.json({
            success: true,
            data: {
                project: projectCheck[0],
                tasks
            }
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/tasks/stats - Get task statistics
router.get('/stats', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        // Build base query based on user role
        let whereClause = '1=1';
        let queryParams = [];

        if (userRole === 'employee') {
            whereClause = '(created_by = ? OR assigned_to = ?)';
            queryParams = [userId, userId];
        }

        // Get general statistics
        const [stats] = await db.execute(`
            SELECT 
                COUNT(*) as total_tasks,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_tasks,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_tasks,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_tasks,
                SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent_tasks,
                SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high_priority_tasks,
                SUM(CASE WHEN due_date < NOW() AND status != 'completed' THEN 1 ELSE 0 END) as overdue_tasks,
                AVG(estimated_hours) as avg_estimated_hours,
                AVG(actual_hours) as avg_actual_hours
            FROM tasks 
            WHERE ${whereClause}
        `, queryParams);

        // Get tasks due this week
        const [dueSoon] = await db.execute(`
            SELECT COUNT(*) as due_this_week
            FROM tasks 
            WHERE ${whereClause}
            AND due_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
            AND status != 'completed'
        `, queryParams);

        // Get completion rate by month (last 6 months)
        const [monthlyStats] = await db.execute(`
            SELECT 
                DATE_FORMAT(created_at, '%Y-%m') as month,
                COUNT(*) as created,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
            FROM tasks 
            WHERE ${whereClause}
            AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
            ORDER BY month DESC
        `, queryParams);

        res.json({
            success: true,
            data: {
                overview: stats[0],
                due_this_week: dueSoon[0].due_this_week,
                monthly_stats: monthlyStats
            }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;