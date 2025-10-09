// routes/health.js - Enhanced health check with database connection pool monitoring
const express = require('express');
const router = express.Router();
const { getPool, validateConnection, executeQuery, monitorConnectionHealth, cleanupIdleConnections, sql } = require('../lib/database');

// CORS middleware
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// ✅ Helper function to get pool status without calling non-existent function
function getPoolStatus(pool = null) {
  if (!pool) {
    return {
      connected: false,
      connecting: false,
      healthy: false,
      available: 0,
      pending: 0,
      size: 0
    };
  }
  
  return {
    connected: pool.connected || false,
    connecting: pool.connecting || false,
    healthy: pool.connected && !pool.connecting,
    available: pool.available || 0,
    pending: pool.waitingCount || 0,
    size: pool.size || 0,
    poolConfig: {
      max: pool.config?.pool?.max || 10,
      min: pool.config?.pool?.min || 0
    }
  };
}

// Database-specific health check
router.get('/database', async (req, res) => {
  const startTime = Date.now();
  let pool = null;
  
  try {
    // Get pool
    pool = await getPool();
    
    // ✅ Get pool status using helper function
    const poolStatus = getPoolStatus(pool);
    
    // Test query execution
    const testResult = await executeQuery(
      'SELECT GETDATE() as current_time, @@VERSION as version',
      {},
      10000
    );
    
    // Get connection statistics from database
    const connectionStats = await executeQuery(`
      SELECT 
        COUNT(*) as total_user_connections,
        SUM(CASE WHEN program_name LIKE '%node%' THEN 1 ELSE 0 END) as node_connections,
        SUM(CASE 
          WHEN last_request_end_time < DATEADD(MINUTE, -5, GETDATE()) 
          THEN 1 ELSE 0 END) as idle_5min_connections,
        SUM(CASE 
          WHEN last_request_end_time < DATEADD(MINUTE, -15, GETDATE()) 
          THEN 1 ELSE 0 END) as idle_15min_connections,
        SUM(CASE 
          WHEN last_request_end_time < DATEADD(MINUTE, -30, GETDATE()) 
          THEN 1 ELSE 0 END) as idle_30min_connections,
        MAX(last_request_end_time) as last_activity
      FROM sys.dm_exec_sessions 
      WHERE is_user_process = 1
    `, {}, 15000);
    
    const responseTime = Date.now() - startTime;
    const stats = connectionStats.recordset[0];
    const testData = testResult.recordset[0];
    
    // Calculate health score
    let healthScore = 100;
    if (responseTime > 5000) healthScore -= 15;
    if (poolStatus.available === 0) healthScore -= 25;
    if (stats.idle_15min_connections > 3) healthScore -= 20;
    if (stats.idle_30min_connections > 1) healthScore -= 30;
    if (poolStatus.pending > 3) healthScore -= 15;
    
    const isHealthy = healthScore >= 70;
    
    res.status(isHealthy ? 200 : 503).json({
      success: true,
      healthy: isHealthy,
      health_score: Math.max(0, healthScore),
      
      pool_status: poolStatus,
      
      database_connections: {
        total_user_connections: stats.total_user_connections,
        node_connections: stats.node_connections,
        idle_5min: stats.idle_5min_connections,
        idle_15min: stats.idle_15min_connections,
        idle_30min: stats.idle_30min_connections,
        last_activity: stats.last_activity
      },
      
      performance: {
        response_time_ms: responseTime,
        query_success: true,
        database_time: testData.current_time
      },
      
      alerts: generateHealthAlerts(poolStatus, stats, responseTime),
      recommendations: generateDatabaseRecommendations(poolStatus, stats, responseTime),
      
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(503).json({
      success: false,
      healthy: false,
      health_score: 0,
      error: error.message,
      pool_status: getPoolStatus(pool),  // ✅ Use helper function
      timestamp: new Date().toISOString()
    });
  }
});

// Database cleanup endpoint
router.post('/cleanup', async (req, res) => {
  const { auth_key } = req.body;
  
  // Simple auth check for cleanup operations
  if (auth_key !== process.env.MAINTENANCE_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    console.log('Manual cleanup initiated via API');
    await cleanupIdleConnections();
    
    // Get updated stats
    const healthResult = await monitorConnectionHealth();
    
    res.json({
      success: true,
      message: 'Cleanup completed successfully',
      health_check_passed: healthResult,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Manual cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Database monitoring endpoint
router.get('/monitor', async (req, res) => {
  try {
    // Run comprehensive monitoring
    const healthResult = await monitorConnectionHealth();
    
    // Get detailed connection info
    const detailedStats = await executeQuery(`
      SELECT 
        session_id,
        login_name,
        program_name,
        client_interface_name,
        login_time,
        last_request_start_time,
        last_request_end_time,
        DATEDIFF(MINUTE, last_request_end_time, GETDATE()) as idle_minutes,
        status,
        cpu_time,
        memory_usage,
        total_scheduled_time
      FROM sys.dm_exec_sessions 
      WHERE is_user_process = 1 
        AND program_name LIKE '%node%'
      ORDER BY last_request_end_time ASC
    `, {}, 20000);
    
    res.json({
      success: true,
      health_check_passed: healthResult,
      active_sessions: detailedStats.recordset.map(session => ({
        session_id: session.session_id,
        login_name: session.login_name,
        program_name: session.program_name,
        login_time: session.login_time,
        last_activity: session.last_request_end_time,
        idle_minutes: session.idle_minutes,
        status: session.status,
        cpu_time: session.cpu_time,
        memory_usage: session.memory_usage
      })),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Database monitoring failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Default comprehensive health check
router.get('/', async (req, res) => {
  const startTime = Date.now();
  let pool = null;

  try {
    // Test database connection with retry logic
    let connectionAttempts = 0;
    const maxAttempts = 3;
    
    while (connectionAttempts < maxAttempts) {
      try {
        pool = await getPool();
        break;
      } catch (error) {
        connectionAttempts++;
        console.log(`Health check connection attempt ${connectionAttempts} failed:`, error.message);
        
        if (connectionAttempts >= maxAttempts) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * connectionAttempts));
      }
    }
    
    // Get pool status after successful connection
    const poolStatus = getPoolStatus(pool);  // ✅ Use helper function
    
    // Run comprehensive health checks with timeout
    const healthChecks = await Promise.allSettled([
      // Basic connectivity test with timeout
      Promise.race([
        executeQuery('SELECT GETDATE() as CurrentTime', {}, 10000),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 10000))
      ]),
      
      // Database version check
      Promise.race([
        executeQuery('SELECT @@VERSION as SqlVersion', {}, 5000),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Version query timeout')), 5000))
      ]),
      
      // Pool validation
      validateConnection(pool),
      
      // Check recent activity
      Promise.race([
        executeQuery(`
          SELECT TOP 1 CreatedAt as LastActivity
          FROM Attendance 
          ORDER BY CreatedAt DESC
        `, {}, 5000),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Activity query timeout')), 5000))
      ]),
      
      // Get connection statistics
      executeQuery(`
        SELECT 
          COUNT(*) as total_user_connections,
          SUM(CASE WHEN program_name LIKE '%node%' THEN 1 ELSE 0 END) as node_connections,
          SUM(CASE 
            WHEN last_request_end_time < DATEADD(MINUTE, -15, GETDATE()) 
            THEN 1 ELSE 0 END) as idle_15min_connections,
          SUM(CASE 
            WHEN last_request_end_time < DATEADD(MINUTE, -30, GETDATE()) 
            THEN 1 ELSE 0 END) as idle_30min_connections
        FROM sys.dm_exec_sessions 
        WHERE is_user_process = 1
      `, {}, 15000)
    ]);
    
    const responseTime = Date.now() - startTime;
    
    // Process results
    const basicCheck = healthChecks[0];
    const versionCheck = healthChecks[1];
    const poolValidation = healthChecks[2];
    const activityCheck = healthChecks[3];
    const connectionStatsCheck = healthChecks[4];
    
    const basicInfo = basicCheck.status === 'fulfilled' ? basicCheck.value.recordset[0] : null;
    const versionInfo = versionCheck.status === 'fulfilled' ? versionCheck.value.recordset[0] : null;
    const isPoolValid = poolValidation.status === 'fulfilled' ? poolValidation.value : false;
    const lastActivity = activityCheck.status === 'fulfilled' ? activityCheck.value.recordset[0] : null;
    const connectionStats = connectionStatsCheck.status === 'fulfilled' ? connectionStatsCheck.value.recordset[0] : null;
    
    // Enhanced environment check
    const envCheck = {
      RDS_SERVER: !!process.env.RDS_SERVER,
      RDS_DB: !!process.env.RDS_DB,
      RDS_USER: !!process.env.RDS_USER,
      RDS_PASSWORD: !!process.env.RDS_PASSWORD,
      JWT_SECRET_KEY: !!process.env.JWT_SECRET_KEY,
      MAINTENANCE_KEY: !!process.env.MAINTENANCE_KEY
    };
    
    const allEnvVarsSet = Object.values(envCheck).every(Boolean);
    
    // Calculate health score
    let healthScore = 100;
    if (!basicInfo) healthScore -= 30;
    if (!isPoolValid) healthScore -= 20;
    if (responseTime > 5000) healthScore -= 15;
    if (!allEnvVarsSet) healthScore -= 10;
    if (poolStatus.available === 0) healthScore -= 15;
    if (connectionStats && connectionStats.idle_30min_connections > 0) healthScore -= 20;
    
    const isHealthy = healthScore >= 70 && basicInfo && isPoolValid;
    
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      health_score: Math.max(0, healthScore),
      timestamp: basicInfo?.CurrentTime || new Date().toISOString(),
      
      database: {
        status: basicInfo ? 'connected' : 'failed',
        server: process.env.RDS_SERVER,
        database: process.env.RDS_DB,
        version: versionInfo?.SqlVersion?.split('\n')[0] || 'unknown',
        last_activity: lastActivity?.LastActivity || null,
        connection_attempts: connectionAttempts
      },
      
      connection_pool: {
        ...poolStatus,
        validation_passed: isPoolValid,
        health_status: poolStatus.available > 0 ? 'healthy' : 'warning'
      },
      
      database_connections: connectionStats ? {
        total_user_connections: connectionStats.total_user_connections,
        node_connections: connectionStats.node_connections,
        idle_15min: connectionStats.idle_15min_connections,
        idle_30min: connectionStats.idle_30min_connections
      } : null,
      
      performance: {
        response_time_ms: responseTime,
        query_timeouts: healthChecks.filter(check => 
          check.status === 'rejected' && check.reason?.message?.includes('timeout')
        ).length,
        failed_checks: healthChecks.filter(check => check.status === 'rejected').length
      },
      
      environment: {
        node_env: process.env.NODE_ENV || 'development',
        all_env_vars_set: allEnvVarsSet,
        missing_vars: Object.entries(envCheck)
          .filter(([key, value]) => !value)
          .map(([key]) => key)
      },
      
      alerts: generateHealthAlerts(poolStatus, connectionStats, responseTime),
      recommendations: generateRecommendations(healthScore, poolStatus, connectionStats, responseTime, healthChecks),
      
      detailed_errors: healthChecks
        .filter(check => check.status === 'rejected')
        .map((check, index) => ({
          check_index: index,
          error: check.reason?.message || 'Unknown error'
        }))
    });
    
  } catch (error) {
    console.error('Health check failed:', error);
    
    const responseTime = Date.now() - startTime;
    const poolStatus = getPoolStatus(pool);  // ✅ Use helper function
    
    res.status(503).json({
      status: 'critical',
      health_score: 0,
      timestamp: new Date().toISOString(),
      
      database: {
        status: 'failed',
        server: process.env.RDS_SERVER || 'not_configured',
        database: process.env.RDS_DB || 'not_configured'
      },
      
      connection_pool: {
        ...poolStatus,
        error: 'Failed to establish connection'
      },
      
      error: {
        message: error.message,
        code: error.code,
        type: error.constructor.name
      },
      
      performance: {
        response_time_ms: responseTime
      },
      
      troubleshooting: {
        check_environment_variables: !process.env.RDS_SERVER || !process.env.RDS_DB,
        check_network_connectivity: error.code === 'ESOCKET' || error.code === 'EBUSY',
        check_credentials: error.message.includes('login') || error.message.includes('authentication'),
        check_database_exists: error.message.includes('database') && error.message.includes('not exist'),
        restart_recommended: true
      }
    });
  }
});

// Helper functions
function generateHealthAlerts(poolStatus, stats, responseTime) {
  const alerts = [];
  
  if (!poolStatus.connected) {
    alerts.push({ level: 'critical', message: 'Database pool not connected' });
  }
  
  if (poolStatus.available === 0) {
    alerts.push({ level: 'critical', message: 'No available connections in pool' });
  }
  
  if (stats && stats.idle_30min_connections > 0) {
    alerts.push({ 
      level: 'warning', 
      message: `${stats.idle_30min_connections} connections idle for 30+ minutes` 
    });
  }
  
  if (stats && stats.idle_15min_connections > 5) {
    alerts.push({ 
      level: 'warning', 
      message: `${stats.idle_15min_connections} connections idle for 15+ minutes` 
    });
  }
  
  if (responseTime > 10000) {
    alerts.push({ level: 'warning', message: `High response time: ${responseTime}ms` });
  }
  
  if (poolStatus.pending > 5) {
    alerts.push({ level: 'warning', message: `High pending connections: ${poolStatus.pending}` });
  }
  
  return alerts;
}

function generateRecommendations(healthScore, poolStatus, stats, responseTime, healthChecks) {
  const recommendations = [];
  
  if (healthScore < 70) {
    recommendations.push('System health is below optimal level');
  }
  
  if (!poolStatus.connected) {
    recommendations.push('Database connection pool is not connected - restart required');
  }
  
  if (poolStatus.available === 0) {
    recommendations.push('No available connections in pool - consider increasing pool size');
  }
  
  if (responseTime > 5000) {
    recommendations.push('High response time detected - check database performance');
  }
  
  if (poolStatus.pending > 5) {
    recommendations.push('High number of pending connections - may indicate connection bottleneck');
  }
  
  if (stats && stats.idle_30min_connections > 0) {
    recommendations.push('Run connection cleanup to kill very old idle connections');
  }
  
  const timeouts = healthChecks ? healthChecks.filter(check => 
    check.status === 'rejected' && check.reason?.message?.includes('timeout')
  ).length : 0;
  
  if (timeouts > 0) {
    recommendations.push(`${timeouts} query timeouts detected - database may be overloaded`);
  }
  
  if (recommendations.length === 0) {
    recommendations.push('System is operating within normal parameters');
  }
  
  return recommendations;
}

function generateDatabaseRecommendations(poolStatus, stats, responseTime) {
  const recommendations = [];
  
  if (stats.idle_30min_connections > 0) {
    recommendations.push('Run connection cleanup to kill very old idle connections');
  }
  
  if (poolStatus.available === 0) {
    recommendations.push('Consider increasing pool size or investigating connection leaks');
  }
  
  if (responseTime > 5000) {
    recommendations.push('Database may be under heavy load - check for slow queries');
  }
  
  if (stats.node_connections > poolStatus.poolConfig?.max * 1.5) {
    recommendations.push('More database connections than expected - check for connection leaks');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Database health is optimal');
  }
  
  return recommendations;
}

module.exports = router;