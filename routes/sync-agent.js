// // pages/api/sync-agent.js - Fixed with consistent database structure
// const { getPool, sql } = require('../../lib/database')

// export default async function handler(req, res) {
//   res.setHeader('Access-Control-Allow-Origin', '*')
//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

//   if (req.method === 'OPTIONS') {
//     res.status(200).end()
//     return
//   }

//   const { action } = req.method === 'GET' ? req.query : req.body

//   try {
//     const currentPool = await getPool()
//     let result = {}

//     switch (action) {
//       case 'get_students_list':
//         result = await getStudentsList(currentPool, req.body.school_id || req.query.school_id)
//         break
//       case 'check_attendance_table':
//         result = await checkAttendanceTable(currentPool)
//         break
//       case 'check_sync_requirements':
//         result = await checkSyncRequirements(currentPool)
//         break
//       case 'get_recent_attendance':
//         result = await getRecentAttendance(currentPool)
//         break
//       case 'create_test_student':
//         result = await createTestStudent(currentPool, req.body.data)
//         break
//       case 'simulate_checkinout':
//         result = await simulateCheckinout(currentPool, req.body.data)
//         break
//       case 'test_notification_data':
//         result = await testNotificationData(currentPool, req.body.data)
//         break
//       case 'update_parent_contact':
//         result = await updateParentContact(currentPool, req.body.data)
//         break
//       case 'get_parent_contact':
//         result = await getParentContact(currentPool, req.body.data)
//         break
//       case 'check_database_structure':
//         result = await checkDatabaseStructure(currentPool)
//         break
//       default:
//         return res.status(400).json({ error: 'Invalid action' })
//     }

//     res.status(200).json({
//       success: true,
//       action,
//       timestamp: new Date().toISOString(),
//       result
//     })

//   } catch (error) {
//     console.error('Sync Agent API Error:', error)
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       action,
//       timestamp: new Date().toISOString()
//     })
//   }
// }

// // Check if Attendance table exists and create if needed
// async function checkAttendanceTable(pool) {
//   try {
//     const tableExists = await pool.request().query(`
//       SELECT COUNT(*) as TableExists
//       FROM INFORMATION_SCHEMA.TABLES
//       WHERE TABLE_NAME = 'Attendance' AND TABLE_SCHEMA = 'dbo'
//     `)

//     if (tableExists.recordset[0].TableExists === 0) {
//       await pool.request().query(`
//         CREATE TABLE dbo.Attendance (
//           AttendanceID INT IDENTITY(1,1) PRIMARY KEY,
//           SchoolID INT NOT NULL,
//           StudentID INT NOT NULL,
//           ScanTime DATETIME NOT NULL,
//           Status NVARCHAR(10) NOT NULL CHECK (Status IN ('IN', 'OUT')),
//           CreatedAt DATETIME DEFAULT GETDATE(),
//           CONSTRAINT UX_Attendance_NoDup UNIQUE (SchoolID, StudentID, ScanTime)
//         )
//       `)
//     }

//     const recentRecords = await pool.request().query(`
//       SELECT TOP 5 *
//       FROM dbo.Attendance
//       ORDER BY ScanTime DESC
//     `)

//     return {
//       tableExists: true,
//       recentRecords: recentRecords.recordset,
//       message: 'Attendance table is ready for sync agent'
//     }

//   } catch (error) {
//     return {
//       tableExists: false,
//       error: error.message,
//       message: 'Attendance table needs to be created'
//     }
//   }
// }

// // Check sync requirements
// async function checkSyncRequirements(pool) {
//   try {
//     const tables = await pool.request().query(`
//       SELECT TABLE_NAME
//       FROM INFORMATION_SCHEMA.TABLES
//       WHERE TABLE_NAME IN ('Students', 'Parents', 'Attendance', 'Schools')
//       AND TABLE_SCHEMA = 'dbo'
//     `)

//     const tableNames = tables.recordset.map(t => t.TABLE_NAME)
//     const requiredTables = ['Students', 'Parents', 'Attendance', 'Schools']
//     const missingTables = requiredTables.filter(t => !tableNames.includes(t))

//     const dataCheck = await pool.request().query(`
//       SELECT 
//         (SELECT COUNT(*) FROM Students WHERE IsActive = 1) as StudentCount,
//         (SELECT COUNT(*) FROM Parents) as ParentCount
//     `)

//     return {
//       databaseTables: {
//         available: tableNames,
//         missing: missingTables,
//         allTablesPresent: missingTables.length === 0
//       },
//       dataAvailable: dataCheck.recordset[0],
//       message: 'Sync requirements checked'
//     }

//   } catch (error) {
//     throw new Error(`Sync requirements check failed: ${error.message}`)
//   }
// }

// // Get recent attendance records
// async function getRecentAttendance(pool) {
//   try {
//     const recentAttendance = await pool.request().query(`
//       SELECT TOP 10
//         a.AttendanceID,
//         a.StudentID,
//         s.Name as StudentName,
//         a.ScanTime,
//         a.Status,
//         a.CreatedAt
//       FROM dbo.Attendance a
//       LEFT JOIN Students s ON a.StudentID = s.StudentID
//       ORDER BY a.ScanTime DESC
//     `)

//     return {
//       recentRecords: recentAttendance.recordset,
//       message: 'Recent attendance records retrieved'
//     }

//   } catch (error) {
//     return {
//       recentRecords: [],
//       message: 'No attendance records found or table does not exist'
//     }
//   }
// }

// // Create test student with separate Parents table entry
// async function createTestStudent(pool, data) {
//   try {
//     // First, ensure we have a valid school
//     let schoolId = data.schoolId || 1
    
//     // Check if school exists, or get any existing school
//     const schoolCheck = await pool.request()
//       .input('schoolId', sql.Int, schoolId)
//       .query('SELECT COUNT(*) as SchoolExists FROM Schools WHERE SchoolID = @schoolId')
    
//     if (schoolCheck.recordset[0].SchoolExists === 0) {
//       // Check if any schools exist
//       const anySchool = await pool.request().query('SELECT TOP 1 SchoolID FROM Schools')
      
//       if (anySchool.recordset.length > 0) {
//         // Use existing school
//         schoolId = anySchool.recordset[0].SchoolID
//       } else {
//         // Create a test school with unique name
//         const schoolResult = await pool.request()
//           .input('schoolName', sql.NVarChar, `Test School ${Date.now()}`)
//           .query(`
//             INSERT INTO Schools (Name) 
//             OUTPUT INSERTED.SchoolID
//             VALUES (@schoolName)
//           `)
//         schoolId = schoolResult.recordset[0].SchoolID
//       }
//     }

//     // Create student record (without contact info in Students table)
//     const student = await pool.request()
//       .input('name', sql.NVarChar, data.name || `Test Student ${Date.now()}`)
//       .input('schoolId', sql.Int, schoolId)
//       .input('grade', sql.NVarChar, data.grade || '10th')
//       .query(`
//         INSERT INTO Students (Name, SchoolID, Grade, IsActive)
//         OUTPUT INSERTED.*
//         VALUES (@name, @schoolId, @grade, 1)
//       `)

//     const studentId = student.recordset[0].StudentID

//     // Create parent record in separate Parents table
//     const parent = await pool.request()
//       .input('studentId', sql.Int, studentId)
//       .input('parentName', sql.NVarChar, data.parentName || 'Test Parent')
//       .input('email', sql.NVarChar, data.email || 'parent@example.com')
//       .input('phone', sql.NVarChar, data.phone || '+233123456789')
//       .query(`
//         INSERT INTO Parents (StudentID, Name, Email, PhoneNumber)
//         OUTPUT INSERTED.*
//         VALUES (@studentId, @parentName, @email, @phone)
//       `)

//     return {
//       student: student.recordset[0],
//       parent: parent.recordset[0],
//       databaseStructure: {
//         contactInfoLocation: 'Parents table (separate from Students)',
//         studentTable: 'Basic info only',
//         parentsTable: 'Contact information'
//       },
//       schoolCreated: schoolCheck.recordset[0].SchoolExists === 0,
//       usedSchoolId: schoolId,
//       message: 'Test student created with parent contact info in separate Parents table'
//     }

//   } catch (error) {
//     throw new Error(`Test student creation failed: ${error.message}`)
//   }
// }

// // Simulate fingerprint checkin/checkout
// async function simulateCheckinout(pool, data) {
//   try {
//     const studentId = data.studentId
//     const status = data.status || 'IN'
//     const scanTime = new Date()
    
//     // Get the student's school ID first
//     const studentInfo = await pool.request()
//       .input('studentId', sql.Int, studentId)
//       .query('SELECT SchoolID FROM Students WHERE StudentID = @studentId')
    
//     if (studentInfo.recordset.length === 0) {
//       throw new Error(`Student with ID ${studentId} not found`)
//     }
    
//     const schoolId = studentInfo.recordset[0].SchoolID

//     // Insert attendance record with SchoolID
//     const result = await pool.request()
//       .input('schoolId', sql.Int, schoolId)
//       .input('studentId', sql.Int, studentId)
//       .input('scanTime', sql.DateTime, scanTime)
//       .input('status', sql.NVarChar, status)
//       .query(`
//         INSERT INTO dbo.Attendance (SchoolID, StudentID, ScanTime, Status)
//         OUTPUT INSERTED.*
//         VALUES (@schoolId, @studentId, @scanTime, @status)
//       `)

//     // Get complete student info for notifications
//     const completeStudentInfo = await pool.request()
//       .input('studentId', sql.Int, studentId)
//       .query(`
//         SELECT 
//           s.Name as StudentName,
//           s.Grade,
//           s.SchoolID,
//           p.Name as ParentName,
//           p.PhoneNumber,
//           p.Email
//         FROM Students s
//         LEFT JOIN Parents p ON s.StudentID = p.StudentID
//         WHERE s.StudentID = @studentId
//       `)

//     return {
//       attendanceRecord: result.recordset[0],
//       studentInfo: completeStudentInfo.recordset[0],
//       simulationDetails: {
//         action: 'Fingerprint scan simulated',
//         scanTime: scanTime.toISOString(),
//         status: status,
//         schoolId: schoolId
//       }
//     }

//   } catch (error) {
//     throw new Error(`Checkinout simulation failed: ${error.message}`)
//   }
// }

// // Test notification data
// async function testNotificationData(pool, data) {
//   try {
//     const studentId = data.studentId

//     // Get student info and parent contact info from separate tables
//     const studentData = await pool.request()
//       .input('studentId', sql.Int, studentId)
//       .query(`
//         SELECT 
//           s.Name as StudentName,
//           s.Grade,
//           s.SchoolID,
//           p.Name as ParentName,
//           p.Email as ParentEmail,
//           p.PhoneNumber as ParentPhone
//         FROM Students s
//         LEFT JOIN Parents p ON s.StudentID = p.StudentID
//         WHERE s.StudentID = @studentId AND s.IsActive = 1
//       `)

//     if (studentData.recordset.length === 0) {
//       return {
//         error: 'No student found',
//         message: 'Student not found'
//       }
//     }

//     const student = studentData.recordset[0]
//     const scanTime = new Date()

//     // Generate notification content (matching your sync agent format)
//     const emailSubject = `Attendance Alert: ${student.StudentName} Checked In`
//     const emailBody = `Dear ${student.ParentName || 'Parent/Guardian'},

// ${student.StudentName} has checked in on ${scanTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${scanTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}.

// School ID: ${student.SchoolID}

// Regards,
// School Administration`

//     const smsBody = `Dear ${student.ParentName || 'Parent/Guardian'}, ${student.StudentName} has checked in on ${scanTime.toLocaleDateString('en-GB')} at ${scanTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}. - School ID: ${student.SchoolID}`

//     return {
//       studentData: student,
//       notificationContent: {
//         email: {
//           to: student.ParentEmail,
//           subject: emailSubject,
//           body: emailBody,
//           service: 'Gmail SMTP',
//           status: student.ParentEmail ? 'Ready to send' : 'No email address'
//         },
//         sms: {
//           to: student.ParentPhone,
//           message: smsBody,
//           service: 'Arkesel SMS API',
//           status: student.ParentPhone ? 'Ready to send' : 'No phone number'
//         }
//       },
//       databaseStructure: {
//         source: 'Parents table (separate from Students)',
//         emailColumn: 'Email',
//         phoneColumn: 'PhoneNumber'
//       }
//     }

//   } catch (error) {
//     throw new Error(`Notification data test failed: ${error.message}`)
//   }
// }

// // FIXED: Get parent contact information from Parents table
// async function getParentContact(pool, data) {
//   try {
//     const { studentId } = data

//     if (!studentId) {
//       throw new Error('Student ID is required')
//     }

//     console.log(`Getting parent contact for StudentID: ${studentId}`)

//     // Get student basic info
//     const studentResult = await pool.request()
//       .input('studentId', sql.Int, studentId)
//       .query(`
//         SELECT StudentID, Name as StudentName, Grade, SchoolID, IsActive
//         FROM Students 
//         WHERE StudentID = @studentId
//       `)

//     if (studentResult.recordset.length === 0) {
//       throw new Error('Student not found')
//     }

//     // Get parent contact info from Parents table
//     const parentResult = await pool.request()
//       .input('studentId', sql.Int, studentId)
//       .query(`
//         SELECT Email, PhoneNumber as phone, Name as ParentName
//         FROM Parents 
//         WHERE StudentID = @studentId
//       `)

//     const student = studentResult.recordset[0]
//     const parent = parentResult.recordset[0] || { Email: null, phone: null, ParentName: null }

//     console.log(`Found student: ${student.StudentName}`)
//     console.log(`Parent contact - Email: ${parent.Email}, Phone: ${parent.phone}`)

//     return {
//       student: {
//         id: student.StudentID,
//         name: student.StudentName,
//         grade: student.Grade,
//         schoolId: student.SchoolID,
//         isActive: student.IsActive
//       },
//       parentContact: {
//         email: parent.Email,
//         phone: parent.phone,
//         parentName: parent.ParentName,
//         hasContact: !!(parent.Email || parent.phone)
//       },
//       databaseStructure: {
//         contactLocation: 'Parents table',
//         emailColumn: 'Email',
//         phoneColumn: 'PhoneNumber'
//       },
//       message: 'Parent contact information retrieved successfully from Parents table'
//     }

//   } catch (error) {
//     console.error('getParentContact error:', error)
//     throw new Error(`Get parent contact failed: ${error.message}`)
//   }
// }

// // Check database structure
// async function checkDatabaseStructure(pool) {
//   try {
//     // Check Students table structure
//     const studentsColumns = await pool.request().query(`
//       SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
//       FROM INFORMATION_SCHEMA.COLUMNS 
//       WHERE TABLE_NAME = 'Students'
//       ORDER BY ORDINAL_POSITION
//     `)

//     // Check Parents table structure
//     const parentsColumns = await pool.request().query(`
//       SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
//       FROM INFORMATION_SCHEMA.COLUMNS 
//       WHERE TABLE_NAME = 'Parents'
//       ORDER BY ORDINAL_POSITION
//     `)

//     // Check if there are any sample records
//     const studentSample = await pool.request().query(`
//       SELECT TOP 3 StudentID, Name, Grade, SchoolID, IsActive FROM Students WHERE IsActive = 1
//     `)

//     const parentSample = await pool.request().query(`
//       SELECT TOP 3 StudentID, Name, Email, PhoneNumber FROM Parents
//     `)

//     return {
//       studentsTable: {
//         columns: studentsColumns.recordset,
//         sampleData: studentSample.recordset,
//         purpose: 'Basic student information'
//       },
//       parentsTable: {
//         columns: parentsColumns.recordset,
//         sampleData: parentSample.recordset,
//         purpose: 'Parent contact information'
//       },
//       recommendation: 'Use Parents table for all contact information updates',
//       message: 'Database structure analyzed - separate tables confirmed'
//     }

//   } catch (error) {
//     throw new Error(`Database structure check failed: ${error.message}`)
//   }
// }

// // FIXED: Update parent contact in Parents table
// async function updateParentContact(pool, data) {
//   try {
//     console.log('updateParentContact received data:', JSON.stringify(data, null, 2))
    
//     const { studentId, newEmail, newPhone, email, phoneNumber } = data

//     if (!studentId) {
//       throw new Error('Student ID is required')
//     }

//     // Use either new format or legacy format for backward compatibility
//     const emailToUpdate = newEmail || email
//     const phoneToUpdate = newPhone || phoneNumber

//     console.log(`Updating contact for StudentID: ${studentId}`)
//     console.log(`Email to update: ${emailToUpdate}`)
//     console.log(`Phone to update: ${phoneToUpdate}`)

//     // Validate that at least one contact method is provided
//     if (!emailToUpdate && !phoneToUpdate) {
//       throw new Error('At least one contact method (email or phone) must be provided')
//     }

//     // Check if parent record exists for this student
//     const existingParent = await pool.request()
//       .input('studentId', sql.Int, studentId)
//       .query('SELECT ParentID, Name, Email, PhoneNumber FROM Parents WHERE StudentID = @studentId')

//     let result
//     let operation

//     if (existingParent.recordset.length === 0) {
//       // Create new parent record
//       console.log('Creating new parent record')
      
//       result = await pool.request()
//         .input('studentId', sql.Int, studentId)
//         .input('name', sql.NVarChar, 'Parent') // Default name
//         .input('email', sql.NVarChar, emailToUpdate || null)
//         .input('phone', sql.NVarChar, phoneToUpdate || null)
//         .query(`
//           INSERT INTO Parents (StudentID, Name, Email, PhoneNumber)
//           OUTPUT INSERTED.*
//           VALUES (@studentId, @name, @email, @phone)
//         `)
      
//       operation = 'created'
      
//     } else {
//       // Update existing parent record
//       console.log('Updating existing parent record')
      
//       let updateFields = []
//       const request = pool.request().input('studentId', sql.Int, studentId)
      
//       if (emailToUpdate !== undefined) {
//         updateFields.push('Email = @email')
//         request.input('email', sql.NVarChar, emailToUpdate)
//       }
      
//       if (phoneToUpdate !== undefined) {
//         updateFields.push('PhoneNumber = @phone')
//         request.input('phone', sql.NVarChar, phoneToUpdate)
//       }
      
//       if (updateFields.length === 0) {
//         throw new Error('No fields to update')
//       }
      
//       const updateQuery = `
//         UPDATE Parents 
//         SET ${updateFields.join(', ')}
//         OUTPUT INSERTED.*
//         WHERE StudentID = @studentId
//       `
      
//       result = await request.query(updateQuery)
//       operation = 'updated'
//     }

//     if (result.recordset.length === 0) {
//       throw new Error(`Failed to ${operation} parent record`)
//     }

//     const updatedParent = result.recordset[0]

//     console.log(`Parent record ${operation} successfully:`, updatedParent)

//     return {
//       [operation]: true,
//       parent: updatedParent,
//       operation: operation,
//       contactInfo: {
//         email: updatedParent.Email,
//         phone: updatedParent.PhoneNumber,
//         hasContact: !!(updatedParent.Email || updatedParent.PhoneNumber)
//       },
//       databaseStructure: {
//         location: 'Parents table',
//         emailColumn: 'Email',
//         phoneColumn: 'PhoneNumber'
//       },
//       message: `Parent contact information ${operation} successfully in Parents table`
//     }

//   } catch (error) {
//     console.error('updateParentContact error:', error)
//     throw new Error(`Update parent contact failed: ${error.message}`)
//   }
// }

// // Get students list with parent password status
// async function getStudentsList(pool, schoolId) {
//   try {
//     console.log(`Getting students list for school: ${schoolId}`)

//     let query = `
//       SELECT 
//         s.StudentID as student_id,
//         s.Name as name,
//         s.Grade as grade,
//         s.SchoolID as school_id,
//         s.IsActive as is_active,
//         CASE 
//           WHEN p.Email IS NOT NULL OR p.PhoneNumber IS NOT NULL THEN 1 
//           ELSE 0 
//         END as parent_password_set,
//         '' as student_code,
//         p.Email as parent_email,
//         p.PhoneNumber as parent_phone,
//         p.Name as parent_name
//       FROM Students s
//       LEFT JOIN Parents p ON s.StudentID = p.StudentID
//       WHERE s.IsActive = 1
//     `

//     const request = pool.request()

//     // Add school filter if provided
//     if (schoolId && schoolId !== 'undefined') {
//       query += ` AND s.SchoolID = @schoolId`
//       request.input('schoolId', sql.Int, parseInt(schoolId))
//     }

//     query += ` ORDER BY s.Name`

//     const result = await request.query(query)

//     console.log(`Found ${result.recordset.length} students`)

//     return {
//       students: result.recordset,
//       count: result.recordset.length,
//       message: 'Students list retrieved successfully from database'
//     }

//   } catch (error) {
//     console.error('getStudentsList error:', error)
//     throw new Error(`Get students list failed: ${error.message}`)
//   }
// }

// routes/sync-agent.js - Fixed with consistent database structure
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../lib/database');

// Handle both GET and POST for all actions
router.all('/', async (req, res) => {
  const { action } = req.method === 'GET' ? req.query : req.body;

  try {
    const currentPool = await getPool();
    let result = {};

    switch (action) {
      case 'get_students_list':
        result = await getStudentsList(currentPool, req.body.school_id || req.query.school_id);
        break;
      case 'check_attendance_table':
        result = await checkAttendanceTable(currentPool);
        break;
      case 'check_sync_requirements':
        result = await checkSyncRequirements(currentPool);
        break;
      case 'get_recent_attendance':
        result = await getRecentAttendance(currentPool);
        break;
      case 'create_test_student':
        result = await createTestStudent(currentPool, req.body.data);
        break;
      case 'simulate_checkinout':
        result = await simulateCheckinout(currentPool, req.body.data);
        break;
      case 'test_notification_data':
        result = await testNotificationData(currentPool, req.body.data);
        break;
      case 'update_parent_contact':
        result = await updateParentContact(currentPool, req.body.data);
        break;
      case 'get_parent_contact':
        result = await getParentContact(currentPool, req.body.data);
        break;
      case 'check_database_structure':
        result = await checkDatabaseStructure(currentPool);
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    res.status(200).json({
      success: true,
      action,
      timestamp: new Date().toISOString(),
      result
    });

  } catch (error) {
    console.error('Sync Agent API Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      action,
      timestamp: new Date().toISOString()
    });
  }
});

// Check if Attendance table exists and create if needed
async function checkAttendanceTable(pool) {
  try {
    const tableExists = await pool.request().query(`
      SELECT COUNT(*) as TableExists
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'Attendance' AND TABLE_SCHEMA = 'dbo'
    `);

    if (tableExists.recordset[0].TableExists === 0) {
      await pool.request().query(`
        CREATE TABLE dbo.Attendance (
          AttendanceID INT IDENTITY(1,1) PRIMARY KEY,
          SchoolID INT NOT NULL,
          StudentID INT NOT NULL,
          ScanTime DATETIME NOT NULL,
          Status NVARCHAR(10) NOT NULL CHECK (Status IN ('IN', 'OUT')),
          CreatedAt DATETIME DEFAULT GETDATE(),
          CONSTRAINT UX_Attendance_NoDup UNIQUE (SchoolID, StudentID, ScanTime)
        )
      `);
    }

    const recentRecords = await pool.request().query(`
      SELECT TOP 5 *
      FROM dbo.Attendance
      ORDER BY ScanTime DESC
    `);

    return {
      tableExists: true,
      recentRecords: recentRecords.recordset,
      message: 'Attendance table is ready for sync agent'
    };

  } catch (error) {
    return {
      tableExists: false,
      error: error.message,
      message: 'Attendance table needs to be created'
    };
  }
}

// Check sync requirements
async function checkSyncRequirements(pool) {
  try {
    const tables = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME IN ('Students', 'Parents', 'Attendance', 'Schools')
      AND TABLE_SCHEMA = 'dbo'
    `);

    const tableNames = tables.recordset.map(t => t.TABLE_NAME);
    const requiredTables = ['Students', 'Parents', 'Attendance', 'Schools'];
    const missingTables = requiredTables.filter(t => !tableNames.includes(t));

    const dataCheck = await pool.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM Students WHERE IsActive = 1) as StudentCount,
        (SELECT COUNT(*) FROM Parents) as ParentCount
    `);

    return {
      databaseTables: {
        available: tableNames,
        missing: missingTables,
        allTablesPresent: missingTables.length === 0
      },
      dataAvailable: dataCheck.recordset[0],
      message: 'Sync requirements checked'
    };

  } catch (error) {
    throw new Error(`Sync requirements check failed: ${error.message}`);
  }
}

// Get recent attendance records
async function getRecentAttendance(pool) {
  try {
    const recentAttendance = await pool.request().query(`
      SELECT TOP 10
        a.AttendanceID,
        a.StudentID,
        s.Name as StudentName,
        a.ScanTime,
        a.Status,
        a.CreatedAt
      FROM dbo.Attendance a
      LEFT JOIN Students s ON a.StudentID = s.StudentID
      ORDER BY a.ScanTime DESC
    `);

    return {
      recentRecords: recentAttendance.recordset,
      message: 'Recent attendance records retrieved'
    };

  } catch (error) {
    return {
      recentRecords: [],
      message: 'No attendance records found or table does not exist'
    };
  }
}

// Create test student with separate Parents table entry
async function createTestStudent(pool, data) {
  try {
    // First, ensure we have a valid school
    let schoolId = data.schoolId || 1;
    
    // Check if school exists, or get any existing school
    const schoolCheck = await pool.request()
      .input('schoolId', sql.Int, schoolId)
      .query('SELECT COUNT(*) as SchoolExists FROM Schools WHERE SchoolID = @schoolId');
    
    if (schoolCheck.recordset[0].SchoolExists === 0) {
      // Check if any schools exist
      const anySchool = await pool.request().query('SELECT TOP 1 SchoolID FROM Schools');
      
      if (anySchool.recordset.length > 0) {
        // Use existing school
        schoolId = anySchool.recordset[0].SchoolID;
      } else {
        // Create a test school with unique name
        const schoolResult = await pool.request()
          .input('schoolName', sql.NVarChar, `Test School ${Date.now()}`)
          .query(`
            INSERT INTO Schools (Name) 
            OUTPUT INSERTED.SchoolID
            VALUES (@schoolName)
          `);
        schoolId = schoolResult.recordset[0].SchoolID;
      }
    }

    // Create student record (without contact info in Students table)
    const student = await pool.request()
      .input('name', sql.NVarChar, data.name || `Test Student ${Date.now()}`)
      .input('schoolId', sql.Int, schoolId)
      .input('grade', sql.NVarChar, data.grade || '10th')
      .query(`
        INSERT INTO Students (Name, SchoolID, Grade, IsActive)
        OUTPUT INSERTED.*
        VALUES (@name, @schoolId, @grade, 1)
      `);

    const studentId = student.recordset[0].StudentID;

    // Create parent record in separate Parents table
    const parent = await pool.request()
      .input('studentId', sql.Int, studentId)
      .input('parentName', sql.NVarChar, data.parentName || 'Test Parent')
      .input('email', sql.NVarChar, data.email || 'parent@example.com')
      .input('phone', sql.NVarChar, data.phone || '+233123456789')
      .query(`
        INSERT INTO Parents (StudentID, Name, Email, PhoneNumber)
        OUTPUT INSERTED.*
        VALUES (@studentId, @parentName, @email, @phone)
      `);

    return {
      student: student.recordset[0],
      parent: parent.recordset[0],
      databaseStructure: {
        contactInfoLocation: 'Parents table (separate from Students)',
        studentTable: 'Basic info only',
        parentsTable: 'Contact information'
      },
      schoolCreated: schoolCheck.recordset[0].SchoolExists === 0,
      usedSchoolId: schoolId,
      message: 'Test student created with parent contact info in separate Parents table'
    };

  } catch (error) {
    throw new Error(`Test student creation failed: ${error.message}`);
  }
}

// Simulate fingerprint checkin/checkout
async function simulateCheckinout(pool, data) {
  try {
    const studentId = data.studentId;
    const status = data.status || 'IN';
    const scanTime = new Date();
    
    // Get the student's school ID first
    const studentInfo = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query('SELECT SchoolID FROM Students WHERE StudentID = @studentId');
    
    if (studentInfo.recordset.length === 0) {
      throw new Error(`Student with ID ${studentId} not found`);
    }
    
    const schoolId = studentInfo.recordset[0].SchoolID;

    // Insert attendance record with SchoolID
    const result = await pool.request()
      .input('schoolId', sql.Int, schoolId)
      .input('studentId', sql.Int, studentId)
      .input('scanTime', sql.DateTime, scanTime)
      .input('status', sql.NVarChar, status)
      .query(`
        INSERT INTO dbo.Attendance (SchoolID, StudentID, ScanTime, Status)
        OUTPUT INSERTED.*
        VALUES (@schoolId, @studentId, @scanTime, @status)
      `);

    // Get complete student info for notifications
    const completeStudentInfo = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`
        SELECT 
          s.Name as StudentName,
          s.Grade,
          s.SchoolID,
          p.Name as ParentName,
          p.PhoneNumber,
          p.Email
        FROM Students s
        LEFT JOIN Parents p ON s.StudentID = p.StudentID
        WHERE s.StudentID = @studentId
      `);

    return {
      attendanceRecord: result.recordset[0],
      studentInfo: completeStudentInfo.recordset[0],
      simulationDetails: {
        action: 'Fingerprint scan simulated',
        scanTime: scanTime.toISOString(),
        status: status,
        schoolId: schoolId
      }
    };

  } catch (error) {
    throw new Error(`Checkinout simulation failed: ${error.message}`);
  }
}

// Test notification data
async function testNotificationData(pool, data) {
  try {
    const studentId = data.studentId;

    // Get student info and parent contact info from separate tables
    const studentData = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`
        SELECT 
          s.Name as StudentName,
          s.Grade,
          s.SchoolID,
          p.Name as ParentName,
          p.Email as ParentEmail,
          p.PhoneNumber as ParentPhone
        FROM Students s
        LEFT JOIN Parents p ON s.StudentID = p.StudentID
        WHERE s.StudentID = @studentId AND s.IsActive = 1
      `);

    if (studentData.recordset.length === 0) {
      return {
        error: 'No student found',
        message: 'Student not found'
      };
    }

    const student = studentData.recordset[0];
    const scanTime = new Date();

    // Generate notification content (matching your sync agent format)
    const emailSubject = `Attendance Alert: ${student.StudentName} Checked In`;
    const emailBody = `Dear ${student.ParentName || 'Parent/Guardian'},

${student.StudentName} has checked in on ${scanTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${scanTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}.

School ID: ${student.SchoolID}

Regards,
School Administration`;

    const smsBody = `Dear ${student.ParentName || 'Parent/Guardian'}, ${student.StudentName} has checked in on ${scanTime.toLocaleDateString('en-GB')} at ${scanTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}. - School ID: ${student.SchoolID}`;

    return {
      studentData: student,
      notificationContent: {
        email: {
          to: student.ParentEmail,
          subject: emailSubject,
          body: emailBody,
          service: 'Gmail SMTP',
          status: student.ParentEmail ? 'Ready to send' : 'No email address'
        },
        sms: {
          to: student.ParentPhone,
          message: smsBody,
          service: 'Arkesel SMS API',
          status: student.ParentPhone ? 'Ready to send' : 'No phone number'
        }
      },
      databaseStructure: {
        source: 'Parents table (separate from Students)',
        emailColumn: 'Email',
        phoneColumn: 'PhoneNumber'
      }
    };

  } catch (error) {
    throw new Error(`Notification data test failed: ${error.message}`);
  }
}

// Get parent contact information from Parents table
async function getParentContact(pool, data) {
  try {
    const { studentId } = data;

    if (!studentId) {
      throw new Error('Student ID is required');
    }

    console.log(`Getting parent contact for StudentID: ${studentId}`);

    // Get student basic info
    const studentResult = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`
        SELECT StudentID, Name as StudentName, Grade, SchoolID, IsActive
        FROM Students 
        WHERE StudentID = @studentId
      `);

    if (studentResult.recordset.length === 0) {
      throw new Error('Student not found');
    }

    // Get parent contact info from Parents table
    const parentResult = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query(`
        SELECT Email, PhoneNumber as phone, Name as ParentName
        FROM Parents 
        WHERE StudentID = @studentId
      `);

    const student = studentResult.recordset[0];
    const parent = parentResult.recordset[0] || { Email: null, phone: null, ParentName: null };

    console.log(`Found student: ${student.StudentName}`);
    console.log(`Parent contact - Email: ${parent.Email}, Phone: ${parent.phone}`);

    return {
      student: {
        id: student.StudentID,
        name: student.StudentName,
        grade: student.Grade,
        schoolId: student.SchoolID,
        isActive: student.IsActive
      },
      parentContact: {
        email: parent.Email,
        phone: parent.phone,
        parentName: parent.ParentName,
        hasContact: !!(parent.Email || parent.phone)
      },
      databaseStructure: {
        contactLocation: 'Parents table',
        emailColumn: 'Email',
        phoneColumn: 'PhoneNumber'
      },
      message: 'Parent contact information retrieved successfully from Parents table'
    };

  } catch (error) {
    console.error('getParentContact error:', error);
    throw new Error(`Get parent contact failed: ${error.message}`);
  }
}

// Check database structure
async function checkDatabaseStructure(pool) {
  try {
    // Check Students table structure
    const studentsColumns = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Students'
      ORDER BY ORDINAL_POSITION
    `);

    // Check Parents table structure
    const parentsColumns = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Parents'
      ORDER BY ORDINAL_POSITION
    `);

    // Check if there are any sample records
    const studentSample = await pool.request().query(`
      SELECT TOP 3 StudentID, Name, Grade, SchoolID, IsActive FROM Students WHERE IsActive = 1
    `);

    const parentSample = await pool.request().query(`
      SELECT TOP 3 StudentID, Name, Email, PhoneNumber FROM Parents
    `);

    return {
      studentsTable: {
        columns: studentsColumns.recordset,
        sampleData: studentSample.recordset,
        purpose: 'Basic student information'
      },
      parentsTable: {
        columns: parentsColumns.recordset,
        sampleData: parentSample.recordset,
        purpose: 'Parent contact information'
      },
      recommendation: 'Use Parents table for all contact information updates',
      message: 'Database structure analyzed - separate tables confirmed'
    };

  } catch (error) {
    throw new Error(`Database structure check failed: ${error.message}`);
  }
}

// Update parent contact in Parents table
async function updateParentContact(pool, data) {
  try {
    console.log('updateParentContact received data:', JSON.stringify(data, null, 2));
    
    const { studentId, newEmail, newPhone, email, phoneNumber } = data;

    if (!studentId) {
      throw new Error('Student ID is required');
    }

    // Use either new format or legacy format for backward compatibility
    const emailToUpdate = newEmail || email;
    const phoneToUpdate = newPhone || phoneNumber;

    console.log(`Updating contact for StudentID: ${studentId}`);
    console.log(`Email to update: ${emailToUpdate}`);
    console.log(`Phone to update: ${phoneToUpdate}`);

    // Validate that at least one contact method is provided
    if (!emailToUpdate && !phoneToUpdate) {
      throw new Error('At least one contact method (email or phone) must be provided');
    }

    // Check if parent record exists for this student
    const existingParent = await pool.request()
      .input('studentId', sql.Int, studentId)
      .query('SELECT ParentID, Name, Email, PhoneNumber FROM Parents WHERE StudentID = @studentId');

    let result;
    let operation;

    if (existingParent.recordset.length === 0) {
      // Create new parent record
      console.log('Creating new parent record');
      
      result = await pool.request()
        .input('studentId', sql.Int, studentId)
        .input('name', sql.NVarChar, 'Parent') // Default name
        .input('email', sql.NVarChar, emailToUpdate || null)
        .input('phone', sql.NVarChar, phoneToUpdate || null)
        .query(`
          INSERT INTO Parents (StudentID, Name, Email, PhoneNumber)
          OUTPUT INSERTED.*
          VALUES (@studentId, @name, @email, @phone)
        `);
      
      operation = 'created';
      
    } else {
      // Update existing parent record
      console.log('Updating existing parent record');
      
      let updateFields = [];
      const request = pool.request().input('studentId', sql.Int, studentId);
      
      if (emailToUpdate !== undefined) {
        updateFields.push('Email = @email');
        request.input('email', sql.NVarChar, emailToUpdate);
      }
      
      if (phoneToUpdate !== undefined) {
        updateFields.push('PhoneNumber = @phone');
        request.input('phone', sql.NVarChar, phoneToUpdate);
      }
      
      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }
      
      const updateQuery = `
        UPDATE Parents 
        SET ${updateFields.join(', ')}
        OUTPUT INSERTED.*
        WHERE StudentID = @studentId
      `;
      
      result = await request.query(updateQuery);
      operation = 'updated';
    }

    if (result.recordset.length === 0) {
      throw new Error(`Failed to ${operation} parent record`);
    }

    const updatedParent = result.recordset[0];

    console.log(`Parent record ${operation} successfully:`, updatedParent);

    return {
      [operation]: true,
      parent: updatedParent,
      operation: operation,
      contactInfo: {
        email: updatedParent.Email,
        phone: updatedParent.PhoneNumber,
        hasContact: !!(updatedParent.Email || updatedParent.PhoneNumber)
      },
      databaseStructure: {
        location: 'Parents table',
        emailColumn: 'Email',
        phoneColumn: 'PhoneNumber'
      },
      message: `Parent contact information ${operation} successfully in Parents table`
    };

  } catch (error) {
    console.error('updateParentContact error:', error);
    throw new Error(`Update parent contact failed: ${error.message}`);
  }
}

// Get students list with parent password status
async function getStudentsList(pool, schoolId) {
  try {
    console.log(`Getting students list for school: ${schoolId}`);

    let query = `
      SELECT 
        s.StudentID as student_id,
        s.Name as name,
        s.Grade as grade,
        s.SchoolID as school_id,
        s.IsActive as is_active,
        CASE 
          WHEN p.Email IS NOT NULL OR p.PhoneNumber IS NOT NULL THEN 1 
          ELSE 0 
        END as parent_password_set,
        '' as student_code,
        p.Email as parent_email,
        p.PhoneNumber as parent_phone,
        p.Name as parent_name
      FROM Students s
      LEFT JOIN Parents p ON s.StudentID = p.StudentID
      WHERE s.IsActive = 1
    `;

    const request = pool.request();

    // Add school filter if provided
    if (schoolId && schoolId !== 'undefined') {
      query += ` AND s.SchoolID = @schoolId`;
      request.input('schoolId', sql.Int, parseInt(schoolId));
    }

    query += ` ORDER BY s.Name`;

    const result = await request.query(query);

    console.log(`Found ${result.recordset.length} students`);

    return {
      students: result.recordset,
      count: result.recordset.length,
      message: 'Students list retrieved successfully from database'
    };

  } catch (error) {
    console.error('getStudentsList error:', error);
    throw new Error(`Get students list failed: ${error.message}`);
  }
}

module.exports = router;