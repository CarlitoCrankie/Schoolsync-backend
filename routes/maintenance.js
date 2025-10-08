// require('dotenv').config()

// // scripts/database-maintenance.js - CRITICAL: Database maintenance and monitoring script
// const { executeQuery, getPoolStatus, monitorConnectionHealth, cleanupIdleConnections } = require('../../lib/database')

// const MAINTENANCE_KEY = process.env.MAINTENANCE_KEY

// async function runHealthCheck() {
//   console.log('\n=== DATABASE HEALTH CHECK ===')
  
//   try {
//     const poolStatus = getPoolStatus()
//     console.log('Pool Status:', JSON.stringify(poolStatus, null, 2))
    
//     const healthResult = await monitorConnectionHealth()
//     console.log('Health Check Result:', healthResult ? 'PASSED' : 'FAILED')
    
//     // Get detailed connection statistics
//     const stats = await executeQuery(`
//       SELECT 
//         COUNT(*) as total_connections,
//         SUM(CASE WHEN program_name LIKE '%node%' THEN 1 ELSE 0 END) as node_connections,
//         SUM(CASE WHEN last_request_end_time < DATEADD(MINUTE, -5, GETDATE()) THEN 1 ELSE 0 END) as idle_5min,
//         SUM(CASE WHEN last_request_end_time < DATEADD(MINUTE, -15, GETDATE()) THEN 1 ELSE 0 END) as idle_15min,
//         SUM(CASE WHEN last_request_end_time < DATEADD(MINUTE, -30, GETDATE()) THEN 1 ELSE 0 END) as idle_30min,
//         MAX(last_request_end_time) as last_activity
//       FROM sys.dm_exec_sessions 
//       WHERE is_user_process = 1
//     `, {}, 15000)
    
//     console.log('Connection Statistics:', JSON.stringify(stats.recordset[0], null, 2))
    
//     return healthResult
    
//   } catch (error) {
//     console.error('Health check failed:', error.message)
//     return false
//   }
// }

// async function runConnectionCleanup() {
//   console.log('\n=== CONNECTION CLEANUP ===')
  
//   try {
//     // Show connections before cleanup
//     const beforeStats = await executeQuery(`
//       SELECT 
//         session_id,
//         login_name,
//         program_name,
//         last_request_end_time,
//         DATEDIFF(MINUTE, last_request_end_time, GETDATE()) as idle_minutes,
//         status
//       FROM sys.dm_exec_sessions 
//       WHERE is_user_process = 1 
//         AND program_name LIKE '%node%'
//         AND last_request_end_time < DATEADD(MINUTE, -30, GETDATE())
//       ORDER BY last_request_end_time ASC
//     `, {}, 20000)
    
//     console.log(`Found ${beforeStats.recordset.length} old idle connections`)
    
//     if (beforeStats.recordset.length > 0) {
//       console.log('Old connections:')
//       beforeStats.recordset.forEach(conn => {
//         console.log(`  Session ${conn.session_id}: ${conn.login_name} - idle ${conn.idle_minutes}min (${conn.status})`)
//       })
      
//       await cleanupIdleConnections()
//       console.log('Cleanup completed')
//     } else {
//       console.log('No old connections found - cleanup not needed')
//     }
    
//     return true
    
//   } catch (error) {
//     console.error('Connection cleanup failed:', error.message)
//     return false
//   }
// }

// async function runPerformanceAnalysis() {
//   console.log('\n=== PERFORMANCE ANALYSIS ===')
  
//   try {
//     // Check for blocking queries
//     const blockingQueries = await executeQuery(`
//       SELECT 
//         r.session_id,
//         r.request_id, 
//         r.blocking_session_id,
//         r.wait_type,
//         r.wait_time,
//         r.cpu_time,
//         r.logical_reads,
//         r.writes,
//         t.text as query_text
//       FROM sys.dm_exec_requests r
//       CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
//       WHERE r.session_id > 50
//         AND r.blocking_session_id IS NOT NULL
//     `, {}, 15000)
    
//     if (blockingQueries.recordset.length > 0) {
//       console.log('BLOCKING QUERIES DETECTED:')
//       blockingQueries.recordset.forEach(query => {
//         console.log(`  Session ${query.session_id} blocked by ${query.blocking_session_id}`)
//         console.log(`  Wait: ${query.wait_type} (${query.wait_time}ms)`)
//         console.log(`  Query: ${query.query_text.substring(0, 100)}...`)
//       })
//     } else {
//       console.log('No blocking queries detected')
//     }
    
//     // Check for expensive queries
//     const expensiveQueries = await executeQuery(`
//       SELECT TOP 10
//         qs.execution_count,
//         qs.total_elapsed_time / 1000 as total_elapsed_time_ms,
//         qs.avg_elapsed_time / 1000 as avg_elapsed_time_ms,
//         qs.total_logical_reads,
//         qs.avg_logical_reads,
//         t.text as query_text
//       FROM sys.dm_exec_query_stats qs
//       CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) t
//       WHERE qs.avg_elapsed_time > 1000000  -- > 1 second average
//       ORDER BY qs.avg_elapsed_time DESC
//     `, {}, 20000)
    
//     if (expensiveQueries.recordset.length > 0) {
//       console.log('\nTOP EXPENSIVE QUERIES:')
//       expensiveQueries.recordset.forEach((query, index) => {
//         console.log(`  ${index + 1}. Avg: ${Math.round(query.avg_elapsed_time_ms)}ms, Executions: ${query.execution_count}`)
//         console.log(`     Query: ${query.query_text.substring(0, 100)}...`)
//       })
//     }
    
//     return true
    
//   } catch (error) {
//     console.error('Performance analysis failed:', error.message)
//     return false
//   }
// }

// async function runDiskSpaceCheck() {
//   console.log('\n=== DISK SPACE CHECK ===')
  
//   try {
//     const diskUsage = await executeQuery(`
//       SELECT 
//         DB_NAME() as database_name,
//         SUM(CASE WHEN type = 0 THEN size END) * 8.0 / 1024 as data_size_mb,
//         SUM(CASE WHEN type = 1 THEN size END) * 8.0 / 1024 as log_size_mb,
//         SUM(size) * 8.0 / 1024 as total_size_mb
//       FROM sys.database_files
//     `, {}, 10000)
    
//     const usage = diskUsage.recordset[0]
//     console.log('Database Size:')
//     console.log(`  Data: ${Math.round(usage.data_size_mb || 0)} MB`)
//     console.log(`  Log: ${Math.round(usage.log_size_mb || 0)} MB`)
//     console.log(`  Total: ${Math.round(usage.total_size_mb || 0)} MB`)
    
//     // Check table sizes
//     const tableSizes = await executeQuery(`
//       SELECT TOP 10
//         t.name as table_name,
//         SUM(s.used_page_count) * 8.0 / 1024 as size_mb,
//         SUM(s.row_count) as row_count
//       FROM sys.tables t
//       INNER JOIN sys.dm_db_partition_stats s ON s.object_id = t.object_id
//       GROUP BY t.name
//       ORDER BY SUM(s.used_page_count) DESC
//     `, {}, 15000)
    
//     console.log('\nLargest Tables:')
//     tableSizes.recordset.forEach(table => {
//       console.log(`  ${table.table_name}: ${Math.round(table.size_mb)} MB (${table.row_count.toLocaleString()} rows)`)
//     })
    
//     return true
    
//   } catch (error) {
//     console.error('Disk space check failed:', error.message)
//     return false
//   }
// }

// async function main() {
//   const command = process.argv[2]
  
//   console.log('='.repeat(50))
//   console.log('DATABASE MAINTENANCE TOOL')
//   console.log('='.repeat(50))
  
//   try {
//     switch (command) {
//       case 'health':
//         await runHealthCheck()
//         break
        
//       case 'cleanup':
//         await runConnectionCleanup()
//         break
        
//       case 'performance':
//         await runPerformanceAnalysis()
//         break
        
//       case 'disk':
//         await runDiskSpaceCheck()
//         break
        
//       case 'full':
//         console.log('Running full maintenance check...')
//         await runHealthCheck()
//         await runConnectionCleanup()
//         await runPerformanceAnalysis()
//         await runDiskSpaceCheck()
//         break
        
//       default:
//         console.log('Available commands:')
//         console.log('  node scripts/database-maintenance.js health      - Check database health')
//         console.log('  node scripts/database-maintenance.js cleanup     - Clean up idle connections')
//         console.log('  node scripts/database-maintenance.js performance - Analyze query performance')
//         console.log('  node scripts/database-maintenance.js disk        - Check disk usage')
//         console.log('  node scripts/database-maintenance.js full        - Run all checks')
//         break
//     }
    
//     console.log('\nMaintenance completed successfully')
//     process.exit(0)
    
//   } catch (error) {
//     console.error('Maintenance script failed:', error)
//     process.exit(1)
//   }
// }

// // Run if called directly
// if (require.main === module) {
//   main()
// }

// module.exports = {
//   runHealthCheck,
//   runConnectionCleanup,
//   runPerformanceAnalysis,
//   runDiskSpaceCheck
// }

// routes/database-maintenance.js - Database maintenance and monitoring endpoints
const express = require('express');
const router = express.Router();
const { executeQuery, getPoolStatus, monitorConnectionHealth, cleanupIdleConnections } = require('../lib/database');

// Authentication middleware
const authenticateMaintenance = (req, res, next) => {
  const { auth_key } = req.body.auth_key ? req.body : req.query;
  
  if (auth_key !== process.env.MAINTENANCE_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - Invalid maintenance key'
    });
  }
  
  next();
};

// GET - Database health check
router.get('/health', authenticateMaintenance, async (req, res) => {
  try {
    const poolStatus = getPoolStatus();
    
    const healthResult = await monitorConnectionHealth();
    
    // Get detailed connection statistics
    const stats = await executeQuery(`
      SELECT 
        COUNT(*) as total_connections,
        SUM(CASE WHEN program_name LIKE '%node%' THEN 1 ELSE 0 END) as node_connections,
        SUM(CASE WHEN last_request_end_time < DATEADD(MINUTE, -5, GETDATE()) THEN 1 ELSE 0 END) as idle_5min,
        SUM(CASE WHEN last_request_end_time < DATEADD(MINUTE, -15, GETDATE()) THEN 1 ELSE 0 END) as idle_15min,
        SUM(CASE WHEN last_request_end_time < DATEADD(MINUTE, -30, GETDATE()) THEN 1 ELSE 0 END) as idle_30min,
        MAX(last_request_end_time) as last_activity
      FROM sys.dm_exec_sessions 
      WHERE is_user_process = 1
    `, {}, 15000);
    
    const connectionStats = stats.recordset[0];
    
    res.json({
      success: true,
      message: 'Database health check completed',
      data: {
        health_check_passed: healthResult,
        pool_status: poolStatus,
        connection_statistics: {
          total_connections: connectionStats.total_connections,
          node_connections: connectionStats.node_connections,
          idle_5min: connectionStats.idle_5min,
          idle_15min: connectionStats.idle_15min,
          idle_30min: connectionStats.idle_30min,
          last_activity: connectionStats.last_activity
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST - Run connection cleanup
router.post('/cleanup', authenticateMaintenance, async (req, res) => {
  try {
    // Show connections before cleanup
    const beforeStats = await executeQuery(`
      SELECT 
        session_id,
        login_name,
        program_name,
        last_request_end_time,
        DATEDIFF(MINUTE, last_request_end_time, GETDATE()) as idle_minutes,
        status
      FROM sys.dm_exec_sessions 
      WHERE is_user_process = 1 
        AND program_name LIKE '%node%'
        AND last_request_end_time < DATEADD(MINUTE, -30, GETDATE())
      ORDER BY last_request_end_time ASC
    `, {}, 20000);
    
    const oldConnections = beforeStats.recordset;
    
    if (oldConnections.length > 0) {
      // Format connection details
      const connectionDetails = oldConnections.map(conn => ({
        session_id: conn.session_id,
        login_name: conn.login_name,
        program_name: conn.program_name,
        idle_minutes: conn.idle_minutes,
        status: conn.status,
        last_request: conn.last_request_end_time
      }));
      
      await cleanupIdleConnections();
      
      res.json({
        success: true,
        message: 'Connection cleanup completed',
        data: {
          old_connections_found: oldConnections.length,
          connections_cleaned: connectionDetails,
          cleanup_completed: true
        },
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        success: true,
        message: 'No old connections found - cleanup not needed',
        data: {
          old_connections_found: 0,
          cleanup_completed: false
        },
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('Connection cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET - Performance analysis
router.get('/performance', authenticateMaintenance, async (req, res) => {
  try {
    // Check for blocking queries
    const blockingQueries = await executeQuery(`
      SELECT 
        r.session_id,
        r.request_id, 
        r.blocking_session_id,
        r.wait_type,
        r.wait_time,
        r.cpu_time,
        r.logical_reads,
        r.writes,
        t.text as query_text
      FROM sys.dm_exec_requests r
      CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
      WHERE r.session_id > 50
        AND r.blocking_session_id IS NOT NULL
    `, {}, 15000);
    
    // Check for expensive queries
    const expensiveQueries = await executeQuery(`
      SELECT TOP 10
        qs.execution_count,
        qs.total_elapsed_time / 1000 as total_elapsed_time_ms,
        qs.avg_elapsed_time / 1000 as avg_elapsed_time_ms,
        qs.total_logical_reads,
        qs.avg_logical_reads,
        t.text as query_text
      FROM sys.dm_exec_query_stats qs
      CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) t
      WHERE qs.avg_elapsed_time > 1000000  -- > 1 second average
      ORDER BY qs.avg_elapsed_time DESC
    `, {}, 20000);
    
    const blockingIssues = blockingQueries.recordset.map(query => ({
      session_id: query.session_id,
      request_id: query.request_id,
      blocking_session_id: query.blocking_session_id,
      wait_type: query.wait_type,
      wait_time_ms: query.wait_time,
      cpu_time_ms: query.cpu_time,
      logical_reads: query.logical_reads,
      writes: query.writes,
      query_text: query.query_text.substring(0, 200)
    }));
    
    const expensiveQueries10 = expensiveQueries.recordset.map(query => ({
      execution_count: query.execution_count,
      total_elapsed_time_ms: Math.round(query.total_elapsed_time_ms),
      avg_elapsed_time_ms: Math.round(query.avg_elapsed_time_ms),
      total_logical_reads: query.total_logical_reads,
      avg_logical_reads: Math.round(query.avg_logical_reads),
      query_text: query.query_text.substring(0, 200)
    }));
    
    res.json({
      success: true,
      message: 'Performance analysis completed',
      data: {
        blocking_queries: {
          count: blockingIssues.length,
          queries: blockingIssues
        },
        expensive_queries: {
          count: expensiveQueries10.length,
          queries: expensiveQueries10
        },
        alerts: [
          ...(blockingIssues.length > 0 ? [{
            level: 'warning',
            message: `${blockingIssues.length} blocking queries detected`
          }] : []),
          ...(expensiveQueries10.length > 0 ? [{
            level: 'info',
            message: `${expensiveQueries10.length} expensive queries found`
          }] : [])
        ]
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Performance analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET - Disk space check
router.get('/disk', authenticateMaintenance, async (req, res) => {
  try {
    const diskUsage = await executeQuery(`
      SELECT 
        DB_NAME() as database_name,
        SUM(CASE WHEN type = 0 THEN size END) * 8.0 / 1024 as data_size_mb,
        SUM(CASE WHEN type = 1 THEN size END) * 8.0 / 1024 as log_size_mb,
        SUM(size) * 8.0 / 1024 as total_size_mb
      FROM sys.database_files
    `, {}, 10000);
    
    const usage = diskUsage.recordset[0];
    
    // Check table sizes
    const tableSizes = await executeQuery(`
      SELECT TOP 10
        t.name as table_name,
        SUM(s.used_page_count) * 8.0 / 1024 as size_mb,
        SUM(s.row_count) as row_count
      FROM sys.tables t
      INNER JOIN sys.dm_db_partition_stats s ON s.object_id = t.object_id
      GROUP BY t.name
      ORDER BY SUM(s.used_page_count) DESC
    `, {}, 15000);
    
    const largestTables = tableSizes.recordset.map(table => ({
      table_name: table.table_name,
      size_mb: Math.round(table.size_mb),
      row_count: table.row_count
    }));
    
    res.json({
      success: true,
      message: 'Disk space check completed',
      data: {
        database_size: {
          database_name: usage.database_name,
          data_size_mb: Math.round(usage.data_size_mb || 0),
          log_size_mb: Math.round(usage.log_size_mb || 0),
          total_size_mb: Math.round(usage.total_size_mb || 0)
        },
        largest_tables: largestTables,
        alerts: [
          ...(usage.total_size_mb > 10240 ? [{
            level: 'warning',
            message: 'Database size exceeds 10 GB'
          }] : []),
          ...(usage.log_size_mb > 5120 ? [{
            level: 'warning',
            message: 'Log file size exceeds 5 GB'
          }] : [])
        ]
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Disk space check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST - Run full maintenance check
router.post('/full', authenticateMaintenance, async (req, res) => {
  try {
    console.log('Running full maintenance check...');
    
    const results = {
      health: null,
      cleanup: null,
      performance: null,
      disk: null
    };
    
    // Run health check
    try {
      const poolStatus = getPoolStatus();
      const healthResult = await monitorConnectionHealth();
      const stats = await executeQuery(`
        SELECT 
          COUNT(*) as total_connections,
          SUM(CASE WHEN program_name LIKE '%node%' THEN 1 ELSE 0 END) as node_connections,
          SUM(CASE WHEN last_request_end_time < DATEADD(MINUTE, -5, GETDATE()) THEN 1 ELSE 0 END) as idle_5min,
          SUM(CASE WHEN last_request_end_time < DATEADD(MINUTE, -15, GETDATE()) THEN 1 ELSE 0 END) as idle_15min,
          SUM(CASE WHEN last_request_end_time < DATEADD(MINUTE, -30, GETDATE()) THEN 1 ELSE 0 END) as idle_30min
        FROM sys.dm_exec_sessions 
        WHERE is_user_process = 1
      `, {}, 15000);
      
      results.health = {
        success: true,
        health_check_passed: healthResult,
        pool_status: poolStatus,
        connection_statistics: stats.recordset[0]
      };
    } catch (error) {
      results.health = { success: false, error: error.message };
    }
    
    // Run cleanup
    try {
      const beforeStats = await executeQuery(`
        SELECT 
          session_id,
          DATEDIFF(MINUTE, last_request_end_time, GETDATE()) as idle_minutes
        FROM sys.dm_exec_sessions 
        WHERE is_user_process = 1 
          AND program_name LIKE '%node%'
          AND last_request_end_time < DATEADD(MINUTE, -30, GETDATE())
      `, {}, 20000);
      
      if (beforeStats.recordset.length > 0) {
        await cleanupIdleConnections();
        results.cleanup = {
          success: true,
          old_connections_found: beforeStats.recordset.length,
          cleanup_completed: true
        };
      } else {
        results.cleanup = {
          success: true,
          old_connections_found: 0,
          cleanup_completed: false
        };
      }
    } catch (error) {
      results.cleanup = { success: false, error: error.message };
    }
    
    // Run performance analysis
    try {
      const blockingQueries = await executeQuery(`
        SELECT COUNT(*) as blocking_count
        FROM sys.dm_exec_requests r
        WHERE r.session_id > 50
          AND r.blocking_session_id IS NOT NULL
      `, {}, 15000);
      
      const expensiveQueries = await executeQuery(`
        SELECT COUNT(*) as expensive_count
        FROM sys.dm_exec_query_stats qs
        WHERE qs.avg_elapsed_time > 1000000
      `, {}, 20000);
      
      results.performance = {
        success: true,
        blocking_queries_count: blockingQueries.recordset[0].blocking_count,
        expensive_queries_count: expensiveQueries.recordset[0].expensive_count
      };
    } catch (error) {
      results.performance = { success: false, error: error.message };
    }
    
    // Run disk check
    try {
      const diskUsage = await executeQuery(`
        SELECT 
          SUM(CASE WHEN type = 0 THEN size END) * 8.0 / 1024 as data_size_mb,
          SUM(CASE WHEN type = 1 THEN size END) * 8.0 / 1024 as log_size_mb,
          SUM(size) * 8.0 / 1024 as total_size_mb
        FROM sys.database_files
      `, {}, 10000);
      
      results.disk = {
        success: true,
        database_size: {
          data_size_mb: Math.round(diskUsage.recordset[0].data_size_mb || 0),
          log_size_mb: Math.round(diskUsage.recordset[0].log_size_mb || 0),
          total_size_mb: Math.round(diskUsage.recordset[0].total_size_mb || 0)
        }
      };
    } catch (error) {
      results.disk = { success: false, error: error.message };
    }
    
    const allSuccess = Object.values(results).every(r => r.success);
    
    res.json({
      success: allSuccess,
      message: allSuccess ? 'Full maintenance check completed successfully' : 'Some maintenance checks failed',
      data: results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Full maintenance check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET - Available maintenance commands
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Database Maintenance API',
    endpoints: [
      {
        method: 'GET',
        path: '/database-maintenance/health',
        description: 'Check database health and connection statistics',
        requires_auth: true
      },
      {
        method: 'POST',
        path: '/database-maintenance/cleanup',
        description: 'Clean up idle database connections',
        requires_auth: true
      },
      {
        method: 'GET',
        path: '/database-maintenance/performance',
        description: 'Analyze query performance and detect blocking queries',
        requires_auth: true
      },
      {
        method: 'GET',
        path: '/database-maintenance/disk',
        description: 'Check disk usage and table sizes',
        requires_auth: true
      },
      {
        method: 'POST',
        path: '/database-maintenance/full',
        description: 'Run all maintenance checks',
        requires_auth: true
      }
    ],
    authentication: {
      note: 'All endpoints require auth_key parameter matching MAINTENANCE_KEY environment variable',
      usage: 'Send auth_key in request body (POST) or query parameters (GET)'
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;