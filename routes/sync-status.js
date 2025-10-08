// // pages/api/sync-status.js - Monitor sync agent health
// const fs = require('fs').promises
// const path = require('path')
// const { getPool, sql } = require('../../lib/database')

// const SYNC_STATUS_FILE = path.join(process.cwd(), 'sync_status.json')
// const SYNC_PID_FILE = path.join(process.cwd(), 'sync_agent.pid')

// export default async function handler(req, res) {
//   res.setHeader('Access-Control-Allow-Origin', '*')
//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

//   if (req.method === 'OPTIONS') {
//     res.status(200).end()
//     return
//   }

//   if (req.method !== 'GET') {
//     return res.status(405).json({ error: 'Method not allowed' })
//   }

//   try {
//     // Check if request is for all schools or specific school
//     const { school_id, all_schools } = req.query

//     if (all_schools === 'true') {
//       // Return status for all schools
//       const allSchoolsStatus = await getAllSchoolsSyncStatus()
//       res.json({
//         timestamp: new Date().toISOString(),
//         type: 'all_schools',
//         schools: allSchoolsStatus
//       })
//     } else {
//       // Return status for specific school (existing functionality)
//       const targetSchoolId = school_id ? parseInt(school_id) : 2 // Default to school 2
//       const cloudSyncStatus = await getCloudSyncStatus(targetSchoolId)
//       const dbStatus = await getDatabaseStatus()
//       const recentActivity = await getRecentSyncActivity()

//       res.json({
//         timestamp: new Date().toISOString(),
//         type: 'single_school',
//         syncAgent: cloudSyncStatus,
//         database: dbStatus,
//         recentActivity,
//         overallHealth: determineOverallHealthFromCloud(cloudSyncStatus, dbStatus, recentActivity)
//       })
//     }

//   } catch (error) {
//     console.error('Sync status API error:', error)
//     res.status(500).json({
//       error: error.message,
//       timestamp: new Date().toISOString(),
//       overallHealth: 'error'
//     })
//   }
// }

// async function getAllSchoolsSyncStatus() {
//   try {
//     const pool = await getPool()
    
//     // Monitor all sync agents across schools with comprehensive details
//     const allSchoolsResult = await pool.request().query(`
//       SELECT 
//         s.SchoolID,
//         s.Name as SchoolName,
//         s.Location,
//         sas.Status,
//         sas.LastHeartbeat,
//         sas.StartupTime,
//         sas.ShutdownTime,
//         sas.ProcessID,
//         sas.TotalSynced,
//         sas.TotalErrors,
//         sas.UptimeHours,
//         sas.MemoryUsageMB,
//         CASE 
//             WHEN sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) THEN 'Online'
//             WHEN sas.LastHeartbeat > DATEADD(MINUTE, -30, GETDATE()) THEN 'Warning'  
//             WHEN sas.LastHeartbeat IS NULL THEN 'Never Connected'
//             ELSE 'Offline'
//         END as ConnectionStatus,
//         DATEDIFF(MINUTE, sas.LastHeartbeat, GETDATE()) as MinutesSinceLastSeen,
//         CASE 
//             WHEN sas.TotalSynced + sas.TotalErrors > 0 
//             THEN CAST((sas.TotalErrors * 100.0 / (sas.TotalSynced + sas.TotalErrors)) AS DECIMAL(5,2))
//             ELSE 0 
//         END as ErrorRate,
//         -- Get recent activity for each school
//         (SELECT COUNT(*) FROM dbo.Attendance a WHERE a.SchoolID = s.SchoolID AND a.CreatedAt > DATEADD(hour, -1, GETDATE())) as RecentSyncsHour,
//         (SELECT COUNT(*) FROM dbo.Attendance a WHERE a.SchoolID = s.SchoolID AND CAST(a.CreatedAt as DATE) = CAST(GETDATE() as DATE)) as SyncsToday
//       FROM Schools s
//       LEFT JOIN SyncAgentStatus sas ON s.SchoolID = sas.SchoolID
//       ORDER BY 
//         CASE 
//             WHEN sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) THEN 1  -- Online first
//             WHEN sas.LastHeartbeat > DATEADD(MINUTE, -30, GETDATE()) THEN 2  -- Warning second
//             WHEN sas.LastHeartbeat IS NULL THEN 4                           -- Never connected last
//             ELSE 3                                                          -- Offline third
//         END,
//         sas.LastHeartbeat DESC
//     `)
    
//     return allSchoolsResult.recordset.map(school => ({
//       school_id: school.SchoolID,
//       school_name: school.SchoolName,
//       location: school.Location,
//       sync_agent_status: school.Status,
//       last_heartbeat: school.LastHeartbeat,
//       startup_time: school.StartupTime,
//       shutdown_time: school.ShutdownTime,
//       process_id: school.ProcessID,
//       total_synced: school.TotalSynced || 0,
//       total_errors: school.TotalErrors || 0,
//       uptime_hours: school.UptimeHours || 0,
//       memory_usage_mb: school.MemoryUsageMB || 0,
//       connection_status: school.ConnectionStatus,
//       minutes_since_last_seen: school.MinutesSinceLastSeen,
//       error_rate: school.ErrorRate || 0,
//       recent_syncs_hour: school.RecentSyncsHour || 0,
//       syncs_today: school.SyncsToday || 0,
//       is_running: school.ConnectionStatus === 'Online',
//       health: school.ConnectionStatus.toLowerCase()
//     }))
    
//   } catch (error) {
//     console.error('Error getting all schools sync status:', error)
//     throw new Error(`Failed to get all schools status: ${error.message}`)
//   }
// }

// async function getCloudSyncStatus(schoolId = 2) {
//   try {
//     const pool = await getPool()
    
//     // Check sync agent status from cloud heartbeat for specific school
//     const syncAgentStatus = await pool.request()
//       .input('schoolId', sql.Int, schoolId)
//       .query(`
//         SELECT 
//           sas.SchoolID,
//           s.Name as SchoolName,
//           sas.Status,
//           sas.LastHeartbeat,
//           sas.StartupTime,
//           sas.TotalSynced,
//           sas.TotalErrors,
//           sas.UptimeHours,
//           sas.ProcessID,
//           sas.MemoryUsageMB,
//           CASE 
//             WHEN sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) THEN 'healthy'
//             WHEN sas.LastHeartbeat > DATEADD(MINUTE, -30, GETDATE()) THEN 'stale'
//             ELSE 'offline'
//           END as Health,
//           DATEDIFF(MINUTE, sas.LastHeartbeat, GETDATE()) as MinutesSinceLastSeen
//         FROM Schools s
//         LEFT JOIN SyncAgentStatus sas ON s.SchoolID = sas.SchoolID
//         WHERE s.SchoolID = @schoolId
//       `)
    
//     const status = syncAgentStatus.recordset[0]
    
//     if (!status || !status.LastHeartbeat) {
//       return {
//         is_running: false,
//         health: 'offline',
//         error: 'No heartbeat data found - sync agent may not be running or heartbeat table may not exist',
//         school_id: schoolId,
//         school_name: status ? status.SchoolName : 'Unknown School'
//       }
//     }
    
//     return {
//       is_running: status.Health === 'healthy',
//       school_id: status.SchoolID,
//       school_name: status.SchoolName,
//       current_status: status.Status,
//       last_heartbeat: status.LastHeartbeat,
//       startup_time: status.StartupTime,
//       total_synced: status.TotalSynced || 0,
//       total_errors: status.TotalErrors || 0,
//       uptime_hours: status.UptimeHours || 0,
//       process_id: status.ProcessID,
//       memory_usage_mb: status.MemoryUsageMB || 0,
//       minutes_since_last_seen: status.MinutesSinceLastSeen || 999,
//       health: status.Health
//     }
    
//   } catch (error) {
//     console.error('Cloud sync status error:', error)
//     return {
//       is_running: false,
//       health: 'error',
//       error: `Failed to get cloud sync status: ${error.message}`,
//       school_id: schoolId
//     }
//   }
// }

// async function getSyncAgentStatus() {
//   try {
//     // Read status file created by sync agent (fallback method)
//     const statusData = await fs.readFile(SYNC_STATUS_FILE, 'utf8')
//     const status = JSON.parse(statusData)
    
//     // Check if process is actually running
//     let processRunning = false
//     try {
//       const pidData = await fs.readFile(SYNC_PID_FILE, 'utf8')
//       const pid = parseInt(pidData.trim())
      
//       // Check if process exists (Windows/Unix compatible)
//       if (process.platform === 'win32') {
//         const { exec } = require('child_process')
//         const { promisify } = require('util')
//         const execPromise = promisify(exec)
        
//         try {
//           await execPromise(`tasklist /FI "PID eq ${pid}" | findstr ${pid}`)
//           processRunning = true
//         } catch {
//           processRunning = false
//         }
//       } else {
//         try {
//           process.kill(pid, 0) // Signal 0 just checks if process exists
//           processRunning = true
//         } catch {
//           processRunning = false
//         }
//       }
//     } catch (error) {
//       processRunning = false
//     }

//     // Calculate time since last activity
//     const lastSyncTime = status.last_sync_time ? new Date(status.last_sync_time) : null
//     const timeSinceLastSync = lastSyncTime ? 
//       (Date.now() - lastSyncTime.getTime()) / 1000 / 60 : null // minutes

//     return {
//       ...status,
//       process_running: processRunning,
//       time_since_last_sync_minutes: timeSinceLastSync,
//       status_file_age_minutes: await getFileAgeMinutes(SYNC_STATUS_FILE),
//       health: determineAgentHealth(status, processRunning, timeSinceLastSync)
//     }

//   } catch (error) {
//     return {
//       is_running: false,
//       process_running: false,
//       error: `Failed to read sync agent status: ${error.message}`,
//       health: 'unknown'
//     }
//   }
// }

// async function getDatabaseStatus() {
//   try {
//     const pool = await getPool()
    
//     // Test cloud database connection
//     const cloudTest = await pool.request().query(`
//       SELECT 
//         COUNT(*) as TotalAttendance,
//         MAX(CreatedAt) as LastRecord
//       FROM dbo.Attendance
//       WHERE CreatedAt > DATEADD(day, -7, GETDATE())
//     `)
    
//     const cloudResult = cloudTest.recordset[0]
    
//     // Check recent sync activity (last hour)
//     const recentSync = await pool.request().query(`
//       SELECT COUNT(*) as RecentCount
//       FROM dbo.Attendance
//       WHERE CreatedAt > DATEADD(minute, -60, GETDATE())
//     `)
    
//     return {
//       cloud_connected: true,
//       total_attendance_week: cloudResult.TotalAttendance,
//       last_record: cloudResult.LastRecord,
//       recent_syncs_hour: recentSync.recordset[0].RecentCount,
//       health: 'healthy'
//     }

//   } catch (error) {
//     return {
//       cloud_connected: false,
//       error: error.message,
//       health: 'error'
//     }
//   }
// }

// async function getRecentSyncActivity() {
//   try {
//     const pool = await getPool()
    
//     // Get last 10 attendance records to show recent activity
//     const recentRecords = await pool.request().query(`
//       SELECT TOP 10
//         a.AttendanceID,
//         a.StudentID,
//         a.ScanTime,
//         a.Status,
//         a.CreatedAt,
//         s.Name as StudentName
//       FROM dbo.Attendance a
//       LEFT JOIN Students s ON a.StudentID = s.StudentID
//       ORDER BY a.CreatedAt DESC
//     `)

//     // Get activity summary by hour for last 24 hours
//     const hourlySummary = await pool.request().query(`
//       SELECT 
//         DATEPART(hour, CreatedAt) as Hour,
//         COUNT(*) as Count,
//         MIN(CreatedAt) as FirstRecord,
//         MAX(CreatedAt) as LastRecord
//       FROM dbo.Attendance
//       WHERE CreatedAt > DATEADD(hour, -24, GETDATE())
//       GROUP BY DATEPART(hour, CreatedAt)
//       ORDER BY Hour DESC
//     `)

//     return {
//       recent_records: recentRecords.recordset.map(record => ({
//         id: record.AttendanceID,
//         student_id: record.StudentID,
//         student_name: record.StudentName,
//         scan_time: record.ScanTime,
//         status: record.Status,
//         created_at: record.CreatedAt
//       })),
//       hourly_activity: hourlySummary.recordset,
//       total_today: await getTodayCount(pool)
//     }

//   } catch (error) {
//     return {
//       recent_records: [],
//       hourly_activity: [],
//       error: error.message
//     }
//   }
// }

// async function getTodayCount(pool) {
//   try {
//     const todayResult = await pool.request().query(`
//       SELECT COUNT(*) as TodayCount
//       FROM dbo.Attendance
//       WHERE CAST(CreatedAt as DATE) = CAST(GETDATE() as DATE)
//     `)
//     return todayResult.recordset[0].TodayCount
//   } catch {
//     return 0
//   }
// }

// async function getFileAgeMinutes(filePath) {
//   try {
//     const stats = await fs.stat(filePath)
//     return (Date.now() - stats.mtime.getTime()) / 1000 / 60
//   } catch {
//     return null
//   }
// }

// function determineAgentHealth(status, processRunning, timeSinceLastSync) {
//   if (!processRunning) return 'stopped'
//   if (!status.is_running) return 'stopped'
//   if (status.current_status === 'error') return 'error'
//   if (status.current_status === 'crashed') return 'crashed'
  
//   // Check if it's been too long since last sync
//   if (timeSinceLastSync !== null && timeSinceLastSync > 120) { // 2 hours
//     return 'stale'
//   }
  
//   // Check error rate
//   if (status.total_synced > 0) {
//     const errorRate = status.total_errors / (status.total_synced + status.total_errors)
//     if (errorRate > 0.1) return 'degraded' // More than 10% errors
//   }
  
//   return 'healthy'
// }

// function determineOverallHealthFromCloud(syncStatus, dbStatus, recentActivity) {
//   if (syncStatus.health === 'error' || dbStatus.health === 'error') return 'error'
//   if (syncStatus.health === 'offline') return 'offline'
//   if (syncStatus.health === 'stale') return 'stale'
  
//   // Check error rate
//   if (syncStatus.total_synced > 0) {
//     const errorRate = syncStatus.total_errors / (syncStatus.total_synced + syncStatus.total_errors)
//     if (errorRate > 0.1) return 'degraded'
//   }
  
//   if (syncStatus.health === 'healthy' && dbStatus.health === 'healthy') {
//     const hasRecentActivity = recentActivity.total_today > 0 || recentActivity.recent_records.length > 0
//     return hasRecentActivity ? 'healthy' : 'idle'
//   }
  
//   return 'unknown'
// }


// routes/sync-status.js - Monitor sync agent health
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { getPool, sql } = require('../lib/database');

const SYNC_STATUS_FILE = path.join(process.cwd(), 'sync_status.json');
const SYNC_PID_FILE = path.join(process.cwd(), 'sync_agent.pid');

// GET - Fetch sync status
router.get('/', async (req, res) => {
  try {
    // Check if request is for all schools or specific school
    const { school_id, all_schools } = req.query;

    if (all_schools === 'true') {
      // Return status for all schools
      const allSchoolsStatus = await getAllSchoolsSyncStatus();
      res.json({
        timestamp: new Date().toISOString(),
        type: 'all_schools',
        schools: allSchoolsStatus
      });
    } else {
      // Return status for specific school (existing functionality)
      const targetSchoolId = school_id ? parseInt(school_id) : 2; // Default to school 2
      const cloudSyncStatus = await getCloudSyncStatus(targetSchoolId);
      const dbStatus = await getDatabaseStatus();
      const recentActivity = await getRecentSyncActivity();

      res.json({
        timestamp: new Date().toISOString(),
        type: 'single_school',
        syncAgent: cloudSyncStatus,
        database: dbStatus,
        recentActivity,
        overallHealth: determineOverallHealthFromCloud(cloudSyncStatus, dbStatus, recentActivity)
      });
    }

  } catch (error) {
    console.error('Sync status API error:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString(),
      overallHealth: 'error'
    });
  }
});

async function getAllSchoolsSyncStatus() {
  try {
    const pool = await getPool();
    
    // Monitor all sync agents across schools with comprehensive details
    const allSchoolsResult = await pool.request().query(`
      SELECT 
        s.SchoolID,
        s.Name as SchoolName,
        s.Location,
        sas.Status,
        sas.LastHeartbeat,
        sas.StartupTime,
        sas.ShutdownTime,
        sas.ProcessID,
        sas.TotalSynced,
        sas.TotalErrors,
        sas.UptimeHours,
        sas.MemoryUsageMB,
        CASE 
            WHEN sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) THEN 'Online'
            WHEN sas.LastHeartbeat > DATEADD(MINUTE, -30, GETDATE()) THEN 'Warning'  
            WHEN sas.LastHeartbeat IS NULL THEN 'Never Connected'
            ELSE 'Offline'
        END as ConnectionStatus,
        DATEDIFF(MINUTE, sas.LastHeartbeat, GETDATE()) as MinutesSinceLastSeen,
        CASE 
            WHEN sas.TotalSynced + sas.TotalErrors > 0 
            THEN CAST((sas.TotalErrors * 100.0 / (sas.TotalSynced + sas.TotalErrors)) AS DECIMAL(5,2))
            ELSE 0 
        END as ErrorRate,
        -- Get recent activity for each school
        (SELECT COUNT(*) FROM dbo.Attendance a WHERE a.SchoolID = s.SchoolID AND a.CreatedAt > DATEADD(hour, -1, GETDATE())) as RecentSyncsHour,
        (SELECT COUNT(*) FROM dbo.Attendance a WHERE a.SchoolID = s.SchoolID AND CAST(a.CreatedAt as DATE) = CAST(GETDATE() as DATE)) as SyncsToday
      FROM Schools s
      LEFT JOIN SyncAgentStatus sas ON s.SchoolID = sas.SchoolID
      ORDER BY 
        CASE 
            WHEN sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) THEN 1  -- Online first
            WHEN sas.LastHeartbeat > DATEADD(MINUTE, -30, GETDATE()) THEN 2  -- Warning second
            WHEN sas.LastHeartbeat IS NULL THEN 4                           -- Never connected last
            ELSE 3                                                          -- Offline third
        END,
        sas.LastHeartbeat DESC
    `);
    
    return allSchoolsResult.recordset.map(school => ({
      school_id: school.SchoolID,
      school_name: school.SchoolName,
      location: school.Location,
      sync_agent_status: school.Status,
      last_heartbeat: school.LastHeartbeat,
      startup_time: school.StartupTime,
      shutdown_time: school.ShutdownTime,
      process_id: school.ProcessID,
      total_synced: school.TotalSynced || 0,
      total_errors: school.TotalErrors || 0,
      uptime_hours: school.UptimeHours || 0,
      memory_usage_mb: school.MemoryUsageMB || 0,
      connection_status: school.ConnectionStatus,
      minutes_since_last_seen: school.MinutesSinceLastSeen,
      error_rate: school.ErrorRate || 0,
      recent_syncs_hour: school.RecentSyncsHour || 0,
      syncs_today: school.SyncsToday || 0,
      is_running: school.ConnectionStatus === 'Online',
      health: school.ConnectionStatus.toLowerCase()
    }));
    
  } catch (error) {
    console.error('Error getting all schools sync status:', error);
    throw new Error(`Failed to get all schools status: ${error.message}`);
  }
}

async function getCloudSyncStatus(schoolId = 2) {
  try {
    const pool = await getPool();
    
    // Check sync agent status from cloud heartbeat for specific school
    const syncAgentStatus = await pool.request()
      .input('schoolId', sql.Int, schoolId)
      .query(`
        SELECT 
          sas.SchoolID,
          s.Name as SchoolName,
          sas.Status,
          sas.LastHeartbeat,
          sas.StartupTime,
          sas.TotalSynced,
          sas.TotalErrors,
          sas.UptimeHours,
          sas.ProcessID,
          sas.MemoryUsageMB,
          CASE 
            WHEN sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) THEN 'healthy'
            WHEN sas.LastHeartbeat > DATEADD(MINUTE, -30, GETDATE()) THEN 'stale'
            ELSE 'offline'
          END as Health,
          DATEDIFF(MINUTE, sas.LastHeartbeat, GETDATE()) as MinutesSinceLastSeen
        FROM Schools s
        LEFT JOIN SyncAgentStatus sas ON s.SchoolID = sas.SchoolID
        WHERE s.SchoolID = @schoolId
      `);
    
    const status = syncAgentStatus.recordset[0];
    
    if (!status || !status.LastHeartbeat) {
      return {
        is_running: false,
        health: 'offline',
        error: 'No heartbeat data found - sync agent may not be running or heartbeat table may not exist',
        school_id: schoolId,
        school_name: status ? status.SchoolName : 'Unknown School'
      };
    }
    
    return {
      is_running: status.Health === 'healthy',
      school_id: status.SchoolID,
      school_name: status.SchoolName,
      current_status: status.Status,
      last_heartbeat: status.LastHeartbeat,
      startup_time: status.StartupTime,
      total_synced: status.TotalSynced || 0,
      total_errors: status.TotalErrors || 0,
      uptime_hours: status.UptimeHours || 0,
      process_id: status.ProcessID,
      memory_usage_mb: status.MemoryUsageMB || 0,
      minutes_since_last_seen: status.MinutesSinceLastSeen || 999,
      health: status.Health
    };
    
  } catch (error) {
    console.error('Cloud sync status error:', error);
    return {
      is_running: false,
      health: 'error',
      error: `Failed to get cloud sync status: ${error.message}`,
      school_id: schoolId
    };
  }
}

async function getSyncAgentStatus() {
  try {
    // Read status file created by sync agent (fallback method)
    const statusData = await fs.readFile(SYNC_STATUS_FILE, 'utf8');
    const status = JSON.parse(statusData);
    
    // Check if process is actually running
    let processRunning = false;
    try {
      const pidData = await fs.readFile(SYNC_PID_FILE, 'utf8');
      const pid = parseInt(pidData.trim());
      
      // Check if process exists (Windows/Unix compatible)
      if (process.platform === 'win32') {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execPromise = promisify(exec);
        
        try {
          await execPromise(`tasklist /FI "PID eq ${pid}" | findstr ${pid}`);
          processRunning = true;
        } catch {
          processRunning = false;
        }
      } else {
        try {
          process.kill(pid, 0); // Signal 0 just checks if process exists
          processRunning = true;
        } catch {
          processRunning = false;
        }
      }
    } catch (error) {
      processRunning = false;
    }

    // Calculate time since last activity
    const lastSyncTime = status.last_sync_time ? new Date(status.last_sync_time) : null;
    const timeSinceLastSync = lastSyncTime ? 
      (Date.now() - lastSyncTime.getTime()) / 1000 / 60 : null; // minutes

    return {
      ...status,
      process_running: processRunning,
      time_since_last_sync_minutes: timeSinceLastSync,
      status_file_age_minutes: await getFileAgeMinutes(SYNC_STATUS_FILE),
      health: determineAgentHealth(status, processRunning, timeSinceLastSync)
    };

  } catch (error) {
    return {
      is_running: false,
      process_running: false,
      error: `Failed to read sync agent status: ${error.message}`,
      health: 'unknown'
    };
  }
}

async function getDatabaseStatus() {
  try {
    const pool = await getPool();
    
    // Test cloud database connection
    const cloudTest = await pool.request().query(`
      SELECT 
        COUNT(*) as TotalAttendance,
        MAX(CreatedAt) as LastRecord
      FROM dbo.Attendance
      WHERE CreatedAt > DATEADD(day, -7, GETDATE())
    `);
    
    const cloudResult = cloudTest.recordset[0];
    
    // Check recent sync activity (last hour)
    const recentSync = await pool.request().query(`
      SELECT COUNT(*) as RecentCount
      FROM dbo.Attendance
      WHERE CreatedAt > DATEADD(minute, -60, GETDATE())
    `);
    
    return {
      cloud_connected: true,
      total_attendance_week: cloudResult.TotalAttendance,
      last_record: cloudResult.LastRecord,
      recent_syncs_hour: recentSync.recordset[0].RecentCount,
      health: 'healthy'
    };

  } catch (error) {
    return {
      cloud_connected: false,
      error: error.message,
      health: 'error'
    };
  }
}

async function getRecentSyncActivity() {
  try {
    const pool = await getPool();
    
    // Get last 10 attendance records to show recent activity
    const recentRecords = await pool.request().query(`
      SELECT TOP 10
        a.AttendanceID,
        a.StudentID,
        a.ScanTime,
        a.Status,
        a.CreatedAt,
        s.Name as StudentName
      FROM dbo.Attendance a
      LEFT JOIN Students s ON a.StudentID = s.StudentID
      ORDER BY a.CreatedAt DESC
    `);

    // Get activity summary by hour for last 24 hours
    const hourlySummary = await pool.request().query(`
      SELECT 
        DATEPART(hour, CreatedAt) as Hour,
        COUNT(*) as Count,
        MIN(CreatedAt) as FirstRecord,
        MAX(CreatedAt) as LastRecord
      FROM dbo.Attendance
      WHERE CreatedAt > DATEADD(hour, -24, GETDATE())
      GROUP BY DATEPART(hour, CreatedAt)
      ORDER BY Hour DESC
    `);

    return {
      recent_records: recentRecords.recordset.map(record => ({
        id: record.AttendanceID,
        student_id: record.StudentID,
        student_name: record.StudentName,
        scan_time: record.ScanTime,
        status: record.Status,
        created_at: record.CreatedAt
      })),
      hourly_activity: hourlySummary.recordset,
      total_today: await getTodayCount(pool)
    };

  } catch (error) {
    return {
      recent_records: [],
      hourly_activity: [],
      error: error.message
    };
  }
}

async function getTodayCount(pool) {
  try {
    const todayResult = await pool.request().query(`
      SELECT COUNT(*) as TodayCount
      FROM dbo.Attendance
      WHERE CAST(CreatedAt as DATE) = CAST(GETDATE() as DATE)
    `);
    return todayResult.recordset[0].TodayCount;
  } catch {
    return 0;
  }
}

async function getFileAgeMinutes(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return (Date.now() - stats.mtime.getTime()) / 1000 / 60;
  } catch {
    return null;
  }
}

function determineAgentHealth(status, processRunning, timeSinceLastSync) {
  if (!processRunning) return 'stopped';
  if (!status.is_running) return 'stopped';
  if (status.current_status === 'error') return 'error';
  if (status.current_status === 'crashed') return 'crashed';
  
  // Check if it's been too long since last sync
  if (timeSinceLastSync !== null && timeSinceLastSync > 120) { // 2 hours
    return 'stale';
  }
  
  // Check error rate
  if (status.total_synced > 0) {
    const errorRate = status.total_errors / (status.total_synced + status.total_errors);
    if (errorRate > 0.1) return 'degraded'; // More than 10% errors
  }
  
  return 'healthy';
}

function determineOverallHealthFromCloud(syncStatus, dbStatus, recentActivity) {
  if (syncStatus.health === 'error' || dbStatus.health === 'error') return 'error';
  if (syncStatus.health === 'offline') return 'offline';
  if (syncStatus.health === 'stale') return 'stale';
  
  // Check error rate
  if (syncStatus.total_synced > 0) {
    const errorRate = syncStatus.total_errors / (syncStatus.total_synced + syncStatus.total_errors);
    if (errorRate > 0.1) return 'degraded';
  }
  
  if (syncStatus.health === 'healthy' && dbStatus.health === 'healthy') {
    const hasRecentActivity = recentActivity.total_today > 0 || recentActivity.recent_records.length > 0;
    return hasRecentActivity ? 'healthy' : 'idle';
  }
  
  return 'unknown';
}

module.exports = router;