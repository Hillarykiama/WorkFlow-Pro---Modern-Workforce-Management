const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
require('dotenv').config();

const { initializeDatabase } = require('./config/database');
const { authenticateToken } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const teamRoutes = require('./routes/teams');
const scheduleRoutes = require('./routes/schedules');
const taskRoutes = require('./routes/tasks');
const chatRoutes = require('./routes/chat');
const notificationRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

// ================================
// MIDDLEWARE SETUP
// ================================

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Auth rate limiting (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.'
});
app.use('/api/auth', authLimiter);

// General middleware
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ================================
// ROUTES SETUP
// ================================

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/teams', authenticateToken, teamRoutes);
app.use('/api/schedules', authenticateToken, scheduleRoutes);
app.use('/api/tasks', authenticateToken, taskRoutes);
app.use('/api/chat', authenticateToken, chatRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use(errorHandler);

// ================================
// SOCKET.IO SETUP
// ================================

// Socket authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication error'));
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.userRole = decoded.role;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

// Socket connection handling
io.on('connection', (socket) => {
  console.log(`User ${socket.userId} connected`);
  
  // Join user to their personal room
  socket.join(`user_${socket.userId}`);
  
  // Handle joining channels
  socket.on('join_channel', (channelId) => {
    socket.join(`channel_${channelId}`);
    console.log(`User ${socket.userId} joined channel ${channelId}`);
  });
  
  // Handle leaving channels
  socket.on('leave_channel', (channelId) => {
    socket.leave(`channel_${channelId}`);
    console.log(`User ${socket.userId} left channel ${channelId}`);
  });
  
  // Handle new messages
  socket.on('send_message', async (data) => {
    try {
      // Save message to database
      const message = await saveMessage(data, socket.userId);
      
      // Broadcast to channel
      io.to(`channel_${data.channelId}`).emit('new_message', message);
    } catch (error) {
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  // Handle typing indicators
  socket.on('typing_start', (channelId) => {
    socket.to(`channel_${channelId}`).emit('user_typing', {
      userId: socket.userId,
      channelId
    });
  });
  
  socket.on('typing_stop', (channelId) => {
    socket.to(`channel_${channelId}`).emit('user_stop_typing', {
      userId: socket.userId,
      channelId
    });
  });
  
  // Handle task updates
  socket.on('task_update', (data) => {
    // Broadcast task updates to team members
    io.to(`team_${data.teamId}`).emit('task_updated', data);
  });
  
  // Handle schedule updates
  socket.on('schedule_update', (data) => {
    // Notify affected users
    data.affectedUsers.forEach(userId => {
      io.to(`user_${userId}`).emit('schedule_updated', data);
    });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User ${socket.userId} disconnected`);
  });
});

// ================================
// DATABASE INITIALIZATION
// ================================

async function saveMessage(data, userId) {
  const { db } = require('./config/database');
  
  const result = await db.execute({
    sql: `INSERT INTO messages (channel_id, user_id, content, message_type) 
          VALUES (?, ?, ?, ?) RETURNING id, created_at`,
    args: [data.channelId, userId, data.content, data.messageType || 'text']
  });
  
  return {
    id: result.rows[0].id,
    channelId: data.channelId,
    userId: userId,
    content: data.content,
    messageType: data.messageType || 'text',
    createdAt: result.rows[0].created_at
  };
}

// ================================
// SERVER STARTUP
// ================================

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('✅ Database initialized successfully');
    
    // Start server
    server.listen(PORT, () => {
      console.log(`🚀 WorkFlow Pro API Server running on port ${PORT}`);
      console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/health`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  server.close(() => {
    process.exit(1);
  });
});

// Start the server
startServer();

module.exports = { app, io };