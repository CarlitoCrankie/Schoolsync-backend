// const { getPool, sql } = require('../../lib/database')
// const bcrypt = require('bcryptjs')

// export default async function handler(req, res) {
//   res.setHeader('Access-Control-Allow-Origin', '*')
//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

//   if (req.method === 'OPTIONS') {
//     res.status(200).end()
//     return
//   }

//   try {
//     switch (req.method) {
//       case 'GET':
//         return await handleGetSchools(req, res)
//       case 'POST':
//         return await handleCreateSchool(req, res)
//       case 'PUT':
//         return await handleUpdateSchool(req, res)
//       case 'DELETE':
//         return await handleDeleteSchool(req, res)
//       default:
//         return res.status(405).json({ error: 'Method not allowed' })
//     }
//   } catch (error) {
//     console.error('Schools API error:', error)
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       timestamp: new Date().toISOString()
//     })
//   }
// }

// // Helper function to generate random password
// function generateRandomPassword(length = 12) {
//   const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
//   let password = ""
//   for (let i = 0; i < length; i++) {
//     password += charset.charAt(Math.floor(Math.random() * charset.length))
//   }
//   return password
// }

// // Helper function to format time from SQL TIME to HH:MM
// function formatTime(sqlTime) {
//   if (!sqlTime) return null
  
//   // SQL Server returns time as a string like "08:30:00.0000000"
//   const timeStr = sqlTime.toString()
//   const timeParts = timeStr.split(':')
  
//   if (timeParts.length >= 2) {
//     return `${timeParts[0].padStart(2, '0')}:${timeParts[1].padStart(2, '0')}`
//   }
  
//   return timeStr
// }

// // GET - Fetch schools with optional filters
// async function handleGetSchools(req, res) {
//   const pool = await getPool()
//   const request = pool.request()
  
//   const { school_id, company_id, include_stats, status } = req.query

//   let whereClause = 'WHERE 1=1'
  
//   if (school_id) {
//     whereClause += ' AND s.SchoolID = @schoolId'
//     request.input('schoolId', sql.Int, parseInt(school_id))
//   }
  
//   if (status) {
//     whereClause += ' AND s.Status = @status'
//     request.input('status', sql.NVarChar(20), status)
//   }

//   try {
//     let query = `
//       SELECT 
//         s.SchoolID,
//         s.Name,
//         s.Location,
//         s.MachineID,
//         s.Status,
//         s.CreatedAt,
//         s.UpdatedAt
//     `
    
//     if (include_stats === 'true') {
//       query += `,
//         COUNT(DISTINCT st.StudentID) as TotalStudents,
//         COUNT(DISTINCT CASE WHEN st.IsActive = 1 THEN st.StudentID END) as ActiveStudents,
//         COUNT(a.AttendanceID) as TotalAttendance,
//         COUNT(CASE WHEN CAST(a.CreatedAt as DATE) = CAST(GETDATE() as DATE) THEN a.AttendanceID END) as TodayAttendance,
//         sas.Status as SyncStatus,
//         sas.LastHeartbeat,
//         CASE 
//           WHEN sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) THEN 'Online'
//           WHEN sas.LastHeartbeat > DATEADD(MINUTE, -30, GETDATE()) THEN 'Warning'  
//           ELSE 'Offline'
//         END as SyncConnectionStatus,
//         u.Username as AdminUsername,
//         sts.SchoolStartTime,
//         sts.SchoolEndTime, 
//         sts.LateArrivalTime,
//         sts.EarlyDepartureTime,
//         sts.Timezone,
//         CASE WHEN sts.SettingID IS NULL THEN 1 ELSE 0 END as UsingDefaultTimes
//       `
//     }

//     query += `
//       FROM Schools s
//     `
    
//     if (include_stats === 'true') {
//       query += `
//         LEFT JOIN Students st ON s.SchoolID = st.SchoolID
//         LEFT JOIN dbo.Attendance a ON st.StudentID = a.StudentID
//         LEFT JOIN SyncAgentStatus sas ON s.SchoolID = sas.SchoolID
//         LEFT JOIN SchoolTimeSettings sts ON s.SchoolID = sts.SchoolID
//         LEFT JOIN Users u ON s.SchoolID = u.SchoolID AND u.Role = 'school_admin' AND u.IsActive = 1
//       `
//     }
    
//     query += ` ${whereClause}`
    
//     if (include_stats === 'true') {
//       query += ` GROUP BY s.SchoolID, s.Name, s.Location, s.MachineID, s.Status, s.CreatedAt, s.UpdatedAt, sas.Status, sas.LastHeartbeat, u.Username, sts.SettingID, sts.SchoolStartTime, sts.SchoolEndTime, sts.LateArrivalTime, sts.EarlyDepartureTime, sts.Timezone`
//     }
    
//     query += ` ORDER BY s.Name`

//     const result = await request.query(query)

//     const schools = result.recordset.map(row => ({
//       school_id: row.SchoolID,
//       name: row.Name,
//       location: row.Location,
//       machine_id: row.MachineID,
//       status: row.Status,
//       created_at: row.CreatedAt,
//       updated_at: row.UpdatedAt,
//       ...(include_stats === 'true' && {
//         stats: {
//           total_students: row.TotalStudents || 0,
//           active_students: row.ActiveStudents || 0,
//           total_attendance: row.TotalAttendance || 0,
//           today_attendance: row.TodayAttendance || 0,
//           sync_status: row.SyncStatus,
//           sync_connection_status: row.SyncConnectionStatus,
//           last_heartbeat: row.LastHeartbeat,
//           admin_username: row.AdminUsername
//         },
//         time_settings: {
//           school_start_time: formatTime(row.SchoolStartTime) || '08:00',
//           school_end_time: formatTime(row.SchoolEndTime) || '15:00',
//           late_arrival_time: formatTime(row.LateArrivalTime) || '08:30',
//           early_departure_time: formatTime(row.EarlyDepartureTime) || '14:00',
//           timezone: row.Timezone || 'Africa/Accra',
//           using_default_times: Boolean(row.UsingDefaultTimes)
//         }
//       })
//     }))

//     res.json({
//       success: true,
//       data: schools,
//       total: schools.length,
//       timestamp: new Date().toISOString()
//     })

//   } catch (error) {
//     console.error('Error fetching schools:', error)
//     throw error
//   }
// }

// // POST - Create new school with admin user and default time settings
// async function handleCreateSchool(req, res) {
//   const pool = await getPool()
//   const transaction = pool.transaction()
  
//   const { 
//     name, 
//     location, 
//     machineId, 
//     status = 'active',
//     adminUsername,
//     adminPassword,
//     adminEmail
//   } = req.body

//   if (!name || !location) {
//     return res.status(400).json({
//       success: false,
//       error: 'School name and location are required'
//     })
//   }

//   try {
//     await transaction.begin()

//     // Check if school name already exists
//     const checkRequest = pool.request()
//     checkRequest.input('checkName', sql.NVarChar(255), name.trim())
//     const existingSchool = await checkRequest.query(`
//       SELECT SchoolID FROM Schools WHERE Name = @checkName
//     `)

//     if (existingSchool.recordset.length > 0) {
//       await transaction.rollback()
//       return res.status(409).json({
//         success: false,
//         error: 'A school with this name already exists'
//       })
//     }

//     // Insert new school
//     const schoolRequest = transaction.request()
//     schoolRequest.input('name', sql.NVarChar(255), name.trim())
//     schoolRequest.input('location', sql.NVarChar(255), location.trim())
//     schoolRequest.input('machineId', sql.NVarChar(50), machineId || null)
//     schoolRequest.input('status', sql.NVarChar(20), status)

//     const insertResult = await schoolRequest.query(`
//       INSERT INTO Schools (Name, Location, MachineID, Status, CreatedAt, UpdatedAt)
//       OUTPUT INSERTED.SchoolID, INSERTED.Name, INSERTED.Location, INSERTED.Status
//       VALUES (@name, @location, @machineId, @status, GETDATE(), GETDATE())
//     `)

//     const newSchool = insertResult.recordset[0]
//     const schoolId = newSchool.SchoolID

//     // Generate admin credentials
//     const username = adminUsername || `school${schoolId}admin`
//     const password = adminPassword || generateRandomPassword()
//     const email = adminEmail || ''

//     // Check if username already exists
//     const userCheckRequest = transaction.request()
//     userCheckRequest.input('checkUsername', sql.NVarChar(100), username)
//     const existingUser = await userCheckRequest.query(`
//       SELECT UserID FROM Users WHERE Username = @checkUsername
//     `)

//     if (existingUser.recordset.length > 0) {
//       await transaction.rollback()
//       return res.status(409).json({
//         success: false,
//         error: `Username "${username}" already exists. Please choose a different username.`
//       })
//     }

//     // Create admin user
//     const passwordHash = await bcrypt.hash(password, 10)
    
//     const userRequest = transaction.request()
//     userRequest.input('username', sql.NVarChar(100), username)
//     userRequest.input('passwordHash', sql.NVarChar(255), passwordHash)
//     userRequest.input('role', sql.NVarChar(50), 'school_admin')
//     userRequest.input('schoolId', sql.Int, schoolId)
//     userRequest.input('email', sql.NVarChar(255), email)

//     await userRequest.query(`
//       INSERT INTO Users (Username, PasswordHash, Role, SchoolID, Email, IsActive, CreatedAt)
//       VALUES (@username, @passwordHash, @role, @schoolId, @email, 1, GETDATE())
//     `)

//    // In handleCreateSchool function, replace the time settings section with:
// const timeSettingsRequest = transaction.request()
// timeSettingsRequest.input('newSchoolId', sql.Int, schoolId)
// timeSettingsRequest.input('schoolStartTime', sql.NVarChar(8), '08:00:00')  // Use NVarChar instead
// timeSettingsRequest.input('schoolEndTime', sql.NVarChar(8), '15:00:00')
// timeSettingsRequest.input('lateArrivalTime', sql.NVarChar(8), '08:30:00')
// timeSettingsRequest.input('earlyDepartureTime', sql.NVarChar(8), '14:00:00')
// timeSettingsRequest.input('timezone', sql.NVarChar(50), 'Africa/Accra')

// await timeSettingsRequest.query(`
//   INSERT INTO SchoolTimeSettings (
//     SchoolID, 
//     SchoolStartTime, 
//     SchoolEndTime, 
//     LateArrivalTime, 
//     EarlyDepartureTime, 
//     Timezone,
//     CreatedAt,
//     UpdatedAt
//   )
//   VALUES (
//     @newSchoolId, 
//     CAST(@schoolStartTime AS TIME), 
//     CAST(@schoolEndTime AS TIME), 
//     CAST(@lateArrivalTime AS TIME), 
//     CAST(@earlyDepartureTime AS TIME), 
//     @timezone,
//     GETDATE(),
//     GETDATE()
//   )
// `)
//     await transaction.commit()

//     res.json({
//       success: true,
//       message: 'School, admin user, and default time settings created successfully',
//       data: {
//         school: {
//           school_id: newSchool.SchoolID,
//           name: newSchool.Name,
//           location: newSchool.Location,
//           status: newSchool.Status
//         },
//         admin_credentials: {
//           username: username,
//           password: password,
//           email: email,
//           school_id: schoolId
//         },
//         time_settings: {
//           school_start_time: '08:00',
//           school_end_time: '15:00',
//           late_arrival_time: '08:30',
//           early_departure_time: '14:00',
//           timezone: 'Africa/Accra'
//         }
//       },
//       timestamp: new Date().toISOString()
//     })

//   } catch (error) {
//     await transaction.rollback()
//     console.error('Error creating school:', error)
//     throw error
//   }
// }

// // PUT - Update school
// async function handleUpdateSchool(req, res) {
//   const pool = await getPool()
//   const request = pool.request()
  
//   const { school_id } = req.query
//   const { name, location, machineId, status } = req.body

//   if (!school_id) {
//     return res.status(400).json({
//       success: false,
//       error: 'School ID is required'
//     })
//   }

//   try {
//     // Check if school exists
//     request.input('schoolId', sql.Int, parseInt(school_id))
//     const existingSchool = await request.query(`
//       SELECT SchoolID, Name FROM Schools WHERE SchoolID = @schoolId
//     `)

//     if (existingSchool.recordset.length === 0) {
//       return res.status(404).json({
//         success: false,
//         error: 'School not found'
//       })
//     }

//     // Build update query dynamically based on provided fields
//     const updates = []
//     if (name) {
//       updates.push('Name = @name')
//       request.input('name', sql.NVarChar(255), name.trim())
//     }
//     if (location) {
//       updates.push('Location = @location')
//       request.input('location', sql.NVarChar(255), location.trim())
//     }
//     if (machineId !== undefined) {
//       updates.push('MachineID = @machineId')
//       request.input('machineId', sql.NVarChar(50), machineId || null)
//     }
//     if (status) {
//       updates.push('Status = @status')
//       request.input('status', sql.NVarChar(20), status)
//     }

//     if (updates.length === 0) {
//       return res.status(400).json({
//         success: false,
//         error: 'No fields provided for update'
//       })
//     }

//     updates.push('UpdatedAt = GETDATE()')

//     const updateQuery = `
//       UPDATE Schools 
//       SET ${updates.join(', ')}
//       OUTPUT INSERTED.SchoolID, INSERTED.Name, INSERTED.Location, INSERTED.Status
//       WHERE SchoolID = @schoolId
//     `

//     const updateResult = await request.query(updateQuery)
//     const updatedSchool = updateResult.recordset[0]

//     res.json({
//       success: true,
//       message: 'School updated successfully',
//       data: {
//         school_id: updatedSchool.SchoolID,
//         name: updatedSchool.Name,
//         location: updatedSchool.Location,
//         status: updatedSchool.Status
//       },
//       timestamp: new Date().toISOString()
//     })

//   } catch (error) {
//     console.error('Error updating school:', error)
//     throw error
//   }
// }

// // DELETE - Delete/disable school (soft delete recommended)
// // async function handleDeleteSchool(req, res) {
// //   const pool = await getPool()
// //   const request = pool.request()
  
// //   const { school_id } = req.query
// //   const { force_delete = false } = req.body

// //   if (!school_id) {
// //     return res.status(400).json({
// //       success: false,
// //       error: 'School ID is required'
// //     })
// //   }

// //   try {
// //     request.input('schoolId', sql.Int, parseInt(school_id))

// //     // Check if school exists and has students/attendance records
// //     const schoolCheck = await request.query(`
// //       SELECT 
// //         s.SchoolID,
// //         s.Name,
// //         COUNT(DISTINCT st.StudentID) as StudentCount,
// //         COUNT(a.AttendanceID) as AttendanceCount
// //       FROM Schools s
// //       LEFT JOIN Students st ON s.SchoolID = st.SchoolID
// //       LEFT JOIN dbo.Attendance a ON st.StudentID = a.StudentID
// //       WHERE s.SchoolID = @schoolId
// //       GROUP BY s.SchoolID, s.Name
// //     `)

// //     if (schoolCheck.recordset.length === 0) {
// //       return res.status(404).json({
// //         success: false,
// //         error: 'School not found'
// //       })
// //     }

// //     const school = schoolCheck.recordset[0]
// //     const hasData = school.StudentCount > 0 || school.AttendanceCount > 0

// //     if (hasData && !force_delete) {
// //       // Soft delete - just disable the school and its admin users
// //       await request.query(`
// //         UPDATE Schools 
// //         SET Status = 'inactive', UpdatedAt = GETDATE()
// //         WHERE SchoolID = @schoolId
// //       `)

// //       await request.query(`
// //         UPDATE Users 
// //         SET IsActive = 0
// //         WHERE SchoolID = @schoolId AND Role = 'school_admin'
// //       `)

// //       return res.json({
// //         success: true,
// //         action: 'soft_delete',
// //         message: `School "${school.Name}" has been disabled`,
// //         note: `This school has ${school.StudentCount} students and ${school.AttendanceCount} attendance records. It has been disabled instead of deleted.`,
// //         data: { school_id: school.SchoolID, name: school.Name }
// //       })
// //     }

// //     if (force_delete) {
// //       // Hard delete - remove all related data including time settings
// //       await request.query(`DELETE FROM dbo.Attendance WHERE StudentID IN (SELECT StudentID FROM Students WHERE SchoolID = @schoolId)`)
// //       await request.query(`DELETE FROM Parents WHERE StudentID IN (SELECT StudentID FROM Students WHERE SchoolID = @schoolId)`)
// //       await request.query(`DELETE FROM SyncAgentStatus WHERE SchoolID = @schoolId`)
// //       await request.query(`DELETE FROM SchoolTimeSettings WHERE SchoolID = @schoolId`)
// //       await request.query(`DELETE FROM Users WHERE SchoolID = @schoolId`)
// //       await request.query(`DELETE FROM Students WHERE SchoolID = @schoolId`)
// //       await request.query(`DELETE FROM Schools WHERE SchoolID = @schoolId`)

// //       return res.json({
// //         success: true,
// //         action: 'hard_delete',
// //         message: `School "${school.Name}" and all related data has been permanently deleted`,
// //         data: { school_id: school.SchoolID, name: school.Name }
// //       })
// //     }

// //     // No data, safe to delete school, admin users, and time settings
// //     await request.query(`DELETE FROM SchoolTimeSettings WHERE SchoolID = @schoolId`)
// //     await request.query(`DELETE FROM Users WHERE SchoolID = @schoolId`)
// //     await request.query(`DELETE FROM Schools WHERE SchoolID = @schoolId`)

// //     res.json({
// //       success: true,
// //       action: 'delete',
// //       message: `School "${school.Name}" has been deleted`,
// //       data: { school_id: school.SchoolID, name: school.Name }
// //     })

// //   } catch (error) {
// //     console.error('Error deleting school:', error)
// //     throw error
// //   }
// // }
// async function handleDeleteSchool(req, res) {
//   const pool = await getPool()
//   const request = pool.request()
  
//   const { school_id } = req.query
//   const { force_delete = false } = req.body

//   if (!school_id) {
//     return res.status(400).json({
//       success: false,
//       error: 'School ID is required'
//     })
//   }

//   try {
//     request.input('schoolId', sql.Int, parseInt(school_id))

//     // Check if school exists and has students/attendance records
//     const schoolCheck = await request.query(`
//       SELECT 
//         s.SchoolID,
//         s.Name,
//         COUNT(DISTINCT st.StudentID) as StudentCount,
//         COUNT(a.AttendanceID) as AttendanceCount
//       FROM Schools s
//       LEFT JOIN Students st ON s.SchoolID = st.SchoolID
//       LEFT JOIN dbo.Attendance a ON st.StudentID = a.StudentID
//       WHERE s.SchoolID = @schoolId
//       GROUP BY s.SchoolID, s.Name
//     `)

//     if (schoolCheck.recordset.length === 0) {
//       return res.status(404).json({
//         success: false,
//         error: 'School not found'
//       })
//     }

//     const school = schoolCheck.recordset[0]
//     const hasData = school.StudentCount > 0 || school.AttendanceCount > 0

//     if (hasData && !force_delete) {
//       // Enhanced soft delete - disable school AND remove all student data
//       await request.query(`DELETE FROM dbo.Attendance WHERE StudentID IN (SELECT StudentID FROM Students WHERE SchoolID = @schoolId)`)
//       await request.query(`DELETE FROM Parents WHERE StudentID IN (SELECT StudentID FROM Students WHERE SchoolID = @schoolId)`)
//       await request.query(`DELETE FROM Students WHERE SchoolID = @schoolId`)
//       await request.query(`DELETE FROM SyncAgentStatus WHERE SchoolID = @schoolId`)
//       await request.query(`DELETE FROM SchoolTimeSettings WHERE SchoolID = @schoolId`)
//       await request.query(`UPDATE Schools SET Status = 'inactive', UpdatedAt = GETDATE() WHERE SchoolID = @schoolId`)
//       await request.query(`UPDATE Users SET IsActive = 0 WHERE SchoolID = @schoolId AND Role = 'school_admin'`)

//       return res.json({
//         success: true,
//         action: 'soft_delete_with_cleanup',
//         message: `School "${school.Name}" has been disabled and all student data removed`,
//         note: `This school had ${school.StudentCount} students and ${school.AttendanceCount} attendance records. All data has been removed but school record preserved for historical purposes.`,
//         data: { school_id: school.SchoolID, name: school.Name }
//       })
//     }

//     if (force_delete) {
//       // Hard delete - remove all related data including the school record itself
//       await request.query(`DELETE FROM dbo.Attendance WHERE StudentID IN (SELECT StudentID FROM Students WHERE SchoolID = @schoolId)`)
//       await request.query(`DELETE FROM Parents WHERE StudentID IN (SELECT StudentID FROM Students WHERE SchoolID = @schoolId)`)
//       await request.query(`DELETE FROM SyncAgentStatus WHERE SchoolID = @schoolId`)
//       await request.query(`DELETE FROM SchoolTimeSettings WHERE SchoolID = @schoolId`)
//       await request.query(`DELETE FROM Users WHERE SchoolID = @schoolId`)
//       await request.query(`DELETE FROM Students WHERE SchoolID = @schoolId`)
//       await request.query(`DELETE FROM Schools WHERE SchoolID = @schoolId`)

//       return res.json({
//         success: true,
//         action: 'hard_delete',
//         message: `School "${school.Name}" and all related data has been permanently deleted`,
//         data: { school_id: school.SchoolID, name: school.Name }
//       })
//     }

//     // No data, safe to delete school, admin users, and time settings
//     await request.query(`DELETE FROM SchoolTimeSettings WHERE SchoolID = @schoolId`)
//     await request.query(`DELETE FROM Users WHERE SchoolID = @schoolId`)
//     await request.query(`DELETE FROM Schools WHERE SchoolID = @schoolId`)

//     res.json({
//       success: true,
//       action: 'delete',
//       message: `School "${school.Name}" has been deleted`,
//       data: { school_id: school.SchoolID, name: school.Name }
//     })

//   } catch (error) {
//     console.error('Error deleting school:', error)
//     throw error
//   }
// }


// routes/schools.js
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../lib/database');
const bcrypt = require('bcryptjs');

// Helper function to generate random password
function generateRandomPassword(length = 12) {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// Helper function to format time from SQL TIME to HH:MM
function formatTime(sqlTime) {
  if (!sqlTime) return null;
  
  const timeStr = sqlTime.toString();
  const timeParts = timeStr.split(':');
  
  if (timeParts.length >= 2) {
    return `${timeParts[0].padStart(2, '0')}:${timeParts[1].padStart(2, '0')}`;
  }
  
  return timeStr;
}

// GET - Fetch schools with optional filters
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    
    const { school_id, company_id, include_stats, status } = req.query;

    let whereClause = 'WHERE 1=1';
    
    if (school_id) {
      whereClause += ' AND s.SchoolID = @schoolId';
      request.input('schoolId', sql.Int, parseInt(school_id));
    }
    
    if (status) {
      whereClause += ' AND s.Status = @status';
      request.input('status', sql.NVarChar(20), status);
    }

    let query = `
      SELECT 
        s.SchoolID,
        s.Name,
        s.Location,
        s.MachineID,
        s.Status,
        s.CreatedAt,
        s.UpdatedAt
    `;
    
    if (include_stats === 'true') {
      query += `,
        COUNT(DISTINCT st.StudentID) as TotalStudents,
        COUNT(DISTINCT CASE WHEN st.IsActive = 1 THEN st.StudentID END) as ActiveStudents,
        COUNT(a.AttendanceID) as TotalAttendance,
        COUNT(CASE WHEN CAST(a.CreatedAt as DATE) = CAST(GETDATE() as DATE) THEN a.AttendanceID END) as TodayAttendance,
        sas.Status as SyncStatus,
        sas.LastHeartbeat,
        CASE 
          WHEN sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) THEN 'Online'
          WHEN sas.LastHeartbeat > DATEADD(MINUTE, -30, GETDATE()) THEN 'Warning'  
          ELSE 'Offline'
        END as SyncConnectionStatus,
        u.Username as AdminUsername,
        sts.SchoolStartTime,
        sts.SchoolEndTime, 
        sts.LateArrivalTime,
        sts.EarlyDepartureTime,
        sts.Timezone,
        CASE WHEN sts.SettingID IS NULL THEN 1 ELSE 0 END as UsingDefaultTimes
      `;
    }

    query += `
      FROM Schools s
    `;
    
    if (include_stats === 'true') {
      query += `
        LEFT JOIN Students st ON s.SchoolID = st.SchoolID
        LEFT JOIN dbo.Attendance a ON st.StudentID = a.StudentID
        LEFT JOIN SyncAgentStatus sas ON s.SchoolID = sas.SchoolID
        LEFT JOIN SchoolTimeSettings sts ON s.SchoolID = sts.SchoolID
        LEFT JOIN Users u ON s.SchoolID = u.SchoolID AND u.Role = 'school_admin' AND u.IsActive = 1
      `;
    }
    
    query += ` ${whereClause}`;
    
    if (include_stats === 'true') {
      query += ` GROUP BY s.SchoolID, s.Name, s.Location, s.MachineID, s.Status, s.CreatedAt, s.UpdatedAt, sas.Status, sas.LastHeartbeat, u.Username, sts.SettingID, sts.SchoolStartTime, sts.SchoolEndTime, sts.LateArrivalTime, sts.EarlyDepartureTime, sts.Timezone`;
    }
    
    query += ` ORDER BY s.Name`;

    const result = await request.query(query);

    const schools = result.recordset.map(row => ({
      school_id: row.SchoolID,
      name: row.Name,
      location: row.Location,
      machine_id: row.MachineID,
      status: row.Status,
      created_at: row.CreatedAt,
      updated_at: row.UpdatedAt,
      ...(include_stats === 'true' && {
        stats: {
          total_students: row.TotalStudents || 0,
          active_students: row.ActiveStudents || 0,
          total_attendance: row.TotalAttendance || 0,
          today_attendance: row.TodayAttendance || 0,
          sync_status: row.SyncStatus,
          sync_connection_status: row.SyncConnectionStatus,
          last_heartbeat: row.LastHeartbeat,
          admin_username: row.AdminUsername
        },
        time_settings: {
          school_start_time: formatTime(row.SchoolStartTime) || '08:00',
          school_end_time: formatTime(row.SchoolEndTime) || '15:00',
          late_arrival_time: formatTime(row.LateArrivalTime) || '08:30',
          early_departure_time: formatTime(row.EarlyDepartureTime) || '14:00',
          timezone: row.Timezone || 'Africa/Accra',
          using_default_times: Boolean(row.UsingDefaultTimes)
        }
      })
    }));

    res.json({
      success: true,
      data: schools,
      total: schools.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching schools:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET - Fetch specific school by ID (from [id]/index.js)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    const request = pool.request();

    request.input('schoolId', sql.Int, parseInt(id));

    const result = await request.query(`
      SELECT 
        s.SchoolID as id,
        s.Name as name,
        s.Location as location,
        s.Status as status,
        CASE WHEN st.ThemeID IS NOT NULL THEN 1 ELSE 0 END as has_theme
      FROM Schools s
      LEFT JOIN SchoolThemes st ON s.SchoolID = st.SchoolID
      WHERE s.SchoolID = @schoolId AND s.Status = 'active'
    `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'School not found'
      });
    }

    return res.status(200).json({
      success: true,
      school: result.recordset[0]
    });

  } catch (error) {
    console.error('Error fetching school:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch school'
    });
  }
});

// POST - Create new school with admin user and default time settings
router.post('/', async (req, res) => {
  const pool = await getPool();
  const transaction = pool.transaction();
  
  const { 
    name, 
    location, 
    machineId, 
    status = 'active',
    adminUsername,
    adminPassword,
    adminEmail
  } = req.body;

  if (!name || !location) {
    return res.status(400).json({
      success: false,
      error: 'School name and location are required'
    });
  }

  try {
    await transaction.begin();

    // Check if school name already exists
    const checkRequest = pool.request();
    checkRequest.input('checkName', sql.NVarChar(255), name.trim());
    const existingSchool = await checkRequest.query(`
      SELECT SchoolID FROM Schools WHERE Name = @checkName
    `);

    if (existingSchool.recordset.length > 0) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        error: 'A school with this name already exists'
      });
    }

    // Insert new school
    const schoolRequest = transaction.request();
    schoolRequest.input('name', sql.NVarChar(255), name.trim());
    schoolRequest.input('location', sql.NVarChar(255), location.trim());
    schoolRequest.input('machineId', sql.NVarChar(50), machineId || null);
    schoolRequest.input('status', sql.NVarChar(20), status);

    const insertResult = await schoolRequest.query(`
      INSERT INTO Schools (Name, Location, MachineID, Status, CreatedAt, UpdatedAt)
      OUTPUT INSERTED.SchoolID, INSERTED.Name, INSERTED.Location, INSERTED.Status
      VALUES (@name, @location, @machineId, @status, GETDATE(), GETDATE())
    `);

    const newSchool = insertResult.recordset[0];
    const schoolId = newSchool.SchoolID;

    // Generate admin credentials
    const username = adminUsername || `school${schoolId}admin`;
    const password = adminPassword || generateRandomPassword();
    const email = adminEmail || '';

    // Check if username already exists
    const userCheckRequest = transaction.request();
    userCheckRequest.input('checkUsername', sql.NVarChar(100), username);
    const existingUser = await userCheckRequest.query(`
      SELECT UserID FROM Users WHERE Username = @checkUsername
    `);

    if (existingUser.recordset.length > 0) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        error: `Username "${username}" already exists. Please choose a different username.`
      });
    }

    // Create admin user
    const passwordHash = await bcrypt.hash(password, 10);
    
    const userRequest = transaction.request();
    userRequest.input('username', sql.NVarChar(100), username);
    userRequest.input('passwordHash', sql.NVarChar(255), passwordHash);
    userRequest.input('role', sql.NVarChar(50), 'school_admin');
    userRequest.input('schoolId', sql.Int, schoolId);
    userRequest.input('email', sql.NVarChar(255), email);

    await userRequest.query(`
      INSERT INTO Users (Username, PasswordHash, Role, SchoolID, Email, IsActive, CreatedAt)
      VALUES (@username, @passwordHash, @role, @schoolId, @email, 1, GETDATE())
    `);

    // Create default time settings
    const timeSettingsRequest = transaction.request();
    timeSettingsRequest.input('newSchoolId', sql.Int, schoolId);
    timeSettingsRequest.input('schoolStartTime', sql.NVarChar(8), '08:00:00');
    timeSettingsRequest.input('schoolEndTime', sql.NVarChar(8), '15:00:00');
    timeSettingsRequest.input('lateArrivalTime', sql.NVarChar(8), '08:30:00');
    timeSettingsRequest.input('earlyDepartureTime', sql.NVarChar(8), '14:00:00');
    timeSettingsRequest.input('timezone', sql.NVarChar(50), 'Africa/Accra');

    await timeSettingsRequest.query(`
      INSERT INTO SchoolTimeSettings (
        SchoolID, 
        SchoolStartTime, 
        SchoolEndTime, 
        LateArrivalTime, 
        EarlyDepartureTime, 
        Timezone,
        CreatedAt,
        UpdatedAt
      )
      VALUES (
        @newSchoolId, 
        CAST(@schoolStartTime AS TIME), 
        CAST(@schoolEndTime AS TIME), 
        CAST(@lateArrivalTime AS TIME), 
        CAST(@earlyDepartureTime AS TIME), 
        @timezone,
        GETDATE(),
        GETDATE()
      )
    `);

    await transaction.commit();

    res.json({
      success: true,
      message: 'School, admin user, and default time settings created successfully',
      data: {
        school: {
          school_id: newSchool.SchoolID,
          name: newSchool.Name,
          location: newSchool.Location,
          status: newSchool.Status
        },
        admin_credentials: {
          username: username,
          password: password,
          email: email,
          school_id: schoolId
        },
        time_settings: {
          school_start_time: '08:00',
          school_end_time: '15:00',
          late_arrival_time: '08:30',
          early_departure_time: '14:00',
          timezone: 'Africa/Accra'
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error creating school:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// PUT - Update school
router.put('/', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    
    const { school_id } = req.query;
    const { name, location, machineId, status } = req.body;

    if (!school_id) {
      return res.status(400).json({
        success: false,
        error: 'School ID is required'
      });
    }

    // Check if school exists
    request.input('schoolId', sql.Int, parseInt(school_id));
    const existingSchool = await request.query(`
      SELECT SchoolID, Name FROM Schools WHERE SchoolID = @schoolId
    `);

    if (existingSchool.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'School not found'
      });
    }

    // Build update query dynamically
    const updates = [];
    if (name) {
      updates.push('Name = @name');
      request.input('name', sql.NVarChar(255), name.trim());
    }
    if (location) {
      updates.push('Location = @location');
      request.input('location', sql.NVarChar(255), location.trim());
    }
    if (machineId !== undefined) {
      updates.push('MachineID = @machineId');
      request.input('machineId', sql.NVarChar(50), machineId || null);
    }
    if (status) {
      updates.push('Status = @status');
      request.input('status', sql.NVarChar(20), status);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields provided for update'
      });
    }

    updates.push('UpdatedAt = GETDATE()');

    const updateQuery = `
      UPDATE Schools 
      SET ${updates.join(', ')}
      OUTPUT INSERTED.SchoolID, INSERTED.Name, INSERTED.Location, INSERTED.Status
      WHERE SchoolID = @schoolId
    `;

    const updateResult = await request.query(updateQuery);
    const updatedSchool = updateResult.recordset[0];

    res.json({
      success: true,
      message: 'School updated successfully',
      data: {
        school_id: updatedSchool.SchoolID,
        name: updatedSchool.Name,
        location: updatedSchool.Location,
        status: updatedSchool.Status
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error updating school:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// DELETE - Delete/disable school
router.delete('/', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    
    const { school_id } = req.query;
    const { force_delete = false } = req.body;

    if (!school_id) {
      return res.status(400).json({
        success: false,
        error: 'School ID is required'
      });
    }

    request.input('schoolId', sql.Int, parseInt(school_id));

    // Check if school exists
    const schoolCheck = await request.query(`
      SELECT 
        s.SchoolID,
        s.Name,
        COUNT(DISTINCT st.StudentID) as StudentCount,
        COUNT(a.AttendanceID) as AttendanceCount
      FROM Schools s
      LEFT JOIN Students st ON s.SchoolID = st.SchoolID
      LEFT JOIN dbo.Attendance a ON st.StudentID = a.StudentID
      WHERE s.SchoolID = @schoolId
      GROUP BY s.SchoolID, s.Name
    `);

    if (schoolCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'School not found'
      });
    }

    const school = schoolCheck.recordset[0];
    const hasData = school.StudentCount > 0 || school.AttendanceCount > 0;

    if (hasData && !force_delete) {
      // Soft delete with cleanup
      await request.query(`DELETE FROM dbo.Attendance WHERE StudentID IN (SELECT StudentID FROM Students WHERE SchoolID = @schoolId)`);
      await request.query(`DELETE FROM Parents WHERE StudentID IN (SELECT StudentID FROM Students WHERE SchoolID = @schoolId)`);
      await request.query(`DELETE FROM Students WHERE SchoolID = @schoolId`);
      await request.query(`DELETE FROM SyncAgentStatus WHERE SchoolID = @schoolId`);
      await request.query(`DELETE FROM SchoolTimeSettings WHERE SchoolID = @schoolId`);
      await request.query(`UPDATE Schools SET Status = 'inactive', UpdatedAt = GETDATE() WHERE SchoolID = @schoolId`);
      await request.query(`UPDATE Users SET IsActive = 0 WHERE SchoolID = @schoolId AND Role = 'school_admin'`);

      return res.json({
        success: true,
        action: 'soft_delete_with_cleanup',
        message: `School "${school.Name}" has been disabled and all student data removed`,
        note: `This school had ${school.StudentCount} students and ${school.AttendanceCount} attendance records. All data has been removed but school record preserved for historical purposes.`,
        data: { school_id: school.SchoolID, name: school.Name }
      });
    }

    if (force_delete) {
      // Hard delete
      await request.query(`DELETE FROM dbo.Attendance WHERE StudentID IN (SELECT StudentID FROM Students WHERE SchoolID = @schoolId)`);
      await request.query(`DELETE FROM Parents WHERE StudentID IN (SELECT StudentID FROM Students WHERE SchoolID = @schoolId)`);
      await request.query(`DELETE FROM SyncAgentStatus WHERE SchoolID = @schoolId`);
      await request.query(`DELETE FROM SchoolTimeSettings WHERE SchoolID = @schoolId`);
      await request.query(`DELETE FROM Users WHERE SchoolID = @schoolId`);
      await request.query(`DELETE FROM Students WHERE SchoolID = @schoolId`);
      await request.query(`DELETE FROM Schools WHERE SchoolID = @schoolId`);

      return res.json({
        success: true,
        action: 'hard_delete',
        message: `School "${school.Name}" and all related data has been permanently deleted`,
        data: { school_id: school.SchoolID, name: school.Name }
      });
    }

    // No data, safe to delete
    await request.query(`DELETE FROM SchoolTimeSettings WHERE SchoolID = @schoolId`);
    await request.query(`DELETE FROM Users WHERE SchoolID = @schoolId`);
    await request.query(`DELETE FROM Schools WHERE SchoolID = @schoolId`);

    res.json({
      success: true,
      action: 'delete',
      message: `School "${school.Name}" has been deleted`,
      data: { school_id: school.SchoolID, name: school.Name }
    });

  } catch (error) {
    console.error('Error deleting school:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;