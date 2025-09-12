// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const asyncHandler = require('../middleware/asyncHandler');
const {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  authenticateToken
} = require('../middleware/auth');

const router = express.Router();

/* ---------- Helpers ---------- */

async function saveRefreshToken({ token, userId, expiresAt }) {
  await executeQuery(
    `INSERT INTO refresh_tokens (token, user_id, expires_at, revoked, created_at)
     VALUES (?, ?, ?, 0, ?)`,
    [token, userId, expiresAt || null, new Date().toISOString()]
  );
}

async function revokeRefreshToken(token) {
  await executeQuery(
    `UPDATE refresh_tokens SET revoked = 1, revoked_at = ? WHERE token = ?`,
    [new Date().toISOString(), token]
  );
}

async function revokeAllRefreshTokensForUser(userId) {
  await executeQuery(
    `UPDATE refresh_tokens SET revoked = 1, revoked_at = ? WHERE user_id = ? AND revoked = 0`,
    [new Date().toISOString(), userId]
  );
}

async function isRefreshTokenValid(token) {
  const r = await executeQuery(`SELECT token, user_id, expires_at, revoked FROM refresh_tokens WHERE token = ?`, [token]);
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  if (row.revoked) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  return row;
}

/* ---------- Routes ---------- */

// Register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('firstName').trim().isLength({ min: 1 }),
    body('lastName').trim().isLength({ min: 1 }),
    body('role').optional().isIn(['admin', 'manager', 'employee'])
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    const { email, password, firstName, lastName, role = 'employee', phone } = req.body;

    const existing = await executeQuery('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already registered', code: 'EMAIL_EXISTS' });

    const passwordHash = await bcrypt.hash(password, 12);

    const insertRes = await executeQuery(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, phone, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, passwordHash, firstName, lastName, role, phone || null, 'active', new Date().toISOString(), new Date().toISOString()]
    );

    const userId = insertRes.lastInsertRowid;

    const userResult = await executeQuery('SELECT id, email, first_name, last_name, role, status, created_at FROM users WHERE id = ?', [userId]);
    const newUser = userResult.rows[0];

    const accessToken = generateToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    // persist refresh token (30 days default)
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await saveRefreshToken({ token: refreshToken, userId: newUser.id, expiresAt: refreshExpiresAt });

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
      tokens: { accessToken, refreshToken, expiresIn: '24h' }
    });
  })
);

// Login
router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errors.array() });

    const { email, password } = req.body;

    const userResult = await executeQuery('SELECT * FROM users WHERE email = ?', [email]);
    if (userResult.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });

    const user = userResult.rows[0];
    if (user.status !== 'active') return res.status(401).json({ error: 'Account is not active', code: 'ACCOUNT_INACTIVE' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });

    await executeQuery('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await saveRefreshToken({ token: refreshToken, userId: user.id, expiresAt: refreshExpiresAt });

    // fetch teams optionally
    const teamsResult = await executeQuery(
      `SELECT t.id, t.name FROM teams t JOIN team_members tm ON t.id = tm.team_id WHERE tm.user_id = ?`,
      [user.id]
    );

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
        teams: teamsResult.rows || [],
        lastLogin: user.last_login
      },
      tokens: { accessToken, refreshToken, expiresIn: '24h' }
    });
  })
);

// Refresh
router.post(
  '/refresh',
  [body('refreshToken').notEmpty()],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Refresh token required', code: 'REFRESH_TOKEN_REQUIRED' });

    const { refreshToken } = req.body;

    const decoded = verifyRefreshToken(refreshToken); // will throw on invalid/expired
    if (!decoded || !decoded.userId) return res.status(401).json({ error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' });

    const tokenRow = await isRefreshTokenValid(refreshToken);
    if (!tokenRow) return res.status(401).json({ error: 'Refresh token revoked or expired', code: 'REFRESH_TOKEN_INVALID' });

    const userResult = await executeQuery('SELECT id, email, role, status FROM users WHERE id = ?', [decoded.userId]);
    if (userResult.rows.length === 0) return res.status(401).json({ error: 'User not found', code: 'USER_NOT_FOUND' });

    const user = userResult.rows[0];
    if (user.status !== 'active') return res.status(401).json({ error: 'Account is not active', code: 'ACCOUNT_INACTIVE' });

    const newAccessToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);
    const newRefreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await revokeRefreshToken(refreshToken);
    await saveRefreshToken({ token: newRefreshToken, userId: user.id, expiresAt: newRefreshExpiresAt });

    res.json({
      message: 'Token refreshed successfully',
      tokens: { accessToken: newAccessToken, refreshToken: newRefreshToken, expiresIn: '24h' }
    });
  })
);

// Logout (revoke refresh token or all tokens)
router.post(
  '/logout',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const userId = req.user.id;

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    } else {
      // revoke all tokens for the user
      await revokeAllRefreshTokensForUser(userId);
    }

    res.json({ message: 'Logged out successfully' });
  })
);

// Logout by token only (without access token)
router.post(
  '/logout-token',
  [body('refreshToken').notEmpty()],
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    await revokeRefreshToken(refreshToken);
    res.json({ message: 'Refresh token revoked' });
  })
);

// Keep /me, /profile, change-password etc. (use your existing implementations)
// Example: simple /me
router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  const userResult = await executeQuery(`
    SELECT u.*, GROUP_CONCAT(t.name) as team_names, GROUP_CONCAT(t.id) as team_ids
    FROM users u
    LEFT JOIN team_members tm ON u.id = tm.user_id
    LEFT JOIN teams t ON tm.team_id = t.id
    WHERE u.id = ?
    GROUP BY u.id
  `, [req.user.id]);

  if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
  const user = userResult.rows[0];
  const notificationsResult = await executeQuery('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE', [user.id]);
  const unreadNotifications = notificationsResult.rows[0] ? notificationsResult.rows[0].count : 0;

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
      unreadNotifications,
      lastLogin: user.last_login,
      createdAt: user.created_at
    }
  });
}));

module.exports = router;
