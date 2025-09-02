const fs = require('fs').promises;
const path = require('path');

/**
 * Custom error classes
 */
class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class AuthError extends AppError {
  constructor(message, code = 'AUTH_ERROR') {
    super(message, 401, code);
  }
}

class ForbiddenError extends AppError {
  constructor(message, code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

class NotFoundError extends AppError {
  constructor(message, code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

class ConflictError extends AppError {
  constructor(message, code = 'CONFLICT') {
    super(message, 409, code);
  }
}

class DatabaseError extends AppError {
  constructor(message, originalError = null) {
    super(message, 500, 'DATABASE_ERROR');
    this.originalError = originalError;
  }
}

/**
 * Log error to file and console
 */
async function logError(error, req = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    error: {
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      statusCode: error.statusCode || 500,
      stack: error.stack
    }
  };
  
  // Add request information if available
  if (req) {
    logEntry.request = {
      method: req.method,
      url: req.originalUrl,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: req.user?.id || null,
      body: req.method === 'POST' ? req.body : undefined
    };
    
    // Remove sensitive data
    if (logEntry.request.body) {
      const sensitiveFields = ['password', 'currentPassword', 'newPassword', 'token', 'refreshToken'];
      sensitiveFields.forEach(field => {
        if (logEntry.request.body[field]) {
          logEntry.request.body[field] = '[REDACTED]';
        }
      });
    }
  }
  
  // Console log
  console.error('Application Error:', JSON.stringify(logEntry, null, 2));
  
  // File log (in production)
  if (process.env.NODE_ENV === 'production') {
    try {
      const logsDir = path.join(__dirname, '..', 'logs');
      
      // Ensure logs directory exists
      try {
        await fs.access(logsDir);
      } catch {
        await fs.mkdir(logsDir, { recursive: true });
      }
      
      const logFile = path.join(logsDir, `error-${new Date().toISOString().split('T')[0]}.log`);
      const logLine = JSON.stringify(logEntry) + '\n';
      
      await fs.appendFile(logFile, logLine);
    } catch (fileError) {
      console.error('Failed to write error log to file:', fileError);
    }
  }
}

/**
 * Send error response based on environment
 */
function sendErrorResponse(res, error, req) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Default error structure
  const errorResponse = {
    error: error.message,
    code: error.code || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  };
  
  // Add details for validation errors
  if (error instanceof ValidationError && error.details) {
    errorResponse.details = error.details;
  }
  
  // Add stack trace in development
  if (isDevelopment) {
    errorResponse.stack = error.stack;
    
    if (req) {
      errorResponse.request = {
        method: req.method,
        url: req.originalUrl,
        headers: req.headers
      };
    }
  }
  
  // Add request ID if available
  if (req?.requestId) {
    errorResponse.requestId = req.requestId;
  }
  
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json(errorResponse);
}

/**
 * Main error handling middleware
 */
async function errorHandler(err, req, res, next) {
  // Don't handle if response already sent
  if (res.headersSent) {
    return next(err);
  }
  
  let error = err;
  
  // Convert known error types
  if (err.name === 'ValidationError') {
    error = new ValidationError('Validation failed', err.errors);
  } else if (err.name === 'CastError') {
    error = new AppError('Invalid ID format', 400, 'INVALID_ID');
  } else if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    error = new ConflictError('Resource already exists', 'DUPLICATE_RESOURCE');
  } else if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    error = new AppError('Referenced resource not found', 400, 'FOREIGN_KEY_CONSTRAINT');
  } else if (err.name === 'JsonWebTokenError') {
    error = new AuthError('Invalid token', 'INVALID_TOKEN');
  } else if (err.name === 'TokenExpiredError') {
    error = new AuthError('Token expired', 'TOKEN_EXPIRED');
  } else if (err.type === 'entity.too.large') {
    error = new AppError('Request entity too large', 413, 'PAYLOAD_TOO_LARGE');
  }
  
  // Ensure error has proper structure
  if (!error.isOperational) {
    error = new AppError(
      process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
      500,
      'INTERNAL_ERROR'
    );
  }
  
  // Log the error
  await logError(error, req);
  
  // Send response
  sendErrorResponse(res, error, req);
}

/**
 * Handle async errors in routes
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 handler for unknown routes
 */
function notFoundHandler(req, res, next) {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
}

/**
 * Validation error helper
 */
function createValidationError(message, field = null, value = null) {
  const details = [];
  if (field) {
    details.push({
      field,
      message,
      value
    });
  }
  return new ValidationError(message, details);
}

/**
 * Database error helper
 */
function handleDatabaseError(error, operation = 'database operation') {
  console.error(`Database error during ${operation}:`, error);
  
  // Check for specific SQLite errors
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return new ConflictError('Resource already exists');
  }
  
  if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return new AppError('Referenced resource not found', 400);
  }
  
  if (error.message?.includes('no such table')) {
    return new DatabaseError('Database schema not initialized');
  }
  
  if (error.message?.includes('database is locked')) {
    return new DatabaseError('Database is temporarily unavailable');
  }
  
  // Generic database error
  return new DatabaseError(`Failed to ${operation}`, error);
}

/**
 * Rate limit error handler
 */
function rateLimitHandler(req, res) {
  const error = new AppError('Too many requests, please try again later', 429, 'RATE_LIMIT_EXCEEDED');
  sendErrorResponse(res, error, req);
}

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown(server) {
  const gracefulShutdown = (signal) => {
    console.log(`Received ${signal}. Starting graceful shutdown...`);
    
    server.close((err) => {
      if (err) {
        console.error('Error during server shutdown:', err);
        process.exit(1);
      }
      
      console.log('Server closed successfully');
      process.exit(0);
    });
    
    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 30000);
  };
  
  // Listen for termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    gracefulShutdown('uncaughtException');
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    gracefulShutdown('unhandledRejection');
  });
}

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  
  // Middleware
  errorHandler,
  asyncHandler,
  notFoundHandler,
  rateLimitHandler,
  
  // Helpers
  createValidationError,
  handleDatabaseError,
  logError,
  setupGracefulShutdown
};