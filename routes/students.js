// // /api/students.js - Enhanced Students API with full CRUD operations
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
//         return await handleGet(req, res)
//       case 'POST':
//         return await handlePost(req, res)
//       case 'PUT':
//         return await handlePut(req, res)
//       case 'DELETE':
//         return await handleDelete(req, res)
//       default:
//         return res.status(405).json({ error: 'Method not allowed' })
//     }
//   } catch (error) {
//     console.error('Students API error:', error)
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       timestamp: new Date().toISOString()
//     })
//   }
// }

// async function handleGet(req, res) {
//   const startTime = Date.now()
  
//   const { 
//     student_id, 
//     school_id, 
//     grade, 
//     type, 
//     include_stats, 
//     search, 
//     active_only,
//     limit = 50,        
//     offset = 0,        
//     page = 1           
//   } = req.query

//   // Convert page to offset if needed
//   const calculatedOffset = offset || ((page - 1) * limit)

//   // Handle grades request
//   if (type === 'grades') {
//     if (!school_id) {
//       return res.status(400).json({
//         success: false,
//         error: 'School ID is required for grades request'
//       })
//     }

//     const pool = await getPool()
//     const gradesResult = await pool.request()
//       .input('schoolId', sql.Int, parseInt(school_id))
//       .query(`
//         SELECT DISTINCT Grade
//         FROM Students 
//         WHERE SchoolID = @schoolId 
//         AND IsActive = 1 
//         AND Grade IS NOT NULL
//         ORDER BY Grade
//       `)

//     return res.json({
//       success: true,
//       grades: gradesResult.recordset.map(row => row.Grade),
//       timestamp: new Date().toISOString()
//     })
//   }

//   const pool = await getPool()

//   // Build WHERE conditions first (used for both count and data queries)
//   const conditions = []
//   const baseParams = {}

//   if (student_id) {
//     conditions.push('st.StudentID = @studentId')
//     baseParams.studentId = parseInt(student_id)
//   }
  
//   if (school_id) {
//     conditions.push('st.SchoolID = @schoolId')
//     baseParams.schoolId = parseInt(school_id)
//   } else if (!student_id) {
//     return res.status(400).json({
//       success: false,
//       error: 'School ID is required'
//     })
//   }
  
//   // CRITICAL: Apply search filter to COUNT query too
//   if (search) {
//     conditions.push('(st.Name LIKE @search OR st.StudentCode LIKE @search)')
//     baseParams.search = `%${search}%`
//   }
  
//   if (grade) {
//     conditions.push('st.Grade = @grade')
//     baseParams.grade = grade
//   }
  
//   if (active_only === 'true') {
//     conditions.push('st.IsActive = 1')
//   }

//   const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

//   // STEP 1: Get total counts (with same filters as main query)
//   let totalCounts = { total: 0, active: 0, inactive: 0, filtered_total: 0 }
  
//   if (!student_id) { // Only get counts when fetching multiple students
//     const countQuery = `
//       SELECT 
//         COUNT(*) as filtered_total,
//         COUNT(CASE WHEN st.IsActive = 1 THEN 1 END) as active,
//         COUNT(CASE WHEN st.IsActive = 0 THEN 1 END) as inactive,
//         -- Also get unfiltered total for dashboard
//         (SELECT COUNT(*) FROM Students WHERE SchoolID = @schoolId) as total
//       FROM Students st
//       LEFT JOIN Schools s ON st.SchoolID = s.SchoolID
//       ${whereClause}
//     `
    
//     // Create request for counts
//     const countRequest = pool.request()
//     Object.keys(baseParams).forEach(key => {
//       if (key === 'studentId') countRequest.input(key, sql.Int, baseParams[key])
//       else if (key === 'schoolId') countRequest.input(key, sql.Int, baseParams[key])
//       else countRequest.input(key, sql.NVarChar, baseParams[key])
//     })
    
//     const countResult = await countRequest.query(countQuery)
//     totalCounts = countResult.recordset[0]
//   }

//   // STEP 2: Handle special cases for limit
//   let actualLimit = parseInt(limit)
//   if (limit === 'all' || limit === '999999') {
//     actualLimit = Math.max(totalCounts.filtered_total || 1000, 1000) // Use filtered count or fallback to 1000
//   }

//   // STEP 3: Build main query with optimized structure
//   let query = `
//   SELECT 
//     st.StudentID,
//     st.Name as StudentName,
//     st.SchoolID,
//     s.Name as SchoolName,
//     st.Grade,
//     st.StudentCode,
//     st.ParentPasswordSet,
//     st.IsActive,
//     st.CreatedAt,
//     st.LastLoginAt,
//     p.Email as ParentEmail,      -- NEW
//     p.PhoneNumber as ParentPhone        -- NEW
//   FROM Students st
//   LEFT JOIN Schools s ON st.SchoolID = s.SchoolID
//   LEFT JOIN Parents p ON st.StudentID = p.StudentID  -- NEW JOIN
//   ${whereClause}
//   ORDER BY st.Name
// `

//   // Add pagination for SQL Server
//   if (actualLimit < 999999) {
//     if (calculatedOffset > 0) {
//       query += ` OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
//     } else {
//       query = query.replace('SELECT', `SELECT TOP (@limit)`)
//     }
//   }
  
//   // STEP 4: Execute main query
//   const request = pool.request()
  
//   // Add all parameters
//   Object.keys(baseParams).forEach(key => {
//     if (key === 'studentId' || key === 'schoolId') {
//       request.input(key, sql.Int, baseParams[key])
//     } else {
//       request.input(key, sql.NVarChar, baseParams[key])
//     }
//   })
  
//   if (actualLimit < 999999) {
//     request.input('limit', sql.Int, actualLimit)
//     if (calculatedOffset > 0) {
//       request.input('offset', sql.Int, parseInt(calculatedOffset))
//     }
//   }
  
//   const result = await request.query(query)
  
//   // STEP 5: Map results
//   let studentsWithStats = result.recordset.map(student => ({
//     id: student.StudentID,
//     student_id: student.StudentID,
//     name: student.StudentName,
//     school_id: student.SchoolID,
//     school_name: student.SchoolName,
//     grade: student.Grade,
//     student_code: student.StudentCode,
//     parent_password_set: student.ParentPasswordSet || false,
//     parent_email: student.ParentEmail || null,  // NEW
//     parent_phone: student.ParentPhone || null,  // NEW
//     is_active: student.IsActive || false,
//     created_at: student.CreatedAt,
//     last_login_at: student.LastLoginAt,
//     last_activity: null,
//     total_attendance_records: 0
//   }))

//   // STEP 6: Add stats if requested (only for reasonable numbers)
//   if (include_stats === 'true' && studentsWithStats.length > 0 && studentsWithStats.length <= 100) {
//     const studentIds = studentsWithStats.map(s => s.student_id).join(',')
    
//     if (studentIds) {
//       try {
//         const statsResult = await pool.request().query(`
//           SELECT 
//             StudentID,
//             COUNT(CASE WHEN CAST(ScanTime as DATE) = CAST(GETDATE() as DATE) THEN 1 END) as TodayAttendance,
//             COUNT(CASE WHEN ScanTime > DATEADD(day, -7, GETDATE()) THEN 1 END) as WeekAttendance,
//             COUNT(CASE WHEN ScanTime > DATEADD(day, -30, GETDATE()) THEN 1 END) as MonthAttendance,
//             COUNT(*) as TotalAttendance,
//             MAX(ScanTime) as LastActivity,
//             MAX(CreatedAt) as LastAttendance
//           FROM dbo.Attendance 
//           WHERE StudentID IN (${studentIds})
//           GROUP BY StudentID
//         `)
        
//         // Merge stats with student data
//         const statsMap = new Map()
//         statsResult.recordset.forEach(stat => {
//           statsMap.set(stat.StudentID, {
//             today: stat.TodayAttendance || 0,
//             week: stat.WeekAttendance || 0,
//             month: stat.MonthAttendance || 0,
//             total: stat.TotalAttendance || 0,
//             last_attendance: stat.LastAttendance,
//             last_activity: stat.LastActivity
//           })
//         })
        
//         studentsWithStats = studentsWithStats.map(student => {
//           const stats = statsMap.get(student.student_id)
//           return {
//             ...student,
//             last_activity: stats?.last_activity || null,
//             total_attendance_records: stats?.total || 0,
//             attendance_stats: stats ? {
//               today: stats.today,
//               week: stats.week,
//               month: stats.month,
//               total: stats.total,
//               last_attendance: stats.last_attendance
//             } : {
//               today: 0, week: 0, month: 0, total: 0, last_attendance: null
//             }
//           }
//         })
//       } catch (statsError) {
//         console.error('Failed to load attendance stats:', statsError.message)
//       }
//     }
//   } else if (include_stats === 'true' && studentsWithStats.length > 100) {
//     console.warn(`Skipping stats for ${studentsWithStats.length} students (too many for performance)`)
//   }

//   // Performance monitoring
//   const endTime = Date.now()
//   const responseTime = endTime - startTime
//   const dataSize = JSON.stringify(studentsWithStats).length
  
//   console.log(`Students API Performance:`, {
//     endpoint: '/api/students',
//     school_id: school_id,
//     responseTime: `${responseTime}ms`,
//     dataSizeKB: Math.round(dataSize / 1024),
//     recordCount: studentsWithStats.length,
//     totalInDB: totalCounts.total || 'unknown',
//     filteredTotal: totalCounts.filtered_total || studentsWithStats.length,
//     includeStats: include_stats === 'true',
//     limit: actualLimit,
//     search: search || 'none'
//   })

//   // Warn about slow queries
//   if (responseTime > 5000) {
//     console.warn(`SLOW QUERY WARNING: Students API took ${responseTime}ms`)
//   }

//   // Calculate pagination info
//   const currentPageSize = studentsWithStats.length
//   const totalPages = actualLimit < 999999 ? Math.ceil((totalCounts.filtered_total || 0) / actualLimit) : 1
//   const hasMore = actualLimit < 999999 && currentPageSize === actualLimit
//   const hasPrevious = parseInt(page) > 1

//   res.json({
//     success: true,
//     data: student_id ? studentsWithStats[0] : studentsWithStats,
//     students: student_id ? undefined : studentsWithStats, // Backward compatibility
    
//     // FIXED: Complete totals object
//     totals: {
//       total_students: totalCounts.total || studentsWithStats.length, // Unfiltered total (for dashboard)
//       active_students: totalCounts.active || studentsWithStats.filter(s => s.is_active).length,
//       inactive_students: totalCounts.inactive || studentsWithStats.filter(s => !s.is_active).length,
//       filtered_total: totalCounts.filtered_total || studentsWithStats.length, // Total matching current filters
//       current_page_count: currentPageSize
//     },
    
//     // ENHANCED: Complete pagination info
//     pagination: {
//       page: parseInt(page),
//       limit: actualLimit,
//       offset: calculatedOffset,
//       has_more: hasMore,
//       has_previous: hasPrevious,
//       total_pages: totalPages,
//       total_records: totalCounts.filtered_total || studentsWithStats.length, // Records matching filters
//       current_page_count: currentPageSize,
//       showing_range: {
//         from: calculatedOffset + 1,
//         to: calculatedOffset + currentPageSize,
//         of: totalCounts.filtered_total || studentsWithStats.length
//       }
//     },
    
//     filters: {
//       school_id: school_id ? parseInt(school_id) : null,
//       grade: grade || null,
//       search: search || null,
//       active_only: active_only === 'true'
//     },
    
//     // Backward compatibility
//     count: studentsWithStats.length,
//     total: totalCounts.filtered_total || studentsWithStats.length,
    
//     performance: {
//       query_time_ms: responseTime,
//       data_size_kb: Math.round(dataSize / 1024),
//       stats_included: include_stats === 'true' && studentsWithStats.length <= 100
//     },
    
//     timestamp: new Date().toISOString()
//   })
// }

// // async function handlePost(req, res) {
// //        // Check if this is an action-based request
// //   if (req.body.action) {
// //     return await handleAction(req, res)
// //   }

// //   const { name, school_id, grade, student_code, parent_password, is_active = true } = req.body
  
// //   if (!name || !school_id) {
// //     return res.status(400).json({ 
// //       success: false,
// //       error: 'Name and school_id are required' 
// //     })
// //   }

// //   const pool = await getPool()
  
// //   // Check if school exists
// //   const schoolCheck = await pool.request()
// //     .input('schoolId', sql.Int, parseInt(school_id))
// //     .query('SELECT SchoolID FROM Schools WHERE SchoolID = @schoolId')
    
// //   if (schoolCheck.recordset.length === 0) {
// //     return res.status(400).json({ 
// //       success: false,
// //       error: 'School not found' 
// //     })
// //   }
  
// //   // Check if student code is unique within school
// //   if (student_code) {
// //     const codeCheck = await pool.request()
// //       .input('studentCode', sql.NVarChar, student_code)
// //       .input('schoolId', sql.Int, parseInt(school_id))
// //       .query('SELECT StudentID FROM Students WHERE StudentCode = @studentCode AND SchoolID = @schoolId')
      
// //     if (codeCheck.recordset.length > 0) {
// //       return res.status(400).json({ 
// //         success: false,
// //         error: 'Student code already exists in this school' 
// //       })
// //     }
// //   }
  
// //   // Hash parent password if provided
// //   let hashedPassword = null
// //   let passwordSet = false
// //   if (parent_password) {
// //     hashedPassword = await bcrypt.hash(parent_password, 10)
// //     passwordSet = true
// //   }
  
// //   const result = await pool.request()
// //     .input('name', sql.NVarChar, name)
// //     .input('schoolId', sql.Int, parseInt(school_id))
// //     .input('grade', sql.NVarChar, grade)
// //     .input('studentCode', sql.NVarChar, student_code)
// //     .input('parentPasswordHash', sql.NVarChar, hashedPassword)
// //     .input('parentPasswordSet', sql.Bit, passwordSet)
// //     .input('isActive', sql.Bit, is_active)
// //     .query(`
// //       INSERT INTO Students (Name, SchoolID, Grade, StudentCode, ParentPasswordHash, ParentPasswordSet, IsActive, CreatedAt)
// //       OUTPUT INSERTED.*
// //       VALUES (@name, @schoolId, @grade, @studentCode, @parentPasswordHash, @parentPasswordSet, @isActive, GETDATE())
// //     `)

// //   const newStudent = result.recordset[0]

// //   res.status(201).json({
// //     success: true,
// //     data: {
// //       id: newStudent.StudentID,
// //       student_id: newStudent.StudentID,
// //       name: newStudent.Name,
// //       school_id: newStudent.SchoolID,
// //       grade: newStudent.Grade,
// //       student_code: newStudent.StudentCode,
// //       parent_password_set: newStudent.ParentPasswordSet,
// //       is_active: newStudent.IsActive,
// //       created_at: newStudent.CreatedAt
// //     },
// //     message: 'Student created successfully',
// //     timestamp: new Date().toISOString()
// //   })

// // }
// async function handlePost(req, res) {
//   // Check if this is an action-based request
//   if (req.body.action) {
//     return await handleAction(req, res)
//   }

//   // ADD parent_email and parent_phone here
//   const { 
//     name, 
//     school_id, 
//     grade, 
//     student_code, 
//     parent_password, 
//     parent_email,    // NEW
//     parent_phone,    // NEW
//     is_active = true 
//   } = req.body
  
//   if (!name || !school_id) {
//     return res.status(400).json({ 
//       success: false,
//       error: 'Name and school_id are required' 
//     })
//   }

//   const pool = await getPool()
  
//   // Check if school exists
//   const schoolCheck = await pool.request()
//     .input('schoolId', sql.Int, parseInt(school_id))
//     .query('SELECT SchoolID FROM Schools WHERE SchoolID = @schoolId')
    
//   if (schoolCheck.recordset.length === 0) {
//     return res.status(400).json({ 
//       success: false,
//       error: 'School not found' 
//     })
//   }
  
//   // Check if student code is unique within school
//   if (student_code) {
//     const codeCheck = await pool.request()
//       .input('studentCode', sql.NVarChar, student_code)
//       .input('schoolId', sql.Int, parseInt(school_id))
//       .query('SELECT StudentID FROM Students WHERE StudentCode = @studentCode AND SchoolID = @schoolId')
      
//     if (codeCheck.recordset.length > 0) {
//       return res.status(400).json({ 
//         success: false,
//         error: 'Student code already exists in this school' 
//       })
//     }
//   }
  
//   // Hash parent password if provided
//   let hashedPassword = null
//   let passwordSet = false
//   if (parent_password) {
//     hashedPassword = await bcrypt.hash(parent_password, 10)
//     passwordSet = true
//   }
  
//   const result = await pool.request()
//     .input('name', sql.NVarChar, name)
//     .input('schoolId', sql.Int, parseInt(school_id))
//     .input('grade', sql.NVarChar, grade)
//     .input('studentCode', sql.NVarChar, student_code)
//     .input('parentPasswordHash', sql.NVarChar, hashedPassword)
//     .input('parentPasswordSet', sql.Bit, passwordSet)
//     .input('isActive', sql.Bit, is_active)
//     .query(`
//       INSERT INTO Students (Name, SchoolID, Grade, StudentCode, ParentPasswordHash, ParentPasswordSet, IsActive, CreatedAt)
//       OUTPUT INSERTED.*
//       VALUES (@name, @schoolId, @grade, @studentCode, @parentPasswordHash, @parentPasswordSet, @isActive, GETDATE())
//     `)

//   const newStudent = result.recordset[0]
//   const newStudentId = newStudent.StudentID

//   // ========== NEW: Handle Parent Contact Info ==========
//   if (parent_email || parent_phone) {
//     try {
//       // Check if a parent record already exists for this student
//       const existingParent = await pool.request()
//         .input('studentId', sql.Int, newStudentId)
//         .query('SELECT ParentID FROM Parents WHERE StudentID = @studentId')
      
//       if (existingParent.recordset.length > 0) {
//         // Update existing parent record
//         await pool.request()
//           .input('studentId', sql.Int, newStudentId)
//           .input('email', sql.NVarChar, parent_email || null)
//           .input('phone', sql.NVarChar, parent_phone || null)
//           .query(`
//             UPDATE Parents 
//             SET Email = @email, PhoneNumber = @phone, CreatedAt = GETDATE()
//             WHERE StudentID = @studentId
//           `)
//       } else {
//         // Create new parent record
//         await pool.request()
//           .input('studentId', sql.Int, newStudentId)
//           .input('name', sql.NVarChar, `Parent of ${name}`) // Default parent name
//           .input('email', sql.NVarChar, parent_email || null)
//           .input('phone', sql.NVarChar, parent_phone || null)
//           .query(`
//             INSERT INTO Parents (StudentID, Name, Email, Phone, IsActive, CreatedAt)
//             VALUES (@studentId, @name, @email, @phone, 1, GETDATE(), GETDATE())
//           `)
//       }
//     } catch (parentError) {
//       console.error('Failed to create/update parent contact:', parentError)
//       // Don't fail the whole request, just log the error
//     }
//   }
//   // ========== END NEW CODE ==========

//   res.status(201).json({
//     success: true,
//     data: {
//       id: newStudent.StudentID,
//       student_id: newStudent.StudentID,
//       name: newStudent.Name,
//       school_id: newStudent.SchoolID,
//       grade: newStudent.Grade,
//       student_code: newStudent.StudentCode,
//       parent_password_set: newStudent.ParentPasswordSet,
//       parent_email: parent_email || null,  // NEW: Include in response
//       parent_phone: parent_phone || null,  // NEW: Include in response
//       is_active: newStudent.IsActive,
//       created_at: newStudent.CreatedAt
//     },
//     message: 'Student created successfully',
//     timestamp: new Date().toISOString()
//   })
// }

// async function handleAction(req, res) {
//   const { action } = req.body

//   if (action === 'search_student_attendance') {
//     const { query, date_from, date_to, school_id } = req.body
    
//     if (!query || !date_from || !date_to) {
//       return res.status(400).json({
//         success: false,
//         error: 'Query, date_from, and date_to are required for search_student_attendance action'
//       })
//     }

//     try {
//       const pool = await getPool()
      
//       // Search for student by name or student code
//       let studentQuery = `
//         SELECT TOP 1 StudentID, Name, Grade, StudentCode, SchoolID, 
//                (SELECT Name FROM Schools WHERE SchoolID = st.SchoolID) as SchoolName
//         FROM Students st
//         WHERE (st.Name LIKE @query OR st.StudentCode LIKE @query)
//         AND st.IsActive = 1
//       `
      
//       // Add school filter for non-company admins
//       if (school_id) {
//         studentQuery += ` AND st.SchoolID = @schoolId`
//       }
      
//       studentQuery += ` ORDER BY 
//         CASE 
//           WHEN st.Name = @exactQuery THEN 1 
//           WHEN st.StudentCode = @exactQuery THEN 2
//           WHEN st.Name LIKE @exactQuery + '%' THEN 3
//           WHEN st.StudentCode LIKE @exactQuery + '%' THEN 4
//           ELSE 5 
//         END`

//       const request = pool.request()
//       request.input('query', sql.NVarChar, `%${query}%`)
//       request.input('exactQuery', sql.NVarChar, query)
//       if (school_id) {
//         request.input('schoolId', sql.Int, parseInt(school_id))
//       }
      
//       const studentResult = await request.query(studentQuery)
      
//       if (studentResult.recordset.length === 0) {
//         return res.json({
//           success: false,
//           error: 'Student not found'
//         })
//       }
      
//       const student = studentResult.recordset[0]
      
//       // Get attendance records for date range
//       const attendanceQuery = `
//         SELECT 
//           a.AttendanceID as id,
//           a.ScanTime as scan_time,
//           a.Status as status,
//           a.CreatedAt,
//           -- Add status calculations if you have time settings
//           CASE 
//             WHEN a.Status = 'IN' THEN 'Check In'
//             WHEN a.Status = 'OUT' THEN 'Check Out'
//             ELSE a.Status
//           END as statusLabel,
//           '' as message
//         FROM Attendance a
//         WHERE a.StudentID = @studentId
//         AND CAST(a.ScanTime as DATE) BETWEEN @dateFrom AND @dateTo
//         ORDER BY a.ScanTime DESC
//       `
      
//       const attendanceRequest = pool.request()
//       attendanceRequest.input('studentId', sql.Int, student.StudentID)
//       attendanceRequest.input('dateFrom', sql.Date, new Date(date_from))
//       attendanceRequest.input('dateTo', sql.Date, new Date(date_to))
      
//       const attendanceResult = await attendanceRequest.query(attendanceQuery)
      
//       // Calculate summary statistics
//       const records = attendanceResult.recordset
//       const dateFrom = new Date(date_from)
//       const dateTo = new Date(date_to)
//       const totalDays = Math.ceil((dateTo - dateFrom) / (1000 * 60 * 60 * 24)) + 1
      
//       // Get unique days with attendance
//       const attendanceDays = new Set(
//         records.map(r => new Date(r.scan_time).toDateString())
//       )
      
//       const presentDays = attendanceDays.size
//       const absentDays = Math.max(0, totalDays - presentDays)
//       const lateArrivals = records.filter(r => 
//         r.status === 'IN' && r.statusType === 'late'
//       ).length
      
//       const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0
      
//       return res.json({
//         success: true,
//         data: {
//           student: {
//             name: student.Name,
//             student_code: student.StudentCode,
//             grade: student.Grade,
//             school_name: student.SchoolName
//           },
//           summary: {
//             present_days: presentDays,
//             absent_days: absentDays,
//             late_arrivals: lateArrivals,
//             attendance_rate: attendanceRate
//           },
//           records: records
//         }
//       })
      
//     } catch (error) {
//       console.error('Error in search_student_attendance:', error)
//       return res.json({ 
//         success: false, 
//         error: error.message 
//       })
//     }
//   }

//   if (action === 'get_absent_students') {
//     const { school_id, date } = req.body
    
//     if (!school_id || !date) {
//       return res.status(400).json({
//         success: false,
//         error: 'School ID and date are required for get_absent_students action'
//       })
//     }

//     try {
//       const pool = await getPool()
      
//       // Get all active students for the school
//       const allStudentsQuery = `
//         SELECT StudentID, Name, Grade 
//         FROM Students 
//         WHERE SchoolID = @schoolId AND IsActive = 1
//       `
      
//       // Get students who had attendance today (unique students)
//       const presentStudentsQuery = `
//         SELECT DISTINCT st.StudentID
//         FROM Students st
//         INNER JOIN Attendance a ON st.StudentID = a.StudentID
//         WHERE st.SchoolID = @schoolId 
//         AND st.IsActive = 1
//         AND CAST(a.ScanTime as DATE) = @date
//       `
      
//       const request = pool.request()
//       request.input('schoolId', sql.Int, parseInt(school_id))
//       request.input('date', sql.Date, new Date(date))
      
//       const [allStudentsResult, presentStudentsResult] = await Promise.all([
//         request.query(allStudentsQuery),
//         request.query(presentStudentsQuery)
//       ])
      
//       const allStudents = allStudentsResult.recordset
//       const presentStudentIds = new Set(presentStudentsResult.recordset.map(s => s.StudentID))
      
//       // Students who are not in the present list are absent
//       const absentStudents = allStudents.filter(student => 
//         !presentStudentIds.has(student.StudentID)
//       )
      
//       return res.json({
//         success: true,
//         absent_students: absentStudents.map(student => ({
//           student_id: student.StudentID,
//           name: student.Name,
//           grade: student.Grade
//         })),
//         total_students: allStudents.length,
//         present_count: presentStudentIds.size,
//         absent_count: absentStudents.length,
//         date: date
//       })
//     } catch (error) {
//       console.error('Error in get_absent_students:', error)
//       return res.json({ 
//         success: false, 
//         error: error.message 
//       })
//     }
//   }

//   return res.status(400).json({
//     success: false,
//     error: 'Unknown action: ' + action
//   })
// }

// // async function handlePut(req, res) {
// //   const { student_id } = req.query
// //   const { name, grade, student_code, parent_password, is_active } = req.body
  
// //   if (!student_id) {
// //     return res.status(400).json({ 
// //       success: false,
// //       error: 'Student ID is required' 
// //     })
// //   }

// //   const pool = await getPool()
  
// //   // Check if student exists
// //   const existingStudent = await pool.request()
// //     .input('studentId', sql.Int, parseInt(student_id))
// //     .query('SELECT StudentID, SchoolID FROM Students WHERE StudentID = @studentId')
    
// //   if (existingStudent.recordset.length === 0) {
// //     return res.status(404).json({ 
// //       success: false,
// //       error: 'Student not found' 
// //     })
// //   }

// //   // Check student code uniqueness if updating
// //   if (student_code) {
// //     const codeCheck = await pool.request()
// //       .input('studentCode', sql.NVarChar, student_code)
// //       .input('schoolId', sql.Int, existingStudent.recordset[0].SchoolID)
// //       .input('studentId', sql.Int, parseInt(student_id))
// //       .query('SELECT StudentID FROM Students WHERE StudentCode = @studentCode AND SchoolID = @schoolId AND StudentID != @studentId')
      
// //     if (codeCheck.recordset.length > 0) {
// //       return res.status(400).json({ 
// //         success: false,
// //         error: 'Student code already exists in this school' 
// //       })
// //     }
// //   }

// //   // Build dynamic update query
// //   const updates = []
// //   const request = pool.request()
// //   request.input('studentId', sql.Int, parseInt(student_id))
  
// //   if (name) {
// //     updates.push('Name = @name')
// //     request.input('name', sql.NVarChar, name)
// //   }
// //   if (grade !== undefined) {
// //     updates.push('Grade = @grade')
// //     request.input('grade', sql.NVarChar, grade)
// //   }
// //   if (student_code !== undefined) {
// //     updates.push('StudentCode = @studentCode')
// //     request.input('studentCode', sql.NVarChar, student_code)
// //   }
// //   if (parent_password) {
// //     const hashedPassword = await bcrypt.hash(parent_password, 10)
// //     updates.push('ParentPasswordHash = @parentPasswordHash')
// //     updates.push('ParentPasswordSet = 1')
// //     request.input('parentPasswordHash', sql.NVarChar, hashedPassword)
// //   }
// //   if (is_active !== undefined) {
// //     updates.push('IsActive = @isActive')
// //     request.input('isActive', sql.Bit, is_active)
// //   }
  
// //   if (updates.length === 0) {
// //     return res.status(400).json({ 
// //       success: false,
// //       error: 'No fields to update' 
// //     })
// //   }
  
// //   const result = await request.query(`
// //     UPDATE Students 
// //     SET ${updates.join(', ')}
// //     OUTPUT INSERTED.*
// //     WHERE StudentID = @studentId
// //   `)

// //   const updatedStudent = result.recordset[0]

// //   res.json({
// //     success: true,
// //     data: {
// //       id: updatedStudent.StudentID,
// //       student_id: updatedStudent.StudentID,
// //       name: updatedStudent.Name,
// //       school_id: updatedStudent.SchoolID,
// //       grade: updatedStudent.Grade,
// //       student_code: updatedStudent.StudentCode,
// //       parent_password_set: updatedStudent.ParentPasswordSet,
// //       is_active: updatedStudent.IsActive,
// //       created_at: updatedStudent.CreatedAt,
// //       last_login_at: updatedStudent.LastLoginAt
// //     },
// //     message: 'Student updated successfully',
// //     timestamp: new Date().toISOString()
// //   })
// // }
// async function handlePut(req, res) {
//   const { student_id } = req.query
//   const { 
//     name, 
//     grade, 
//     student_code, 
//     parent_password, 
//     parent_email,    // NEW
//     parent_phone,    // NEW
//     is_active 
//   } = req.body
  
//   if (!student_id) {
//     return res.status(400).json({ 
//       success: false,
//       error: 'Student ID is required' 
//     })
//   }

//   const pool = await getPool()
  
//   // Check if student exists
//   const existingStudent = await pool.request()
//     .input('studentId', sql.Int, parseInt(student_id))
//     .query('SELECT StudentID, SchoolID FROM Students WHERE StudentID = @studentId')
    
//   if (existingStudent.recordset.length === 0) {
//     return res.status(404).json({ 
//       success: false,
//       error: 'Student not found' 
//     })
//   }

//   // Check student code uniqueness if updating
//   if (student_code) {
//     const codeCheck = await pool.request()
//       .input('studentCode', sql.NVarChar, student_code)
//       .input('schoolId', sql.Int, existingStudent.recordset[0].SchoolID)
//       .input('studentId', sql.Int, parseInt(student_id))
//       .query('SELECT StudentID FROM Students WHERE StudentCode = @studentCode AND SchoolID = @schoolId AND StudentID != @studentId')
      
//     if (codeCheck.recordset.length > 0) {
//       return res.status(400).json({ 
//         success: false,
//         error: 'Student code already exists in this school' 
//       })
//     }
//   }

//   // Build dynamic update query for Students table
//   const updates = []
//   const request = pool.request()
//   request.input('studentId', sql.Int, parseInt(student_id))
  
//   if (name) {
//     updates.push('Name = @name')
//     request.input('name', sql.NVarChar, name)
//   }
//   if (grade !== undefined) {
//     updates.push('Grade = @grade')
//     request.input('grade', sql.NVarChar, grade)
//   }
//   if (student_code !== undefined) {
//     updates.push('StudentCode = @studentCode')
//     request.input('studentCode', sql.NVarChar, student_code)
//   }
//   if (parent_password) {
//     const hashedPassword = await bcrypt.hash(parent_password, 10)
//     updates.push('ParentPasswordHash = @parentPasswordHash')
//     updates.push('ParentPasswordSet = 1')
//     request.input('parentPasswordHash', sql.NVarChar, hashedPassword)
//   }
//   if (is_active !== undefined) {
//     updates.push('IsActive = @isActive')
//     request.input('isActive', sql.Bit, is_active)
//   }
  
//   if (updates.length === 0 && parent_email === undefined && parent_phone === undefined) {
//     return res.status(400).json({ 
//       success: false,
//       error: 'No fields to update' 
//     })
//   }
  
//   // Update student if there are student fields to update
//   let updatedStudent = existingStudent.recordset[0]
//   if (updates.length > 0) {
//     const result = await request.query(`
//       UPDATE Students 
//       SET ${updates.join(', ')}
//       OUTPUT INSERTED.*
//       WHERE StudentID = @studentId
//     `)
//     updatedStudent = result.recordset[0]
//   }

//   // ========== NEW: Handle Parent Contact Info Update ==========
//   if (parent_email !== undefined || parent_phone !== undefined) {
//     try {
//       // Check if a parent record exists for this student
//       const existingParent = await pool.request()
//         .input('studentId', sql.Int, parseInt(student_id))
//         .query('SELECT ParentID FROM Parents WHERE StudentID = @studentId')
      
//       if (existingParent.recordset.length > 0) {
//         // Update existing parent record
//         const parentUpdates = []
//         const parentRequest = pool.request()
//         parentRequest.input('studentId', sql.Int, parseInt(student_id))
        
//         if (parent_email !== undefined) {
//           parentUpdates.push('Email = @email')
//           parentRequest.input('email', sql.NVarChar, parent_email || null)
//         }
//         if (parent_phone !== undefined) {
//           parentUpdates.push('PhoneNumber = @phone')
//           parentRequest.input('phone', sql.NVarChar, parent_phone || null)
//         }
        
//         if (parentUpdates.length > 0) {
//           parentUpdates.push('CreatedAt = GETDATE()')
//           await parentRequest.query(`
//             UPDATE Parents 
//             SET ${parentUpdates.join(', ')}
//             WHERE StudentID = @studentId
//           `)
//         }
//       } else {
//         // Create new parent record if it doesn't exist
//         await pool.request()
//           .input('studentId', sql.Int, parseInt(student_id))
//           .input('name', sql.NVarChar, `Parent of ${updatedStudent.Name || name}`)
//           .input('email', sql.NVarChar, parent_email || null)
//           .input('phone', sql.NVarChar, parent_phone || null)
//           .query(`
//             INSERT INTO Parents (StudentID, Name, Email, Phone, IsActive, CreatedAt)
//             VALUES (@studentId, @name, @email, @phone, 1, GETDATE(), GETDATE())
//           `)
//       }
//     } catch (parentError) {
//       console.error('Failed to update parent contact:', parentError)
//       // Don't fail the whole request, just log the error
//     }
//   }
//   // ========== END NEW CODE ==========

//   res.json({
//     success: true,
//     data: {
//       id: updatedStudent.StudentID,
//       student_id: updatedStudent.StudentID,
//       name: updatedStudent.Name,
//       school_id: updatedStudent.SchoolID,
//       grade: updatedStudent.Grade,
//       student_code: updatedStudent.StudentCode,
//       parent_password_set: updatedStudent.ParentPasswordSet,
//       parent_email: parent_email,  // NEW: Include in response
//       parent_phone: parent_phone,  // NEW: Include in response
//       is_active: updatedStudent.IsActive,
//       created_at: updatedStudent.CreatedAt,
//       last_login_at: updatedStudent.LastLoginAt
//     },
//     message: 'Student updated successfully',
//     timestamp: new Date().toISOString()
//   })
// }


// async function handleDelete(req, res) {
//   const { student_id } = req.query
//   const { force_delete } = req.body
  
//   if (!student_id) {
//     return res.status(400).json({ 
//       success: false,
//       error: 'Student ID is required' 
//     })
//   }

//   const pool = await getPool()
  
//   // Check if student exists and get related data count
//   const studentCheck = await pool.request()
//     .input('studentId', sql.Int, parseInt(student_id))
//     .query(`
//       SELECT 
//         st.StudentID, 
//         st.Name,
//         (SELECT COUNT(*) FROM dbo.Attendance a WHERE a.StudentID = st.StudentID) as AttendanceCount,
//         (SELECT COUNT(*) FROM dbo.Parents p WHERE p.StudentID = st.StudentID) as ParentCount
//       FROM Students st 
//       WHERE st.StudentID = @studentId
//     `)
    
//   if (studentCheck.recordset.length === 0) {
//     return res.status(404).json({ 
//       success: false,
//       error: 'Student not found' 
//     })
//   }

//   const student = studentCheck.recordset[0]
  
//   // Check what related data exists
//   const hasAttendance = student.AttendanceCount > 0
//   const hasParents = student.ParentCount > 0
//   const hasRelatedData = hasAttendance || hasParents
  
//   // Soft delete if there are related records (unless force delete)
//   if (hasRelatedData && !force_delete) {
//     const result = await pool.request()
//       .input('studentId', sql.Int, parseInt(student_id))
//       .query(`
//         UPDATE Students 
//         SET IsActive = 0
//         OUTPUT INSERTED.*
//         WHERE StudentID = @studentId
//       `)

//     return res.json({
//       success: true,
//       message: `Student "${student.Name}" deactivated (has ${student.AttendanceCount} attendance records and ${student.ParentCount} parent records)`,
//       action: 'soft_delete',
//       note: 'Use force_delete: true to permanently delete all related data',
//       data: {
//         student_id: parseInt(student_id),
//         name: student.Name,
//         is_active: false,
//         attendance_count: student.AttendanceCount,
//         parent_count: student.ParentCount
//       },
//       timestamp: new Date().toISOString()
//     })
//   }

//   // Hard delete - need to delete related records first
//   if (force_delete) {
//     try {
//       // Start transaction
//       const transaction = new sql.Transaction(pool)
//       await transaction.begin()
      
//       try {
//         // Delete in correct order to avoid foreign key conflicts
        
//         // 1. Delete attendance records first
//         if (hasAttendance) {
//           await transaction.request()
//             .input('studentId', sql.Int, parseInt(student_id))
//             .query('DELETE FROM dbo.Attendance WHERE StudentID = @studentId')
//         }

//         // 2. Delete parent records
//         if (hasParents) {
//           await transaction.request()
//             .input('studentId', sql.Int, parseInt(student_id))
//             .query('DELETE FROM dbo.Parents WHERE StudentID = @studentId')
//         }

//         // 3. Finally delete the student
//         await transaction.request()
//           .input('studentId', sql.Int, parseInt(student_id))
//           .query('DELETE FROM Students WHERE StudentID = @studentId')

//         // Commit transaction
//         await transaction.commit()

//         return res.json({
//           success: true,
//           message: `Student "${student.Name}" and all related data deleted permanently`,
//           action: 'hard_delete',
//           deleted_records: {
//             attendance_records: student.AttendanceCount,
//             parent_records: student.ParentCount,
//             student: 1
//           },
//           timestamp: new Date().toISOString()
//         })

//       } catch (error) {
//         // Rollback transaction on error
//         await transaction.rollback()
//         throw error
//       }
      
//     } catch (error) {
//       console.error('Force delete error:', error)
//       return res.status(500).json({
//         success: false,
//         error: 'Failed to delete student and related data: ' + error.message,
//         timestamp: new Date().toISOString()
//       })
//     }
//   }

//   // Simple delete for students with no related data
//   await pool.request()
//     .input('studentId', sql.Int, parseInt(student_id))
//     .query('DELETE FROM Students WHERE StudentID = @studentId')

//   res.json({
//     success: true,
//     message: `Student "${student.Name}" deleted successfully`,
//     action: 'simple_delete',
//     timestamp: new Date().toISOString()
//   })
// }
// routes/students.js - Enhanced Students API with full CRUD operations
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../lib/database');

// GET - Fetch students
router.get('/', async (req, res) => {
  try {
    return await handleGet(req, res);
  } catch (error) {
    console.error('Students API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST - Create student or handle actions
router.post('/', async (req, res) => {
  try {
    return await handlePost(req, res);
  } catch (error) {
    console.error('Students API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// PUT - Update student
router.put('/', async (req, res) => {
  try {
    return await handlePut(req, res);
  } catch (error) {
    console.error('Students API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// DELETE - Delete student
router.delete('/', async (req, res) => {
  try {
    return await handleDelete(req, res);
  } catch (error) {
    console.error('Students API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

async function handleGet(req, res) {
  const startTime = Date.now();
  
  const { 
    student_id, 
    school_id, 
    grade, 
    type, 
    include_stats, 
    search, 
    active_only,
    limit = 50,        
    offset = 0,        
    page = 1           
  } = req.query;

  // Convert page to offset if needed
  const calculatedOffset = offset || ((page - 1) * limit);

  // Handle grades request
  if (type === 'grades') {
    if (!school_id) {
      return res.status(400).json({
        success: false,
        error: 'School ID is required for grades request'
      });
    }

    const pool = await getPool();
    const gradesResult = await pool.request()
      .input('schoolId', sql.Int, parseInt(school_id))
      .query(`
        SELECT DISTINCT Grade
        FROM Students 
        WHERE SchoolID = @schoolId 
        AND IsActive = 1 
        AND Grade IS NOT NULL
        ORDER BY Grade
      `);

    return res.json({
      success: true,
      grades: gradesResult.recordset.map(row => row.Grade),
      timestamp: new Date().toISOString()
    });
  }

  const pool = await getPool();

  // Build WHERE conditions first (used for both count and data queries)
  const conditions = [];
  const baseParams = {};

  if (student_id) {
    conditions.push('st.StudentID = @studentId');
    baseParams.studentId = parseInt(student_id);
  }
  
  if (school_id) {
    conditions.push('st.SchoolID = @schoolId');
    baseParams.schoolId = parseInt(school_id);
  } else if (!student_id) {
    return res.status(400).json({
      success: false,
      error: 'School ID is required'
    });
  }
  
  // Apply search filter to COUNT query too
  if (search) {
    conditions.push('(st.Name LIKE @search OR st.StudentCode LIKE @search)');
    baseParams.search = `%${search}%`;
  }
  
  if (grade) {
    conditions.push('st.Grade = @grade');
    baseParams.grade = grade;
  }
  
  if (active_only === 'true') {
    conditions.push('st.IsActive = 1');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // STEP 1: Get total counts (with same filters as main query)
  let totalCounts = { total: 0, active: 0, inactive: 0, filtered_total: 0 };
  
  if (!student_id) { // Only get counts when fetching multiple students
    const countQuery = `
      SELECT 
        COUNT(*) as filtered_total,
        COUNT(CASE WHEN st.IsActive = 1 THEN 1 END) as active,
        COUNT(CASE WHEN st.IsActive = 0 THEN 1 END) as inactive,
        -- Also get unfiltered total for dashboard
        (SELECT COUNT(*) FROM Students WHERE SchoolID = @schoolId) as total
      FROM Students st
      LEFT JOIN Schools s ON st.SchoolID = s.SchoolID
      ${whereClause}
    `;
    
    // Create request for counts
    const countRequest = pool.request();
    Object.keys(baseParams).forEach(key => {
      if (key === 'studentId') countRequest.input(key, sql.Int, baseParams[key]);
      else if (key === 'schoolId') countRequest.input(key, sql.Int, baseParams[key]);
      else countRequest.input(key, sql.NVarChar, baseParams[key]);
    });
    
    const countResult = await countRequest.query(countQuery);
    totalCounts = countResult.recordset[0];
  }

  // STEP 2: Handle special cases for limit
  let actualLimit = parseInt(limit);
  if (limit === 'all' || limit === '999999') {
    actualLimit = Math.max(totalCounts.filtered_total || 1000, 1000); // Use filtered count or fallback to 1000
  }

  // STEP 3: Build main query with optimized structure
  let query = `
  SELECT 
    st.StudentID,
    st.Name as StudentName,
    st.SchoolID,
    s.Name as SchoolName,
    st.Grade,
    st.StudentCode,
    st.ParentPasswordSet,
    st.IsActive,
    st.CreatedAt,
    st.LastLoginAt,
    p.Email as ParentEmail,
    p.PhoneNumber as ParentPhone
  FROM Students st
  LEFT JOIN Schools s ON st.SchoolID = s.SchoolID
  LEFT JOIN Parents p ON st.StudentID = p.StudentID
  ${whereClause}
  ORDER BY st.Name
`;

  // Add pagination for SQL Server
  if (actualLimit < 999999) {
    if (calculatedOffset > 0) {
      query += ` OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    } else {
      query = query.replace('SELECT', `SELECT TOP (@limit)`);
    }
  }
  
  // STEP 4: Execute main query
  const request = pool.request();
  
  // Add all parameters
  Object.keys(baseParams).forEach(key => {
    if (key === 'studentId' || key === 'schoolId') {
      request.input(key, sql.Int, baseParams[key]);
    } else {
      request.input(key, sql.NVarChar, baseParams[key]);
    }
  });
  
  if (actualLimit < 999999) {
    request.input('limit', sql.Int, actualLimit);
    if (calculatedOffset > 0) {
      request.input('offset', sql.Int, parseInt(calculatedOffset));
    }
  }
  
  const result = await request.query(query);
  
  // STEP 5: Map results
  let studentsWithStats = result.recordset.map(student => ({
    id: student.StudentID,
    student_id: student.StudentID,
    name: student.StudentName,
    school_id: student.SchoolID,
    school_name: student.SchoolName,
    grade: student.Grade,
    student_code: student.StudentCode,
    parent_password_set: student.ParentPasswordSet || false,
    parent_email: student.ParentEmail || null,
    parent_phone: student.ParentPhone || null,
    is_active: student.IsActive || false,
    created_at: student.CreatedAt,
    last_login_at: student.LastLoginAt,
    last_activity: null,
    total_attendance_records: 0
  }));

  // STEP 6: Add stats if requested (only for reasonable numbers)
  if (include_stats === 'true' && studentsWithStats.length > 0 && studentsWithStats.length <= 100) {
    const studentIds = studentsWithStats.map(s => s.student_id).join(',');
    
    if (studentIds) {
      try {
        const statsResult = await pool.request().query(`
          SELECT 
            StudentID,
            COUNT(CASE WHEN CAST(ScanTime as DATE) = CAST(GETDATE() as DATE) THEN 1 END) as TodayAttendance,
            COUNT(CASE WHEN ScanTime > DATEADD(day, -7, GETDATE()) THEN 1 END) as WeekAttendance,
            COUNT(CASE WHEN ScanTime > DATEADD(day, -30, GETDATE()) THEN 1 END) as MonthAttendance,
            COUNT(*) as TotalAttendance,
            MAX(ScanTime) as LastActivity,
            MAX(CreatedAt) as LastAttendance
          FROM dbo.Attendance 
          WHERE StudentID IN (${studentIds})
          GROUP BY StudentID
        `);
        
        // Merge stats with student data
        const statsMap = new Map();
        statsResult.recordset.forEach(stat => {
          statsMap.set(stat.StudentID, {
            today: stat.TodayAttendance || 0,
            week: stat.WeekAttendance || 0,
            month: stat.MonthAttendance || 0,
            total: stat.TotalAttendance || 0,
            last_attendance: stat.LastAttendance,
            last_activity: stat.LastActivity
          });
        });
        
        studentsWithStats = studentsWithStats.map(student => {
          const stats = statsMap.get(student.student_id);
          return {
            ...student,
            last_activity: stats?.last_activity || null,
            total_attendance_records: stats?.total || 0,
            attendance_stats: stats ? {
              today: stats.today,
              week: stats.week,
              month: stats.month,
              total: stats.total,
              last_attendance: stats.last_attendance
            } : {
              today: 0, week: 0, month: 0, total: 0, last_attendance: null
            }
          };
        });
      } catch (statsError) {
        console.error('Failed to load attendance stats:', statsError.message);
      }
    }
  } else if (include_stats === 'true' && studentsWithStats.length > 100) {
    console.warn(`Skipping stats for ${studentsWithStats.length} students (too many for performance)`);
  }

  // Performance monitoring
  const endTime = Date.now();
  const responseTime = endTime - startTime;
  const dataSize = JSON.stringify(studentsWithStats).length;
  
  console.log(`Students API Performance:`, {
    endpoint: '/api/students',
    school_id: school_id,
    responseTime: `${responseTime}ms`,
    dataSizeKB: Math.round(dataSize / 1024),
    recordCount: studentsWithStats.length,
    totalInDB: totalCounts.total || 'unknown',
    filteredTotal: totalCounts.filtered_total || studentsWithStats.length,
    includeStats: include_stats === 'true',
    limit: actualLimit,
    search: search || 'none'
  });

  // Warn about slow queries
  if (responseTime > 5000) {
    console.warn(`SLOW QUERY WARNING: Students API took ${responseTime}ms`);
  }

  // Calculate pagination info
  const currentPageSize = studentsWithStats.length;
  const totalPages = actualLimit < 999999 ? Math.ceil((totalCounts.filtered_total || 0) / actualLimit) : 1;
  const hasMore = actualLimit < 999999 && currentPageSize === actualLimit;
  const hasPrevious = parseInt(page) > 1;

  res.json({
    success: true,
    data: student_id ? studentsWithStats[0] : studentsWithStats,
    students: student_id ? undefined : studentsWithStats,
    
    totals: {
      total_students: totalCounts.total || studentsWithStats.length,
      active_students: totalCounts.active || studentsWithStats.filter(s => s.is_active).length,
      inactive_students: totalCounts.inactive || studentsWithStats.filter(s => !s.is_active).length,
      filtered_total: totalCounts.filtered_total || studentsWithStats.length,
      current_page_count: currentPageSize
    },
    
    pagination: {
      page: parseInt(page),
      limit: actualLimit,
      offset: calculatedOffset,
      has_more: hasMore,
      has_previous: hasPrevious,
      total_pages: totalPages,
      total_records: totalCounts.filtered_total || studentsWithStats.length,
      current_page_count: currentPageSize,
      showing_range: {
        from: calculatedOffset + 1,
        to: calculatedOffset + currentPageSize,
        of: totalCounts.filtered_total || studentsWithStats.length
      }
    },
    
    filters: {
      school_id: school_id ? parseInt(school_id) : null,
      grade: grade || null,
      search: search || null,
      active_only: active_only === 'true'
    },
    
    count: studentsWithStats.length,
    total: totalCounts.filtered_total || studentsWithStats.length,
    
    performance: {
      query_time_ms: responseTime,
      data_size_kb: Math.round(dataSize / 1024),
      stats_included: include_stats === 'true' && studentsWithStats.length <= 100
    },
    
    timestamp: new Date().toISOString()
  });
}

async function handlePost(req, res) {
  // Check if this is an action-based request
  if (req.body.action) {
    return await handleAction(req, res);
  }

  const { 
    name, 
    school_id, 
    grade, 
    student_code, 
    parent_password, 
    parent_email,
    parent_phone,
    is_active = true 
  } = req.body;
  
  if (!name || !school_id) {
    return res.status(400).json({ 
      success: false,
      error: 'Name and school_id are required' 
    });
  }

  const pool = await getPool();
  
  // Check if school exists
  const schoolCheck = await pool.request()
    .input('schoolId', sql.Int, parseInt(school_id))
    .query('SELECT SchoolID FROM Schools WHERE SchoolID = @schoolId');
    
  if (schoolCheck.recordset.length === 0) {
    return res.status(400).json({ 
      success: false,
      error: 'School not found' 
    });
  }
  
  // Check if student code is unique within school
  if (student_code) {
    const codeCheck = await pool.request()
      .input('studentCode', sql.NVarChar, student_code)
      .input('schoolId', sql.Int, parseInt(school_id))
      .query('SELECT StudentID FROM Students WHERE StudentCode = @studentCode AND SchoolID = @schoolId');
      
    if (codeCheck.recordset.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Student code already exists in this school' 
      });
    }
  }
  
  // Hash parent password if provided
  let hashedPassword = null;
  let passwordSet = false;
  if (parent_password) {
    hashedPassword = await bcrypt.hash(parent_password, 10);
    passwordSet = true;
  }
  
  const result = await pool.request()
    .input('name', sql.NVarChar, name)
    .input('schoolId', sql.Int, parseInt(school_id))
    .input('grade', sql.NVarChar, grade)
    .input('studentCode', sql.NVarChar, student_code)
    .input('parentPasswordHash', sql.NVarChar, hashedPassword)
    .input('parentPasswordSet', sql.Bit, passwordSet)
    .input('isActive', sql.Bit, is_active)
    .query(`
      INSERT INTO Students (Name, SchoolID, Grade, StudentCode, ParentPasswordHash, ParentPasswordSet, IsActive, CreatedAt)
      OUTPUT INSERTED.*
      VALUES (@name, @schoolId, @grade, @studentCode, @parentPasswordHash, @parentPasswordSet, @isActive, GETDATE())
    `);

  const newStudent = result.recordset[0];
  const newStudentId = newStudent.StudentID;

  // Handle Parent Contact Info
  if (parent_email || parent_phone) {
    try {
      // Check if a parent record already exists for this student
      const existingParent = await pool.request()
        .input('studentId', sql.Int, newStudentId)
        .query('SELECT ParentID FROM Parents WHERE StudentID = @studentId');
      
      if (existingParent.recordset.length > 0) {
        // Update existing parent record
        await pool.request()
          .input('studentId', sql.Int, newStudentId)
          .input('email', sql.NVarChar, parent_email || null)
          .input('phone', sql.NVarChar, parent_phone || null)
          .query(`
            UPDATE Parents 
            SET Email = @email, PhoneNumber = @phone, CreatedAt = GETDATE()
            WHERE StudentID = @studentId
          `);
      } else {
        // Create new parent record
        await pool.request()
          .input('studentId', sql.Int, newStudentId)
          .input('name', sql.NVarChar, `Parent of ${name}`)
          .input('email', sql.NVarChar, parent_email || null)
          .input('phone', sql.NVarChar, parent_phone || null)
          .query(`
            INSERT INTO Parents (StudentID, Name, PhoneNumber, Email, IsPrimary, CreatedAt)
              VALUES (@studentId, @name, @phone, @email, 1, GETDATE())
          `);
      }
    } catch (parentError) {
      console.error('Failed to create/update parent contact:', parentError);
    }
  }

  res.status(201).json({
    success: true,
    data: {
      id: newStudent.StudentID,
      student_id: newStudent.StudentID,
      name: newStudent.Name,
      school_id: newStudent.SchoolID,
      grade: newStudent.Grade,
      student_code: newStudent.StudentCode,
      parent_password_set: newStudent.ParentPasswordSet,
      parent_email: parent_email || null,
      parent_phone: parent_phone || null,
      is_active: newStudent.IsActive,
      created_at: newStudent.CreatedAt
    },
    message: 'Student created successfully',
    timestamp: new Date().toISOString()
  });
}

async function handleAction(req, res) {
  const { action } = req.body;

  if (action === 'search_student_attendance') {
    const { query, date_from, date_to, school_id } = req.body;
    
    if (!query || !date_from || !date_to) {
      return res.status(400).json({
        success: false,
        error: 'Query, date_from, and date_to are required for search_student_attendance action'
      });
    }

    try {
      const pool = await getPool();
      
      // Search for student by name or student code
      let studentQuery = `
        SELECT TOP 1 StudentID, Name, Grade, StudentCode, SchoolID, 
               (SELECT Name FROM Schools WHERE SchoolID = st.SchoolID) as SchoolName
        FROM Students st
        WHERE (st.Name LIKE @query OR st.StudentCode LIKE @query)
        AND st.IsActive = 1
      `;
      
      // Add school filter for non-company admins
      if (school_id) {
        studentQuery += ` AND st.SchoolID = @schoolId`;
      }
      
      studentQuery += ` ORDER BY 
        CASE 
          WHEN st.Name = @exactQuery THEN 1 
          WHEN st.StudentCode = @exactQuery THEN 2
          WHEN st.Name LIKE @exactQuery + '%' THEN 3
          WHEN st.StudentCode LIKE @exactQuery + '%' THEN 4
          ELSE 5 
        END`;

      const request = pool.request();
      request.input('query', sql.NVarChar, `%${query}%`);
      request.input('exactQuery', sql.NVarChar, query);
      if (school_id) {
        request.input('schoolId', sql.Int, parseInt(school_id));
      }
      
      const studentResult = await request.query(studentQuery);
      
      if (studentResult.recordset.length === 0) {
        return res.json({
          success: false,
          error: 'Student not found'
        });
      }
      
      const student = studentResult.recordset[0];
      
      // Get attendance records for date range
      const attendanceQuery = `
        SELECT 
          a.AttendanceID as id,
          a.ScanTime as scan_time,
          a.Status as status,
          a.CreatedAt,
          CASE 
            WHEN a.Status = 'IN' THEN 'Check In'
            WHEN a.Status = 'OUT' THEN 'Check Out'
            ELSE a.Status
          END as statusLabel,
          '' as message
        FROM Attendance a
        WHERE a.StudentID = @studentId
        AND CAST(a.ScanTime as DATE) BETWEEN @dateFrom AND @dateTo
        ORDER BY a.ScanTime DESC
      `;
      
      const attendanceRequest = pool.request();
      attendanceRequest.input('studentId', sql.Int, student.StudentID);
      attendanceRequest.input('dateFrom', sql.Date, new Date(date_from));
      attendanceRequest.input('dateTo', sql.Date, new Date(date_to));
      
      const attendanceResult = await attendanceRequest.query(attendanceQuery);
      
      // Calculate summary statistics
      const records = attendanceResult.recordset;
      const dateFrom = new Date(date_from);
      const dateTo = new Date(date_to);
      const totalDays = Math.ceil((dateTo - dateFrom) / (1000 * 60 * 60 * 24)) + 1;
      
      // Get unique days with attendance
      const attendanceDays = new Set(
        records.map(r => new Date(r.scan_time).toDateString())
      );
      
      const presentDays = attendanceDays.size;
      const absentDays = Math.max(0, totalDays - presentDays);
      const lateArrivals = records.filter(r => 
        r.status === 'IN' && r.statusType === 'late'
      ).length;
      
      const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;
      
      return res.json({
        success: true,
        data: {
          student: {
            name: student.Name,
            student_code: student.StudentCode,
            grade: student.Grade,
            school_name: student.SchoolName
          },
          summary: {
            present_days: presentDays,
            absent_days: absentDays,
            late_arrivals: lateArrivals,
            attendance_rate: attendanceRate
          },
          records: records
        }
      });
      
    } catch (error) {
      console.error('Error in search_student_attendance:', error);
      return res.json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  if (action === 'get_absent_students') {
    const { school_id, date } = req.body;
    
    if (!school_id || !date) {
      return res.status(400).json({
        success: false,
        error: 'School ID and date are required for get_absent_students action'
      });
    }

    try {
      const pool = await getPool();
      
      // Get all active students for the school
      const allStudentsQuery = `
        SELECT StudentID, Name, Grade 
        FROM Students 
        WHERE SchoolID = @schoolId AND IsActive = 1
      `;
      
      // Get students who had attendance today (unique students)
      const presentStudentsQuery = `
        SELECT DISTINCT st.StudentID
        FROM Students st
        INNER JOIN Attendance a ON st.StudentID = a.StudentID
        WHERE st.SchoolID = @schoolId 
        AND st.IsActive = 1
        AND CAST(a.ScanTime as DATE) = @date
      `;
      
      const request = pool.request();
      request.input('schoolId', sql.Int, parseInt(school_id));
      request.input('date', sql.Date, new Date(date));
      
      const [allStudentsResult, presentStudentsResult] = await Promise.all([
        request.query(allStudentsQuery),
        request.query(presentStudentsQuery)
      ]);
      
      const allStudents = allStudentsResult.recordset;
      const presentStudentIds = new Set(presentStudentsResult.recordset.map(s => s.StudentID));
      
      // Students who are not in the present list are absent
      const absentStudents = allStudents.filter(student => 
        !presentStudentIds.has(student.StudentID)
      );
      
      return res.json({
        success: true,
        absent_students: absentStudents.map(student => ({
          student_id: student.StudentID,
          name: student.Name,
          grade: student.Grade
        })),
        total_students: allStudents.length,
        present_count: presentStudentIds.size,
        absent_count: absentStudents.length,
        date: date
      });
    } catch (error) {
      console.error('Error in get_absent_students:', error);
      return res.json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  return res.status(400).json({
    success: false,
    error: 'Unknown action: ' + action
  });
}

async function handlePut(req, res) {
  const { student_id } = req.query;
  const { 
    name, 
    grade, 
    student_code, 
    parent_password, 
    parent_email,
    parent_phone,
    is_active 
  } = req.body;
  
  if (!student_id) {
    return res.status(400).json({ 
      success: false,
      error: 'Student ID is required' 
    });
  }

  const pool = await getPool();
  
  // Check if student exists
  const existingStudent = await pool.request()
    .input('studentId', sql.Int, parseInt(student_id))
    .query('SELECT StudentID, SchoolID, Name FROM Students WHERE StudentID = @studentId');
    
  if (existingStudent.recordset.length === 0) {
    return res.status(404).json({ 
      success: false,
      error: 'Student not found' 
    });
  }

  // Check student code uniqueness if updating
  if (student_code) {
    const codeCheck = await pool.request()
      .input('studentCode', sql.NVarChar, student_code)
      .input('schoolId', sql.Int, existingStudent.recordset[0].SchoolID)
      .input('studentId', sql.Int, parseInt(student_id))
      .query('SELECT StudentID FROM Students WHERE StudentCode = @studentCode AND SchoolID = @schoolId AND StudentID != @studentId');
      
    if (codeCheck.recordset.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Student code already exists in this school' 
      });
    }
  }

  // Build dynamic update query for Students table
  const updates = [];
  const request = pool.request();
  request.input('studentId', sql.Int, parseInt(student_id));
  
  if (name) {
    updates.push('Name = @name');
    request.input('name', sql.NVarChar, name);
  }
  if (grade !== undefined) {
    updates.push('Grade = @grade');
    request.input('grade', sql.NVarChar, grade);
  }
  if (student_code !== undefined) {
    updates.push('StudentCode = @studentCode');
    request.input('studentCode', sql.NVarChar, student_code);
  }
  if (parent_password) {
    const hashedPassword = await bcrypt.hash(parent_password, 10);
    updates.push('ParentPasswordHash = @parentPasswordHash');
    updates.push('ParentPasswordSet = 1');
    request.input('parentPasswordHash', sql.NVarChar, hashedPassword);
  }
  if (is_active !== undefined) {
    updates.push('IsActive = @isActive');
    request.input('isActive', sql.Bit, is_active);
  }
  
  if (updates.length === 0 && parent_email === undefined && parent_phone === undefined) {
    return res.status(400).json({ 
      success: false,
      error: 'No fields to update' 
    });
  }
  
  // Update student if there are student fields to update
  let updatedStudent = existingStudent.recordset[0];
  if (updates.length > 0) {
    const result = await request.query(`
      UPDATE Students 
      SET ${updates.join(', ')}
      OUTPUT INSERTED.*
      WHERE StudentID = @studentId
    `);
    updatedStudent = result.recordset[0];
  }

  // Handle Parent Contact Info Update
  if (parent_email !== undefined || parent_phone !== undefined) {
    try {
      // Check if a parent record exists for this student
      const existingParent = await pool.request()
        .input('studentId', sql.Int, parseInt(student_id))
        .query('SELECT ParentID FROM Parents WHERE StudentID = @studentId');
      
      if (existingParent.recordset.length > 0) {
        // Update existing parent record
        const parentUpdates = [];
        const parentRequest = pool.request();
        parentRequest.input('studentId', sql.Int, parseInt(student_id));
        
        if (parent_email !== undefined) {
          parentUpdates.push('Email = @email');
          parentRequest.input('email', sql.NVarChar, parent_email || null);
        }
        if (parent_phone !== undefined) {
          parentUpdates.push('PhoneNumber = @phone');
          parentRequest.input('phone', sql.NVarChar, parent_phone || null);
        }
        
        if (parentUpdates.length > 0) {
          await parentRequest.query(`
            UPDATE Parents 
            SET ${parentUpdates.join(', ')}
            WHERE StudentID = @studentId
          `);
        }
      } else {
        // Create new parent record if it doesn't exist
        await pool.request()
          .input('studentId', sql.Int, parseInt(student_id))
          .input('name', sql.NVarChar, `Parent of ${updatedStudent.Name || name}`)
          .input('email', sql.NVarChar, parent_email || null)
          .input('phone', sql.NVarChar, parent_phone || null)
          .query(`
            INSERT INTO Parents (StudentID, Name, PhoneNumber, Email, IsPrimary, CreatedAt)
              VALUES (@studentId, @name, @phone, @email, 1, GETDATE())
          `);
      }
    } catch (parentError) {
      console.error('Failed to update parent contact:', parentError);
    }
  }

  res.json({
    success: true,
    data: {
      id: updatedStudent.StudentID,
      student_id: updatedStudent.StudentID,
      name: updatedStudent.Name,
      school_id: updatedStudent.SchoolID,
      grade: updatedStudent.Grade,
      student_code: updatedStudent.StudentCode,
      parent_password_set: updatedStudent.ParentPasswordSet,
      parent_email: parent_email,
      parent_phone: parent_phone,
      is_active: updatedStudent.IsActive,
      created_at: updatedStudent.CreatedAt,
      last_login_at: updatedStudent.LastLoginAt
    },
    message: 'Student updated successfully',
    timestamp: new Date().toISOString()
  });
}

async function handleDelete(req, res) {
  const { student_id } = req.query;
  const { force_delete } = req.body;
  
  if (!student_id) {
    return res.status(400).json({ 
      success: false,
      error: 'Student ID is required' 
    });
  }

  const pool = await getPool();
  
  // Check if student exists and get related data count
  const studentCheck = await pool.request()
    .input('studentId', sql.Int, parseInt(student_id))
    .query(`
      SELECT 
        st.StudentID, 
        st.Name,
        (SELECT COUNT(*) FROM dbo.Attendance a WHERE a.StudentID = st.StudentID) as AttendanceCount,
        (SELECT COUNT(*) FROM dbo.Parents p WHERE p.StudentID = st.StudentID) as ParentCount
      FROM Students st 
      WHERE st.StudentID = @studentId
    `);
    
  if (studentCheck.recordset.length === 0) {
    return res.status(404).json({ 
      success: false,
      error: 'Student not found' 
    });
  }

  const student = studentCheck.recordset[0];
  
  // Check what related data exists
  const hasAttendance = student.AttendanceCount > 0;
  const hasParents = student.ParentCount > 0;
  const hasRelatedData = hasAttendance || hasParents;
  
  // Soft delete if there are related records (unless force delete)
  if (hasRelatedData && !force_delete) {
    const result = await pool.request()
      .input('studentId', sql.Int, parseInt(student_id))
      .query(`
        UPDATE Students 
        SET IsActive = 0
        OUTPUT INSERTED.*
        WHERE StudentID = @studentId
      `);

    return res.json({
      success: true,
      message: `Student "${student.Name}" deactivated (has ${student.AttendanceCount} attendance records and ${student.ParentCount} parent records)`,
      action: 'soft_delete',
      note: 'Use force_delete: true to permanently delete all related data',
      data: {
        student_id: parseInt(student_id),
        name: student.Name,
        is_active: false,
        attendance_count: student.AttendanceCount,
        parent_count: student.ParentCount
      },
      timestamp: new Date().toISOString()
    });
  }

  // Hard delete - need to delete related records first
  if (force_delete) {
    try {
      // Start transaction
      const transaction = pool.transaction();
      await transaction.begin();
      
      try {
        // Delete in correct order to avoid foreign key conflicts
        
        // 1. Delete attendance records first
        if (hasAttendance) {
          await transaction.request()
            .input('studentId', sql.Int, parseInt(student_id))
            .query('DELETE FROM dbo.Attendance WHERE StudentID = @studentId');
        }

        // 2. Delete parent records
        if (hasParents) {
          await transaction.request()
            .input('studentId', sql.Int, parseInt(student_id))
            .query('DELETE FROM dbo.Parents WHERE StudentID = @studentId');
        }

        // 3. Finally delete the student
        await transaction.request()
          .input('studentId', sql.Int, parseInt(student_id))
          .query('DELETE FROM Students WHERE StudentID = @studentId');

        // Commit transaction
        await transaction.commit();

        return res.json({
          success: true,
          message: `Student "${student.Name}" and all related data deleted permanently`,
          action: 'hard_delete',
          deleted_records: {
            attendance_records: student.AttendanceCount,
            parent_records: student.ParentCount,
            student: 1
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        // Rollback transaction on error
        await transaction.rollback();
        throw error;
      }
      
    } catch (error) {
      console.error('Force delete error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete student and related data: ' + error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Simple delete for students with no related data
  await pool.request()
    .input('studentId', sql.Int, parseInt(student_id))
    .query('DELETE FROM Students WHERE StudentID = @studentId');

  res.json({
    success: true,
    message: `Student "${student.Name}" deleted successfully`,
    action: 'simple_delete',
    timestamp: new Date().toISOString()
  });
}

module.exports = router;