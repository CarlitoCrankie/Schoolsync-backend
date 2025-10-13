// server.js - FIXED VERSION
const express = require('express');
const cors = require('cors');
require('dotenv').config();

console.log('🚀 Starting SchoolSync Backend...');
console.log('📍 Node Version:', process.version);
console.log('📍 Environment:', process.env.NODE_ENV || 'development');
console.log('📍 Port:', process.env.PORT || 3001);

const app = express();
const PORT = process.env.PORT || 3001;

// NEW - Simple and reliable CORS for development
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  'https://diamondattendance.com',
  'http://diamondattendance.com'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(null, true); // TEMPORARY: Allow all origins for debugging
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health checks (NO DATABASE NEEDED)
app.get('/', (req, res) => {
  res.json({
    message: 'SchoolSync API is running',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Import routes with error handling
console.log('📂 Loading routes...');

try {
  // Import ALL routes (matching your exact API file structure)
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
  const debugRoutes = require('./routes/debug');

  console.log('✅ All routes loaded successfully');

  // Mount ALL routes
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
  app.use('/api/debug', debugRoutes);

  console.log('✅ All routes mounted successfully');

} catch (error) {
  console.error('❌ CRITICAL ERROR loading routes:', error.message);
  console.error('Stack:', error.stack);
  // Don't exit - let health check still work for debugging
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method,
    available_routes: [
      '/api/auth',
      '/api/students',
      '/api/attendance',
      '/api/schools',
      '/api/school-settings',
      '/api/analytics',
      '/api/sync-agent',
      '/api/sync-status'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('╔════════════════════════════════════════╗');
  console.log(`║  🚀 SchoolSync Backend is running!    ║`);
  console.log(`║  📍 Port: ${PORT}                         ║`);
  console.log(`║  🌍 Host: 0.0.0.0                      ║`);
  console.log(`║  📊 Environment: ${(process.env.NODE_ENV || 'development').padEnd(19)}║`);
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log('📍 Available endpoints:');
  console.log('   GET  / or /health        - Health check');
  console.log('   POST /api/auth           - Authentication');
  console.log('   GET  /api/students       - Students');
  console.log('   GET  /api/schools        - Schools');
  console.log('   GET  /api/analytics      - Analytics');
  console.log('');
}).on('error', (err) => {
  console.error('❌ Failed to start server:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try a different port.`);
  }
  process.exit(1);
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  shutdown('UNHANDLED_REJECTION');
});