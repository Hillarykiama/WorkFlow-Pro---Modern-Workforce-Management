const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { 
  generateToken, 
  generateRefreshToken, 
  verifyRefreshToken,
  authenticateToken 
} = require('../middleware/auth');

const router = express.Router();

/**
 * @route POST /api/auth/register
 * @desc Register a new user
 * @access Public (but should be restricted to admin in production)
 */
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').trim().isLength({ min: 1 }),
  body('lastName').trim().isLength({ min: 1 }),
  body('role').optional().isIn(['admin', 'manager', 'employee'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const { email, password, firstName, lastName, role = 'employee', phone } = req.body;
    
    // Check if user already exists
    const existingUser = await executeQuery(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Email already registered',
        code: 'EMAIL_EXISTS' 
      });
    }
    
    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Insert user
    const userResult = await executeQuery(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, phone) 
      VALUES (?, ?, ?, ?, ?, ?) 
      RETURNING id, email, first_name, last_name, role, status, created_at
    `, [email, passwordHash, firstName, lastName, role, phone]);
    
    const newUser = userResult.rows[0];
    
    // Generate tokens
    const token = generateToken(newUser);
    const refreshToken = generateRefreshToken(newUser);
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        role: newUser.role,
        status: newUser.status,
        createdAt: newUser.created_at
      },
      tokens: {
        accessToken: token,
        refreshToken: refreshToken,
        expiresIn: '24h'
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR' 
    });
  }
});

/**
 * @route POST /api/auth/login
 * @desc Login user
 * @access Public
 */
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const { email, password } = req.body;
    
    // Get user by email
    const userResult = await executeQuery(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS' 
      });
    }
    
    const user = userResult.rows[0];
    
    // Check if account is active
    if (user.status !== 'active') {
      return res.status(401).json({ 
        error: 'Account is not active',
        code: 'ACCOUNT_INACTIVE' 
      });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS' 
      });
    }
    
    // Update last login
    await executeQuery(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [user.id]
    );
    
    // Generate tokens
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);
    
    // Get user teams
    const teamsResult = await executeQuery(`
      SELECT t.id, t.name 
      FROM teams t 
      JOIN team_members tm ON t.id = tm.team_id 
      WHERE tm.user_id = ?
    `, [user.id]);
    
    const teams = teamsResult.rows;
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name}`,
        role: user.role,
        status: user.status,
        avatarUrl: user.avatar_url,
        phone: user.phone,
        timezone: user.timezone,
        teams: teams,
        lastLogin: user.last_login
      },
      tokens: {
        accessToken: token,
        refreshToken: refreshToken,
        expiresIn: '24h'
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Login failed',
      code: 'LOGIN_ERROR' 
    });
  }
});

/**
 * @route POST /api/auth/refresh
 * @desc Refresh access token
 * @access Public
 */
router.post('/refresh', [
  body('refreshToken').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Refresh token required',
        code: 'REFRESH_TOKEN_REQUIRED' 
      });
    }
    
    const { refreshToken } = req.body;
    
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    
    // Get user
    const userResult = await executeQuery(
      'SELECT id, email, role, status FROM users WHERE id = ?',
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND' 
      });
    }
    
    const user = userResult.rows[0];
    
    // Check if user is still active
    if (user.status !== 'active') {
      return res.status(401).json({ 
        error: 'Account is not active',
        code: 'ACCOUNT_INACTIVE' 
      });
    }
    
    // Generate new tokens
    const newToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);
    
    res.json({
      message: 'Token refreshed successfully',
      tokens: {
        accessToken: newToken,
        refreshToken: newRefreshToken,
        expiresIn: '24h'
      }
    });
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Refresh token expired',
        code: 'REFRESH_TOKEN_EXPIRED' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN' 
      });
    }
    
    console.error('Token refresh error:', error);
    res.status(500).json({ 
      error: 'Token refresh failed',
      code: 'REFRESH_ERROR' 
    });
  }
});

/**
 * @route POST /api/auth/logout
 * @desc Logout user (invalidate token)
 * @access Private
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // In a more sophisticated setup, you would maintain a blacklist of tokens
    // For now, we just return success (client should remove token)
    
    res.json({
      message: 'Logged out successfully'
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      error: 'Logout failed',
      code: 'LOGOUT_ERROR' 
    });
  }
});

/**
 * @route GET /api/auth/me
 * @desc Get current user profile
 * @access Private
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Get full user data with teams
    const userResult = await executeQuery(`
      SELECT u.*, GROUP_CONCAT(t.name) as team_names, GROUP_CONCAT(t.id) as team_ids
      FROM users u
      LEFT JOIN team_members tm ON u.id = tm.user_id
      LEFT JOIN teams t ON tm.team_id = t.id
      WHERE u.id = ?
      GROUP BY u.id
    `, [req.user.id]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND' 
      });
    }
    
    const user = userResult.rows[0];
    
    // Get unread notifications count
    const notificationsResult = await executeQuery(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [user.id]
    );
    
    const unreadNotifications = notificationsResult.rows[0].count;
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name}`,
        role: user.role,
        status: user.status,
        avatarUrl: user.avatar_url,
        phone: user.phone,
        timezone: user.timezone,
        teams: user.team_names ? user.team_names.split(',') : [],
        teamIds: user.team_ids ? user.team_ids.split(',').map(Number) : [],
        unreadNotifications: unreadNotifications,
        lastLogin: user.last_login,
        createdAt: user.created_at
      }
    });
    
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      error: 'Failed to get profile',
      code: 'PROFILE_ERROR' 
    });
  }
});

/**
 * @route PUT /api/auth/profile
 * @desc Update user profile
 * @access Private
 */
router.put('/profile', authenticateToken, [
  body('firstName').optional().trim().isLength({ min: 1 }),
  body('lastName').optional().trim().isLength({ min: 1 }),
  body('phone').optional().isMobilePhone(),
  body('timezone').optional().trim().isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const { firstName, lastName, phone, timezone } = req.body;
    const userId = req.user.id;
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    
    if (firstName !== undefined) {
      updates.push('first_name = ?');
      values.push(firstName);
    }
    
    if (lastName !== undefined) {
      updates.push('last_name = ?');
      values.push(lastName);
    }
    
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone);
    }
    
    if (timezone !== undefined) {
      updates.push('timezone = ?');
      values.push(timezone);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ 
        error: 'No valid fields to update',
        code: 'NO_UPDATES' 
      });
    }
    
    // Add user ID for WHERE clause
    values.push(userId);
    
    // Update user profile
    await executeQuery(`
      UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, values);
    
    // Get updated user data
    const userResult = await executeQuery(
      'SELECT id, email, first_name, last_name, phone, timezone, updated_at FROM users WHERE id = ?',
      [userId]
    );
    
    const updatedUser = userResult.rows[0];
    
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        fullName: `${updatedUser.first_name} ${updatedUser.last_name}`,
        phone: updatedUser.phone,
        timezone: updatedUser.timezone,
        updatedAt: updatedUser.updated_at
      }
    });
    
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ 
      error: 'Failed to update profile',
      code: 'PROFILE_UPDATE_ERROR' 
    });
  }
});

/**
 * @route PUT /api/auth/change-password
 * @desc Change user password
 * @access Private
 */
router.put('/change-password', authenticateToken, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 }),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Passwords do not match');
    }
    return value;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }
    
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    
    // Get current user data
    const userResult = await executeQuery(
      'SELECT password_hash FROM users WHERE id = ?',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND' 
      });
    }
    
    const user = userResult.rows[0];
    
    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD' 
      });
    }
    
    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password
    await executeQuery(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newPasswordHash, userId]
    );
    
    res.json({
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ 
      error: 'Failed to change password',
      code: 'PASSWORD_CHANGE_ERROR' 
    });
  }
});

/**
 * @route POST /api/auth/forgot-password
 * @desc Request password reset
 * @access Public
 */
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Valid email required', 
        details: errors.array() 
      });
    }
    
    const { email } = req.body;
    
    // Check if user exists
    const userResult = await executeQuery(
      'SELECT id, first_name FROM users WHERE email = ? AND status = "active"',
      [email]
    );
    
    // Always return success for security (don't reveal if email exists)
    res.json({
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
    
    // Only send email if user actually exists
    if (userResult.rows.length > 0) {
      // TODO: Implement password reset email functionality
      // You would generate a secure token, store it in database with expiration
      // and send email with reset link
      console.log(`Password reset requested for: ${email}`);
    }
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      error: 'Password reset request failed',
      code: 'FORGOT_PASSWORD_ERROR' 
    });
  }
});

/**
 * @route POST /api/auth/verify-token
 * @desc Verify if token is valid
 * @access Private
 */
router.post('/verify-token', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      fullName: req.user.fullName
    }
  });
});

module.exports = router;