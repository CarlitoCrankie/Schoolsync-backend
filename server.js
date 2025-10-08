// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'SchoolSync API is running',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Import routes (matching your exact API file structure)
const authRoutes = require('./routes/auth');
const studentsRoutes = require('./routes/students');
const attendanceRoutes = require('./routes/attendance');
const schoolsRoutes = require('./routes/schools');
const schoolSettingsRoutes = require('./routes/school-settings');
const parentsRoutes = require('./routes/parents');
const analyticsRoutes = require('./routes/analytics');
const uploadRoutes = require('./routes/upload');
const syncAgentRoutes = require('./routes/sync-agent');
const syncStatusRoutes = require('./routes/sync-status');
const themeRoutes = require('./routes/theme');
const healthRoutes = require('./routes/health');
const maintenanceRoutes = require('./routes/maintenance');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/schools', schoolsRoutes);
app.use('/api/school-settings', schoolSettingsRoutes);
app.use('/api/parents', parentsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/sync-agent', syncAgentRoutes);
app.use('/api/sync-status', syncStatusRoutes);
app.use('/api/theme', themeRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/maintenance', maintenanceRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});