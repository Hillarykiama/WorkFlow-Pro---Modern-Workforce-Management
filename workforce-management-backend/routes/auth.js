const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/database');
const {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken
} = require('../middleware/auth');

const router = express.Router();

/**
 * REGISTER new user
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, role = 'user' } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if email already exists
    const existing = await executeQuery(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 12);

    // Insert user
    const result = await executeQuery(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, status)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id, email, role, first_name, last_name`,
      [email, hashed, firstName, lastName, role, 'active']
    );

    const user = result.rows[0];

    // Generate tokens
    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    res.status(201).json({
      user,
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to register' });
  }
});

/**
 * LOGIN existing user
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Get user
    const result = await executeQuery(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Compare password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    // Generate tokens
    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

/**
 * REFRESH TOKEN
 */
router.post('/refresh', (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = verifyRefreshToken(token);

    const newAccessToken = jwt.sign(
      {
        userId: decoded.userId,
        type: 'access'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({ accessToken: newAccessToken });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

/**
 * LOGOUT (optional, just client-side delete)
 */
router.post('/logout', (req, res) => {
  // If storing refresh tokens in DB, delete it here.
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;

