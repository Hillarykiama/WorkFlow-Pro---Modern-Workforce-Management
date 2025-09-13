const express = require('express');
const { executeQuery } = require('../config/database');
const router = express.Router();

// Allowed values (updated to match DB CHECK constraints)
const ALLOWED_STATUS = ['todo', 'in_progress', 'review', 'completed', 'cancelled'];
const ALLOWED_PRIORITY = ['low', 'medium', 'high', 'urgent'];

/**
 * Normalize a task row from the DB
 */
function normalizeTask(task) {
  return {
    id: task.id,
    boardId: task.board_id,
    columnId: task.column_id,
    title: task.title,
    description: task.description || '',
    assignedTo: task.assigned_to || null,
    createdBy: task.created_by || null,
    priority: task.priority || 'medium',
    dueDate: task.due_date || null,
    estimatedHours: task.estimated_hours || 0,
    actualHours: task.actual_hours || 0,
    status: task.status || 'todo',
    position: task.position || 0,
    tags: task.tags ? JSON.parse(task.tags) : [],
    createdAt: task.created_at,
    updatedAt: task.updated_at
  };
}

/**
 * GET all tasks
 */
router.get('/', async (req, res) => {
  try {
    const result = await executeQuery('SELECT * FROM tasks', []);
    const tasks = result.rows.map(normalizeTask);
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

/**
 * GET task by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await executeQuery('SELECT * FROM tasks WHERE id = ?', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = normalizeTask(result.rows[0]);
    res.json(task);
  } catch (err) {
    console.error('Error fetching task:', err);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

/**
 * CREATE task
 */
router.post('/', async (req, res) => {
  try {
    const {
      boardId,
      columnId,
      title,
      description,
      assignedTo,
      createdBy,
      priority = 'medium',
      dueDate,
      estimatedHours,
      status = 'todo',
      position,
      tags = []
    } = req.body;

    // Validation
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!ALLOWED_STATUS.includes(status)) return res.status(400).json({ error: `Invalid status. Allowed: ${ALLOWED_STATUS.join(', ')}` });
    if (!ALLOWED_PRIORITY.includes(priority)) return res.status(400).json({ error: `Invalid priority. Allowed: ${ALLOWED_PRIORITY.join(', ')}` });
    if (!Array.isArray(tags)) return res.status(400).json({ error: 'Tags must be an array' });

    const tagsString = JSON.stringify(tags);

    const result = await executeQuery(
      `INSERT INTO tasks (board_id, column_id, title, description, assigned_to, created_by, priority, due_date, estimated_hours, status, position, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      [boardId, columnId, title, description, assignedTo, createdBy, priority, dueDate, estimatedHours, status, position, tagsString]
    );

    const newTask = normalizeTask(result.rows[0]);
    res.status(201).json(newTask);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * UPDATE task
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    // Validation
    if (updates.status && !ALLOWED_STATUS.includes(updates.status)) {
      return res.status(400).json({ error: `Invalid status. Allowed: ${ALLOWED_STATUS.join(', ')}` });
    }
    if (updates.priority && !ALLOWED_PRIORITY.includes(updates.priority)) {
      return res.status(400).json({ error: `Invalid priority. Allowed: ${ALLOWED_PRIORITY.join(', ')}` });
    }
    if (updates.tags && !Array.isArray(updates.tags)) {
      return res.status(400).json({ error: 'Tags must be an array' });
    }

    if (updates.tags) updates.tags = JSON.stringify(updates.tags);

    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);

    const result = await executeQuery(
      `UPDATE tasks SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *`,
      [...values, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    const updatedTask = normalizeTask(result.rows[0]);
    res.json(updatedTask);
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * DELETE task
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await executeQuery('DELETE FROM tasks WHERE id = ? RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;




