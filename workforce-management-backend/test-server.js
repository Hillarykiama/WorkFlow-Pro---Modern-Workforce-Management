const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json());

// Test route
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Test server is running',
        timestamp: new Date().toISOString()
    });
});

// Test database connection
app.get('/test-db', async (req, res) => {
    try {
        const db = require('./config/database');
        await db.testConnection();
        res.json({ success: true, message: 'Database connection successful' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test auth route loading
app.get('/test-auth', (req, res) => {
    try {
        const authRoutes = require('./routes/auth');
        res.json({ success: true, message: 'Auth routes loaded successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test tasks route loading
app.get('/test-tasks', (req, res) => {
    try {
        const taskRoutes = require('./routes/tasks');
        res.json({ success: true, message: 'Task routes loaded successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🧪 Test server running on port ${PORT}`);
    console.log(`Visit: http://localhost:${PORT}/health`);
    console.log(`Test DB: http://localhost:${PORT}/test-db`);
    console.log(`Test Auth: http://localhost:${PORT}/test-auth`);
    console.log(`Test Tasks: http://localhost:${PORT}/test-tasks`);
});

module.exports = app;