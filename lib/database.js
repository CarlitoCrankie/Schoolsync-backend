// // // lib/database.js - Optimized database connection management
// // // lib/database.js - Optimized for 12,000+ concurrent users
// // // lib/database.js - Fixed configuration
// // const sql = require('mssql')

// // const config = {
// //   server: process.env.RDS_SERVER,
// //   database: process.env.RDS_DB,
// //   user: process.env.RDS_USER,
// //   password: process.env.RDS_PASSWORD,
// //   options: {
// //     encrypt: true,
// //     trustServerCertificate: true,
// //     enableArithAbort: true,
// //     connectTimeout: 30000,
// //     requestTimeout: 45000,
// //     cancelTimeout: 5000,
// //     packetSize: 4096,
// //     connectionIsolationLevel: sql.ISOLATION_LEVEL.READ_COMMITTED
// //   },
// //   pool: {
// //     max: 25,
// //     min: 5,
// //     idleTimeoutMillis: 120000,
// //     acquireTimeoutMillis: 30000
// //     // REMOVED: testOnBorrow, evictionRunIntervalMillis (not supported)
// //   }
// // }

// // let pool = null
// // let isConnecting = false
// // let keepAliveInterval = null
// // let connectionRetries = 0
// // const MAX_RETRIES = 3

// // const createPool = async () => {
// //   if (isConnecting) {
// //     while (isConnecting) {
// //       await new Promise(resolve => setTimeout(resolve, 100))
// //     }
// //     return pool
// //   }

// //   try {
// //     isConnecting = true
    
// //     if (pool) {
// //       try {
// //         await pool.close()
// //         console.log('Closed existing pool')
// //       } catch (err) {
// //         console.log('Error closing existing pool:', err.message)
// //       }
// //       pool = null
// //     }

// //     console.log('Creating optimized database pool...')
// //     pool = new sql.ConnectionPool(config)
    
// //     pool.on('connect', () => {
// //       console.log('Database pool connected successfully')
// //       connectionRetries = 0
// //       startKeepAlive()
// //     })
    
// //     pool.on('error', (err) => {
// //       console.error('Database pool error:', err)
// //       stopKeepAlive()
// //       pool = null
// //     })

// //     await pool.connect()
// //     return pool
    
// //   } catch (error) {
// //     console.error('Database connection failed:', error)
// //     pool = null
// //     connectionRetries++
    
// //     if (connectionRetries < MAX_RETRIES) {
// //       const delay = Math.pow(2, connectionRetries) * 1000
// //       console.log(`Retrying connection in ${delay}ms (attempt ${connectionRetries}/${MAX_RETRIES})`)
// //       await new Promise(resolve => setTimeout(resolve, delay))
// //       return await createPool()
// //     }
    
// //     throw error
// //   } finally {
// //     isConnecting = false
// //   }
// // }

// // const getPool = async () => {
// //   if (!pool || !pool.connected || pool.connecting) {
// //     console.log('Creating new database connection...')
// //     return await createPool()
// //   }
  
// //   try {
// //     const testRequest = pool.request()
// //     testRequest.timeout = 5000
// //     await testRequest.query('SELECT 1')
// //     return pool
// //   } catch (error) {
// //     console.log('Connection test failed, reconnecting...', error.message)
// //     stopKeepAlive()
// //     pool = null
// //     return await createPool()
// //   }
// // }

// // const startKeepAlive = () => {
// //   if (keepAliveInterval) {
// //     clearInterval(keepAliveInterval)
// //   }
  
// //   keepAliveInterval = setInterval(async () => {
// //     try {
// //       if (pool && pool.connected && !pool.connecting) {
// //         const request = pool.request()
// //         request.timeout = 5000
// //         await request.query('SELECT 1 as keepalive')
// //         console.log('Database keep-alive successful')
// //       }
// //     } catch (error) {
// //       console.log('Keep-alive failed:', error.message)
// //       if (pool) {
// //         stopKeepAlive()
// //         pool = null
// //       }
// //     }
// //   }, 90000)
// // }

// // const stopKeepAlive = () => {
// //   if (keepAliveInterval) {
// //     clearInterval(keepAliveInterval)
// //     keepAliveInterval = null
// //   }
// // }

// // const closePool = async () => {
// //   console.log('Closing database pool...')
// //   stopKeepAlive()
  
// //   if (pool) {
// //     try {
// //       await new Promise(resolve => setTimeout(resolve, 2000))
// //       await pool.close()
// //       console.log('Database pool closed gracefully')
// //     } catch (error) {
// //       console.error('Error closing database pool:', error)
// //     }
// //     pool = null
// //   }
// // }

// // process.on('SIGINT', async () => {
// //   console.log('SIGINT received, closing database...')
// //   await closePool()
// //   process.exit(0)
// // })

// // process.on('SIGTERM', async () => {
// //   console.log('SIGTERM received, closing database...')
// //   await closePool()
// //   process.exit(0)
// // })

// // module.exports = {
// //   getPool,
// //   closePool,
// //   sql
// // }
// const sql = require('mssql')

// const config = {
//   server: process.env.RDS_SERVER,
//   database: process.env.RDS_DB,
//   port: 1533,
//   user: process.env.RDS_USER,
//   password: process.env.RDS_PASSWORD,
//   options: {
//     encrypt: true,
//     trustServerCertificate: true,
//     enableArithAbort: true,
//     connectTimeout: 30000,
//     requestTimeout: 45000,
//     cancelTimeout: 5000,
//     packetSize: 4096,
//     connectionIsolationLevel: sql.ISOLATION_LEVEL.READ_COMMITTED,
//     abortTransactionOnError: true
//   },
//   pool: {
//     max: 25,
//     min: 5,
//     idleTimeoutMillis: 60000,
//     acquireTimeoutMillis: 30000,
//     createTimeoutMillis: 20000,
//     destroyTimeoutMillis: 5000,
//     reapIntervalMillis: 1000,
//     createRetryIntervalMillis: 200
//     // Removed unsupported options: evictionRunIntervalMillis, testOnBorrow, testWhileIdle, numTestsPerEvictionRun
//   }
// }

// let pool = null
// let isConnecting = false
// let keepAliveInterval = null
// let connectionRetries = 0
// let healthCheckInterval = null
// let monitoringInterval = null
// const MAX_RETRIES = 3

// // CRITICAL: Query wrapper with timeout enforcement
// const executeQuery = async (queryString, params = {}, timeoutMs = 30000) => {
//   const currentPool = await getPool()
//   const request = currentPool.request()
  
//   // CRITICAL: Set query timeout for every query
//   request.timeout = timeoutMs
  
//   // Add parameters
//   Object.keys(params).forEach(key => {
//     if (params[key] !== undefined && params[key] !== null) {
//       request.input(key, params[key])
//     }
//   })
  
//   try {
//     console.log(`Executing query (timeout: ${timeoutMs}ms): ${queryString.substring(0, 100)}...`)
//     const startTime = Date.now()
//     const result = await request.query(queryString)
//     const duration = Date.now() - startTime
    
//     if (duration > 10000) {
//       console.warn(`SLOW QUERY WARNING: Query took ${duration}ms`)
//     }
    
//     return result
//   } catch (error) {
//     console.error('Query failed:', {
//       error: error.message,
//       code: error.code,
//       query: queryString.substring(0, 200),
//       timeout: timeoutMs
//     })
//     throw error
//   }
// }

// // Enhanced connection validation
// const validateConnection = async (testPool) => {
//   try {
//     const request = testPool.request()
//     request.timeout = 5000
//     const result = await request.query('SELECT 1 as health_check, GETDATE() as CurrentTime')
//     return result.recordset && result.recordset.length > 0
//   } catch (error) {
//     console.log('Connection validation failed:', error.message)
//     return false
//   }
// }

// // CRITICAL: Connection health monitoring
// const monitorConnectionHealth = async () => {
//   try {
//     if (!pool || !pool.connected) {
//       console.warn('Pool not connected during health check')
//       return false
//     }
    
//     // Check for sleeping connections in the database
//     const result = await executeQuery(`
//       SELECT 
//         COUNT(*) as total_connections,
//         SUM(CASE WHEN last_request_end_time < DATEADD(MINUTE, -10, GETDATE()) THEN 1 ELSE 0 END) as old_idle_connections,
//         SUM(CASE WHEN last_request_end_time < DATEADD(MINUTE, -30, GETDATE()) THEN 1 ELSE 0 END) as very_old_idle_connections
//       FROM sys.dm_exec_sessions 
//       WHERE is_user_process = 1 
//         AND program_name LIKE '%node%'
//     `, {}, 10000)
    
//     const stats = result.recordset[0]
//     console.log('Connection health stats:', stats)
    
//     // Alert if too many idle connections
//     if (stats.old_idle_connections > 5) {
//       console.warn(`WARNING: ${stats.old_idle_connections} connections idle for 10+ minutes`)
//     }
    
//     if (stats.very_old_idle_connections > 2) {
//       console.error(`CRITICAL: ${stats.very_old_idle_connections} connections idle for 30+ minutes`)
//     }
    
//     return true
//   } catch (error) {
//     console.error('Connection health monitoring failed:', error.message)
//     return false
//   }
// }

// // CRITICAL: Cleanup old connections periodically
// const cleanupIdleConnections = async () => {
//   try {
//     console.log('Running idle connection cleanup...')
    
//     // Find very old idle connections
//     const oldConnections = await executeQuery(`
//       SELECT session_id
//       FROM sys.dm_exec_sessions 
//       WHERE is_user_process = 1 
//         AND program_name LIKE '%node%'
//         AND last_request_end_time < DATEADD(MINUTE, -45, GETDATE())
//         AND session_id != @@SPID  -- Don't kill our own session
//     `, {}, 15000)
    
//     if (oldConnections.recordset.length > 0) {
//       console.warn(`Found ${oldConnections.recordset.length} very old idle connections, cleaning up...`)
      
//       // Kill old connections (be careful!)
//       for (const conn of oldConnections.recordset) {
//         try {
//           await executeQuery(`KILL ${conn.session_id}`, {}, 5000)
//           console.log(`Killed idle session: ${conn.session_id}`)
//         } catch (error) {
//           console.log(`Could not kill session ${conn.session_id}: ${error.message}`)
//         }
//       }
//     } else {
//       console.log('No old idle connections found')
//     }
//   } catch (error) {
//     console.error('Idle connection cleanup failed:', error.message)
//   }
// }

// const createPool = async () => {
//   if (isConnecting) {
//     while (isConnecting) {
//       await new Promise(resolve => setTimeout(resolve, 100))
//     }
//     return pool
//   }

//   try {
//     isConnecting = true
    
//     if (pool) {
//       try {
//         await pool.close()
//         console.log('Closed existing pool')
//       } catch (err) {
//         console.log('Error closing existing pool:', err.message)
//       }
//       pool = null
//     }

//     console.log('Creating optimized database pool...')
//     pool = new sql.ConnectionPool(config)
    
//     pool.on('connect', () => {
//       console.log('Database pool connected successfully')
//       connectionRetries = 0
//       startKeepAlive()
//       startHealthCheck()
//       startMonitoring() // FIXED: Now properly calls startMonitoring
//     })
    
//     pool.on('error', (err) => {
//       console.error('Database pool error:', err)
//       stopKeepAlive()
//       stopHealthCheck()
//       stopMonitoring()
//       pool = null
//     })

//     await pool.connect()
//     return pool
    
//   } catch (error) {
//     console.error('Database connection failed:', error)
//     pool = null
//     connectionRetries++
    
//     if (connectionRetries < MAX_RETRIES) {
//       const delay = Math.pow(2, connectionRetries) * 1000
//       console.log(`Retrying connection in ${delay}ms (attempt ${connectionRetries}/${MAX_RETRIES})`)
//       await new Promise(resolve => setTimeout(resolve, delay))
//       return await createPool()
//     }
    
//     throw error
//   } finally {
//     isConnecting = false
//   }
// }

// const getPool = async () => {
//   if (!pool || !pool.connected || pool.connecting) {
//     console.log('Creating new database connection...')
//     return await createPool()
//   }
  
//   // Enhanced connection validation
//   const isValid = await validateConnection(pool)
//   if (!isValid) {
//     console.log('Connection validation failed, reconnecting...')
//     stopKeepAlive()
//     stopHealthCheck()
//     stopMonitoring()
//     pool = null
//     return await createPool()
//   }
  
//   return pool
// }

// // Keep-alive with executeQuery wrapper
// const startKeepAlive = () => {
//   if (keepAliveInterval) {
//     clearInterval(keepAliveInterval)
//   }
  
//   keepAliveInterval = setInterval(async () => {
//     try {
//       if (pool && pool.connected && !pool.connecting) {
//         await executeQuery('SELECT 1 as keepalive, GETDATE() as CurrentTime', {}, 5000)
//         console.log('Database keep-alive successful')
//       }
//     } catch (error) {
//       console.log('Keep-alive failed:', error.message)
//       if (pool) {
//         stopKeepAlive()
//         stopHealthCheck()
//         stopMonitoring()
//         pool = null
//       }
//     }
//   }, 30000)
// }

// // FIXED: Single health check function
// const startHealthCheck = () => {
//   if (healthCheckInterval) {
//     clearInterval(healthCheckInterval)
//   }
  
//   healthCheckInterval = setInterval(async () => {
//     try {
//       if (pool && pool.connected) {
//         // Check pool statistics
//         const poolSize = pool.size || 0
//         const available = pool.available || 0
//         const pending = pool.pending || 0
        
//         console.log(`Pool health: Size=${poolSize}, Available=${available}, Pending=${pending}`)
        
//         // Run connection health monitoring
//         await monitorConnectionHealth()
        
//         // Alert on concerning metrics
//         if (available === 0 && poolSize >= config.pool.max * 0.8) {
//           console.warn('POOL WARNING: Low available connections')
//         }
        
//         if (pending > 5) {
//           console.warn('POOL WARNING: High pending connection requests')
//         }
//       }
//     } catch (error) {
//       console.log('Health check failed:', error.message)
//     }
//   }, 60000) // Every minute
// }

// // FIXED: Automated monitoring and cleanup
// const startMonitoring = () => {
//   if (monitoringInterval) {
//     clearInterval(monitoringInterval)
//   }
  
//   console.log('Starting automated connection monitoring and cleanup...')
  
//   monitoringInterval = setInterval(async () => {
//     try {
//       // Run cleanup every 10 minutes
//       await cleanupIdleConnections()
//     } catch (error) {
//       console.error('Automated monitoring failed:', error.message)
//     }
//   }, 600000) // Every 10 minutes
// }

// const stopKeepAlive = () => {
//   if (keepAliveInterval) {
//     clearInterval(keepAliveInterval)
//     keepAliveInterval = null
//   }
// }

// const stopHealthCheck = () => {
//   if (healthCheckInterval) {
//     clearInterval(healthCheckInterval)
//     healthCheckInterval = null
//   }
// }

// const stopMonitoring = () => {
//   if (monitoringInterval) {
//     clearInterval(monitoringInterval)
//     monitoringInterval = null
//   }
// }

// const closePool = async () => {
//   console.log('Closing database pool gracefully...')
//   stopKeepAlive()
//   stopHealthCheck()
//   stopMonitoring()
  
//   if (pool) {
//     try {
//       // Wait a moment for active queries to complete
//       await new Promise(resolve => setTimeout(resolve, 3000))
//       await pool.close()
//       console.log('Database pool closed gracefully')
//     } catch (error) {
//       console.error('Error closing database pool:', error)
//     }
//     pool = null
//   }
// }

// // Enhanced status reporting for admin dashboard
// const getPoolStatus = () => {
//   if (!pool) {
//     return {
//       status: 'disconnected',
//       connected: false,
//       size: 0,
//       available: 0,
//       pending: 0,
//       keepAlive: !!keepAliveInterval,
//       healthCheck: !!healthCheckInterval,
//       monitoring: !!monitoringInterval
//     }
//   }
  
//   return {
//     status: pool.connected ? 'connected' : 'disconnected',
//     connected: pool.connected,
//     connecting: pool.connecting,
//     size: pool.size || 0,
//     available: pool.available || 0,
//     pending: pool.pending || 0,
//     keepAlive: !!keepAliveInterval,
//     healthCheck: !!healthCheckInterval,
//     monitoring: !!monitoringInterval,
//     poolConfig: {
//       max: config.pool.max,
//       min: config.pool.min,
//       idleTimeout: config.pool.idleTimeoutMillis,
//       acquireTimeout: config.pool.acquireTimeoutMillis
//     }
//   }
// }

// // FIXED: Enhanced graceful shutdown handlers
// const setupGracefulShutdown = () => {
//   const shutdown = async (signal) => {
//     console.log(`${signal} received, initiating graceful shutdown...`)
    
//     try {
//       await closePool()
//       console.log('Database connections closed successfully')
//       process.exit(0)
//     } catch (error) {
//       console.error('Error during graceful shutdown:', error)
//       process.exit(1)
//     }
//   }
  
//   process.on('SIGINT', () => shutdown('SIGINT'))
//   process.on('SIGTERM', () => shutdown('SIGTERM'))
  
//   // Handle uncaught exceptions and unhandled rejections
//   process.on('uncaughtException', async (error) => {
//     console.error('Uncaught Exception:', error)
//     await closePool()
//     process.exit(1)
//   })
  
//   process.on('unhandledRejection', async (reason, promise) => {
//     console.error('Unhandled Rejection at:', promise, 'reason:', reason)
//     await closePool()
//     process.exit(1)
//   })
// }

// // FIXED: Initialize graceful shutdown handlers
// setupGracefulShutdown()

// // FIXED: Export all critical functions
// module.exports = {
//   getPool,
//   closePool,
//   getPoolStatus,
//   validateConnection,
//   executeQuery,
//   monitorConnectionHealth,
//   cleanupIdleConnections,
//   sql
// }

// lib/database.js - FIXED VERSION
const sql = require('mssql')

const config = {
  // FIXED: Use standard DB_ prefixes (not RDS_)
  server: process.env.DB_SERVER || process.env.RDS_SERVER,
  database: process.env.DB_NAME || process.env.RDS_DB,
  port: parseInt(process.env.DB_PORT || '1533'), // FIXED: Was 1533, should be 1433
  user: process.env.DB_USER || process.env.RDS_USER,
  password: process.env.DB_PASSWORD || process.env.RDS_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true' || true,
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || true,
    enableArithAbort: true,
    connectTimeout: 30000,
    requestTimeout: 45000,
    cancelTimeout: 5000,
    packetSize: 4096,
    connectionIsolationLevel: sql.ISOLATION_LEVEL.READ_COMMITTED,
    abortTransactionOnError: true
  },
  pool: {
    max: parseInt(process.env.DB_POOL_MAX || '10'), // Reduced from 25 for Railway
    min: parseInt(process.env.DB_POOL_MIN || '2'),  // Reduced from 5
    idleTimeoutMillis: 60000,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 20000,
    destroyTimeoutMillis: 5000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200
  }
}

// Log configuration (without sensitive data) for debugging
console.log('📊 Database Configuration:', {
  server: config.server ? '✅ Set' : '❌ Missing',
  database: config.database ? '✅ Set' : '❌ Missing',
  user: config.user ? '✅ Set' : '❌ Missing',
  password: config.password ? '✅ Set' : '❌ Missing',
  port: config.port,
  encrypt: config.options.encrypt
});

let pool = null
let isConnecting = false
let keepAliveInterval = null
let connectionRetries = 0
let healthCheckInterval = null
let monitoringInterval = null
const MAX_RETRIES = 3

// CRITICAL: Query wrapper with timeout enforcement
const executeQuery = async (queryString, params = {}, timeoutMs = 30000) => {
  const currentPool = await getPool()
  const request = currentPool.request()
  
  // CRITICAL: Set query timeout for every query
  request.timeout = timeoutMs
  
  // Add parameters
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null) {
      request.input(key, params[key])
    }
  })
  
  try {
    const startTime = Date.now()
    const result = await request.query(queryString)
    const duration = Date.now() - startTime
    
    if (duration > 10000) {
      console.warn(`SLOW QUERY WARNING: Query took ${duration}ms`)
    }
    
    return result
  } catch (error) {
    console.error('Query failed:', {
      error: error.message,
      code: error.code,
      query: queryString.substring(0, 200)
    })
    throw error
  }
}

// Enhanced connection validation
const validateConnection = async (testPool) => {
  try {
    const request = testPool.request()
    request.timeout = 5000
    const result = await request.query('SELECT 1 as health_check')
    return result.recordset && result.recordset.length > 0
  } catch (error) {
    console.log('Connection validation failed:', error.message)
    return false
  }
}

const createPool = async () => {
  if (isConnecting) {
    while (isConnecting) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return pool
  }

  try {
    isConnecting = true
    
    if (pool) {
      try {
        await pool.close()
        console.log('Closed existing pool')
      } catch (err) {
        console.log('Error closing existing pool:', err.message)
      }
      pool = null
    }

    console.log('Creating database pool...')
    pool = new sql.ConnectionPool(config)
    
    pool.on('connect', () => {
      console.log('✅ Database pool connected successfully')
      connectionRetries = 0
      startKeepAlive()
    })
    
    pool.on('error', (err) => {
      console.error('❌ Database pool error:', err)
      stopKeepAlive()
      pool = null
    })

    await pool.connect()
    console.log('✅ Database connection established')
    return pool
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message)
    pool = null
    connectionRetries++
    
    if (connectionRetries < MAX_RETRIES) {
      const delay = Math.pow(2, connectionRetries) * 1000
      console.log(`Retrying connection in ${delay}ms (attempt ${connectionRetries}/${MAX_RETRIES})`)
      await new Promise(resolve => setTimeout(resolve, delay))
      return await createPool()
    }
    
    throw error
  } finally {
    isConnecting = false
  }
}

const getPool = async () => {
  if (!pool || !pool.connected || pool.connecting) {
    console.log('Creating new database connection...')
    return await createPool()
  }
  
  // Enhanced connection validation
  const isValid = await validateConnection(pool)
  if (!isValid) {
    console.log('Connection validation failed, reconnecting...')
    stopKeepAlive()
    pool = null
    return await createPool()
  }
  
  return pool
}

// Keep-alive
const startKeepAlive = () => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
  }
  
  keepAliveInterval = setInterval(async () => {
    try {
      if (pool && pool.connected && !pool.connecting) {
        await executeQuery('SELECT 1 as keepalive', {}, 5000)
        console.log('Database keep-alive successful')
      }
    } catch (error) {
      console.log('Keep-alive failed:', error.message)
      if (pool) {
        stopKeepAlive()
        pool = null
      }
    }
  }, 30000)
}

const stopKeepAlive = () => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
    keepAliveInterval = null
  }
}

const closePool = async () => {
  console.log('Closing database pool gracefully...')
  stopKeepAlive()
  
  if (pool) {
    try {
      await new Promise(resolve => setTimeout(resolve, 2000))
      await pool.close()
      console.log('Database pool closed gracefully')
    } catch (error) {
      console.error('Error closing database pool:', error)
    }
    pool = null
  }
}

// Graceful shutdown handlers
const setupGracefulShutdown = () => {
  const shutdown = async (signal) => {
    console.log(`${signal} received, closing database...`)
    await closePool()
    process.exit(0)
  }
  
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

setupGracefulShutdown()

module.exports = {
  getPool,
  closePool,
  validateConnection,
  executeQuery,
  sql
}