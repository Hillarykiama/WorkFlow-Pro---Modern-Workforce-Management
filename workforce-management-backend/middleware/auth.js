const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/database');

/**
 * Middleware to authenticate JWT tokens
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Access token required',
      code: 'TOKEN_REQUIRED' 
    });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get fresh user data from database
    const userResult = await executeQuery(
      'SELECT id, email, role, status, first_name, last_name FROM users WHERE id = ?',
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND' 
      });
    }
    
    const user = userResult.rows[0];
    
    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({ 
        error: 'Account is not active',
        code: 'ACCOUNT_INACTIVE' 
      });
    }
    
    // Add user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      fullName: `${user.first_name} ${user.last_name}`
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        code: 'TOKEN_INVALID' 
      });
    }
    
    console.error('Authentication error:', error);
    return res.status(500).json({ 
      error: 'Authentication failed',
      code: 'AUTH_ERROR' 
    });
  }
}

/**
 * Middleware to check if user has required role(s)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED' 
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: roles,
        current: req.user.role
      });
    }
    
    next();
  };
}

/**
 * Middleware to check if user is admin or manager
 */
const requireManager = requireRole('admin', 'manager');

/**
 * Middleware to check if user is admin only
 */
const requireAdmin = requireRole('admin');

/**
 * Middleware to check if user can access team resources
 */
async function requireTeamAccess(req, res, next) {
  try {
    const teamId = req.params.teamId || req.body.teamId;
    
    if (!teamId) {
      return res.status(400).json({ 
        error: 'Team ID required',
        code: 'TEAM_ID_REQUIRED' 
      });
    }
    
    // Admins have access to all teams
    if (req.user.role === 'admin') {
      return next();
    }
    
    // Check if user is member of the team
    const memberResult = await executeQuery(
      'SELECT id FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, req.user.id]
    );
    
    if (memberResult.rows.length === 0) {
      // Check if user is manager of the team
      const managerResult = await executeQuery(
        'SELECT id FROM teams WHERE id = ? AND manager_id = ?',
        [teamId, req.user.id]
      );
      
      if (managerResult.rows.length === 0) {
        return res.status(403).json({ 
          error: 'Access denied to team',
          code: 'TEAM_ACCESS_DENIED' 
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('Team access check error:', error);
    return res.status(500).json({ 
      error: 'Failed to verify team access',
      code: 'TEAM_ACCESS_ERROR' 
    });
  }
}

/**
 * Middleware to check if user can access task/board resources
 */
async function requireBoardAccess(req, res, next) {
  try {
    const boardId = req.params.boardId || req.body.boardId;
    
    if (!boardId) {
      return res.status(400).json({ 
        error: 'Board ID required',
        code: 'BOARD_ID_REQUIRED' 
      });
    }
    
    // Get board's team
    const boardResult = await executeQuery(
      'SELECT team_id FROM boards WHERE id = ?',
      [boardId]
    );
    
    if (boardResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Board not found',
        code: 'BOARD_NOT_FOUND' 
      });
    }
    
    const teamId = boardResult.rows[0].team_id;
    
    // Admins have access to all boards
    if (req.user.role === 'admin') {
      return next();
    }
    
    // Check team access
    const memberResult = await executeQuery(
      'SELECT id FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, req.user.id]
    );
    
    if (memberResult.rows.length === 0) {
      // Check if user is team manager
      const managerResult = await executeQuery(
        'SELECT id FROM teams WHERE id = ? AND manager_id = ?',
        [teamId, req.user.id]
      );
      
      if (managerResult.rows.length === 0) {
        return res.status(403).json({ 
          error: 'Access denied to board',
          code: 'BOARD_ACCESS_DENIED' 
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('Board access check error:', error);
    return res.status(500).json({ 
      error: 'Failed to verify board access',
      code: 'BOARD_ACCESS_ERROR' 
    });
  }
}

/**
 * Generate JWT token for user
 */
function generateToken(user, expiresIn = '24h') {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, { 
    expiresIn,
    issuer: 'workflow-pro',
    audience: 'workflow-pro-client'
  });
}

/**
 * Generate refresh token
 */
function generateRefreshToken(user) {
  const payload = {
    userId: user.id,
    type: 'refresh'
  };
  
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { 
    expiresIn: '7d',
    issuer: 'workflow-pro',
    audience: 'workflow-pro-client'
  });
}

/**
 * Verify refresh token
 */
function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (error) {
    throw error;
  }
}

/**
 * Middleware to log user activity
 */
async function logActivity(req, res, next) {
  // Store original send function
  const originalSend = res.send;
  
  // Override send function to log after response
  res.send = function(data) {
    // Log activity (you can implement activity logging here)
    if (req.user && res.statusCode < 400) {
      // Example: log to database or external service
      console.log(`Activity: ${req.user.email} ${req.method} ${req.originalUrl} - ${res.statusCode}`);
    }
    
    // Call original send function
    return originalSend.call(this, data);
  };
  
  next();
}

module.exports = {
  authenticateToken,
  requireRole,
  requireManager,
  requireAdmin,
  requireTeamAccess,
  requireBoardAccess,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  logActivity
};