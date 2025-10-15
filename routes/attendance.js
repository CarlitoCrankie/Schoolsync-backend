// routes/attendance.js - API for parent attendance data
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../lib/database');

// Main attendance endpoint
router.post('/', async (req, res) => {
  const { action, student_id, school_id, limit = 50, days = 30 } = req.body;

  try {
    const pool = await getPool();
    let result = {};

    switch (action) {
      case 'get_student_attendance':
        result = await getStudentAttendance(pool, student_id, school_id, limit, days);
        break;
      case 'get_attendance_stats':
        result = await getAttendanceStats(pool, student_id, school_id, days);
        break;
      case 'get_recent_activity':
        result = await getRecentActivity(pool, student_id, school_id, 10);
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    res.status(200).json({
      success: true,
      action,
      timestamp: new Date().toISOString(),
      ...result
    });

  } catch (error) {
    console.error('Attendance API Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      action,
      timestamp: new Date().toISOString()
    });
  }
});

async function getStudentAttendance(pool, studentId, schoolId, limit, days) {
  try {
    if (!studentId) {
      throw new Error('Student ID is required');
    }

    // ✅ Get school time settings from SchoolTimeSettings table
    const settingsQuery = await pool.request()
      .input('schoolId', sql.Int, schoolId || 2)
      .query(`
        SELECT TOP 1
          ISNULL(SchoolStartTime, '08:00:00') as SchoolStartTime,
          ISNULL(SchoolEndTime, '15:00:00') as SchoolEndTime,
          ISNULL(LateArrivalTime, '08:30:00') as LateArrivalTime,
          ISNULL(EarlyDepartureTime, '14:30:00') as EarlyDepartureTime
        FROM [SchoolApp].[dbo].[SchoolTimeSettings]
        WHERE SchoolID = @schoolId
      `);
    
    // Use settings from DB or fallback to defaults
    const settings = settingsQuery.recordset[0] || {};
    const schoolStartTime = settings.SchoolStartTime || '08:00:00';
    const schoolEndTime = settings.SchoolEndTime || '15:00:00';
    const lateArrivalTime = settings.LateArrivalTime || '08:30:00';
    const earlyDepartureTime = settings.EarlyDepartureTime || '14:30:00';

    console.log('⚙️ School time settings loaded:', {
      schoolId,
      startTime: schoolStartTime,
      endTime: schoolEndTime,
      lateArrivalTime,
      earlyDepartureTime
    });

    // Get attendance records for the specified period
    const attendanceQuery = await pool.request()
      .input('studentId', sql.Int, studentId)
      .input('schoolId', sql.Int, schoolId || 2)
      .input('limit', sql.Int, limit)
      .input('days', sql.Int, days)
      .query(`
        SELECT TOP (@limit)
          a.AttendanceID,
          a.StudentID,
          a.ScanTime,
          a.Status,
          a.CreatedAt,
          CONVERT(TIME, a.ScanTime) as ScanTimeOnly,
          s.Name as StudentName,
          s.Grade
        FROM dbo.Attendance a
        LEFT JOIN Students s ON a.StudentID = s.StudentID
        WHERE a.StudentID = @studentId 
        AND a.SchoolID = @schoolId
        AND a.ScanTime >= DATEADD(day, -@days, GETDATE())
        ORDER BY a.ScanTime DESC
      `);

    // Process attendance data with status types
    const attendanceRecords = attendanceQuery.recordset.map(record => {
      const scanTime = new Date(record.ScanTime);
      const timeOnly = record.ScanTimeOnly;
      
      let statusType = null;
      let statusLabel = null;
      let message = null;
      
      if (record.Status === 'IN') {
        // Use LateArrivalTime from settings
        if (timeOnly > lateArrivalTime) {
          statusType = 'late';
          statusLabel = 'Late Arrival';
          message = `Arrived after ${lateArrivalTime}`;
        } else {
          statusType = 'on-time';
          statusLabel = 'On Time';
          message = 'Arrived on time';
        }
      } else if (record.Status === 'OUT') {
        // Use EarlyDepartureTime from settings
        if (timeOnly < earlyDepartureTime) {
          statusType = 'early-departure';
          statusLabel = 'Early Departure';
          message = `Left before ${earlyDepartureTime}`;
        } else {
          statusType = 'on-time';
          statusLabel = 'On Time';
          message = 'Left on time';
        }
      }
      
      return {
        id: record.AttendanceID,
        date: scanTime.toISOString().split('T')[0],
        scanTime: scanTime.toISOString(),
        status: record.Status,
        statusType,
        statusLabel,
        message,
        studentName: record.StudentName,
        grade: record.Grade
      };
    });

    // Calculate proper stats using unique days
    const stats = await calculateProperAttendanceStats(pool, studentId, schoolId, days);

    return {
      attendance: attendanceRecords,
      stats,
      student: attendanceRecords.length > 0 ? {
        name: attendanceRecords[0].studentName,
        grade: attendanceRecords[0].grade
      } : null,
      period: {
        days,
        from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0]
      },
      schoolSettings: {
        startTime: schoolStartTime,
        endTime: schoolEndTime,
        lateArrivalTime,
        earlyDepartureTime
      }
    };

  } catch (error) {
    console.error('Get student attendance error:', error);
    throw new Error(`Get student attendance failed: ${error.message}`);
  }
}

// Get attendance statistics with proper unique day counting
async function getAttendanceStats(pool, studentId, schoolId, days) {
  try {
    if (!studentId) {
      throw new Error('Student ID is required');
    }

    // Use the new proper stats calculation function
    const stats = await calculateProperAttendanceStats(pool, studentId, schoolId, days);

    return {
      stats,
      totalRecords: stats.totalRecords || 0,
      period: days
    };

  } catch (error) {
    throw new Error(`Get attendance stats failed: ${error.message}`);
  }
}

// Proper stats calculation function that counts unique days
// async function calculateProperAttendanceStats(pool, studentId, schoolId, days) {
//   try {
//     // ✅ Get school time settings from SchoolTimeSettings table
//     const settingsQuery = await pool.request()
//       .input('schoolId', sql.Int, schoolId || 2)
//       .query(`
//         SELECT TOP 1
//           ISNULL(SchoolStartTime, '08:00:00') as SchoolStartTime,
//           ISNULL(LateArrivalTime, '08:30:00') as LateArrivalTime
//         FROM [SchoolApp].[dbo].[SchoolTimeSettings]
//         WHERE SchoolID = @schoolId
//       `);
    
//     // Use settings from DB or fallback to defaults
//     const startTime = settingsQuery.recordset[0]?.SchoolStartTime || '08:00:00';
//     const lateTime = settingsQuery.recordset[0]?.LateArrivalTime || '08:30:00';
    
//     console.log('⚙️ School time settings loaded:', {
//       schoolId,
//       startTime,
//       lateTime
//     });
    
//     // Calculate the actual start date based on days parameter
//     const startDate = new Date();
//     startDate.setDate(startDate.getDate() - days);
//     startDate.setHours(0, 0, 0, 0);
    
//     // Calculate stats based on unique DAYS, not individual records
//     const statsQuery = await pool.request()
//       .input('studentId', sql.Int, studentId)
//       .input('schoolId', sql.Int, schoolId || 2)
//       .input('startDate', sql.DateTime, startDate)
//       .input('lateArrivalTime', sql.Time, lateTime)
//       .query(`
//         SELECT 
//           -- Count unique days with at least one check-in (Present Days)
//           COUNT(DISTINCT CASE 
//             WHEN a.Status = 'IN' 
//             THEN CAST(a.ScanTime as DATE) 
//           END) as PresentDays,
          
//           -- Count unique days with late arrivals (Late Days)
//           -- Using LateArrivalTime from settings
//           COUNT(DISTINCT CASE 
//             WHEN a.Status = 'IN' 
//             AND CONVERT(TIME, a.ScanTime) > @lateArrivalTime
//             THEN CAST(a.ScanTime as DATE) 
//           END) as LateDays,
          
//           -- Total unique attendance days
//           COUNT(DISTINCT CAST(a.ScanTime as DATE)) as TotalAttendanceDays,
          
//           -- Total attendance records (for reference)
//           COUNT(a.AttendanceID) as TotalRecords,
          
//           -- Get earliest attendance date for accurate range
//           MIN(CAST(a.ScanTime as DATE)) as EarliestDate,
//           MAX(CAST(a.ScanTime as DATE)) as LatestDate
//         FROM dbo.Attendance a
//         WHERE a.StudentID = @studentId 
//         AND a.SchoolID = @schoolId
//         AND a.ScanTime >= @startDate
//       `);

//     const result = statsQuery.recordset[0];
    
//     // Calculate the actual date range to count weekdays
//     const earliestDate = result.EarliestDate ? new Date(result.EarliestDate) : startDate;
//     const latestDate = result.LatestDate ? new Date(result.LatestDate) : new Date();
    
//     // Count actual weekdays (Mon-Fri) in the date range
//     let expectedSchoolDays = 0;
//     const currentDate = new Date(earliestDate);
//     const endDate = new Date(latestDate);
//     endDate.setHours(23, 59, 59, 999);
    
//     while (currentDate <= endDate) {
//       const dayOfWeek = currentDate.getDay();
//       if (dayOfWeek >= 1 && dayOfWeek <= 5) {
//         expectedSchoolDays++;
//       }
//       currentDate.setDate(currentDate.getDate() + 1);
//     }
    
//     // Calculate derived stats
//     const presentDays = result.PresentDays || 0;
//     const lateDays = result.LateDays || 0;
//     const absentDays = Math.max(0, expectedSchoolDays - presentDays);
    
//     // Calculate attendance rate
//     const attendanceRate = expectedSchoolDays > 0 
//       ? Math.round((presentDays / expectedSchoolDays) * 100) 
//       : 0;

//     console.log('📊 Attendance Stats:', {
//       studentId,
//       schoolId,
//       dateRange: {
//         earliest: earliestDate.toISOString().split('T')[0],
//         latest: latestDate.toISOString().split('T')[0]
//       },
//       expectedSchoolDays,
//       presentDays,
//       lateDays,
//       absentDays,
//       attendanceRate: `${attendanceRate}%`
//     });

//     return {
//       presentDays: presentDays,
//       lateDays: lateDays,
//       absentDays: absentDays,
//       attendanceRate: attendanceRate,
//       totalAttendanceDays: result.TotalAttendanceDays || 0,
//       totalRecords: result.TotalRecords || 0,
//       expectedSchoolDays: expectedSchoolDays,
//       period: {
//         days: days,
//         earliestRecord: result.EarliestDate,
//         latestRecord: result.LatestDate,
//         actualStartDate: earliestDate.toISOString().split('T')[0],
//         actualEndDate: latestDate.toISOString().split('T')[0]
//       }
//     };

//   } catch (error) {
//     console.error('Calculate attendance stats error:', error);
//     throw new Error(`Calculate attendance stats failed: ${error.message}`);
//   }
// }
async function calculateProperAttendanceStats(pool, studentId, schoolId, days) {
  try {
    // Get school time settings
    const settingsQuery = await pool.request()
      .input('schoolId', sql.Int, schoolId || 2)
      .query(`
        SELECT TOP 1
          ISNULL(SchoolStartTime, '08:00:00') as SchoolStartTime,
          ISNULL(LateArrivalTime, '08:30:00') as LateArrivalTime
        FROM [SchoolApp].[dbo].[SchoolTimeSettings]
        WHERE SchoolID = @schoolId
      `);
    
    const lateTime = settingsQuery.recordset[0]?.LateArrivalTime || '08:30:00';
    
    // ✅ Calculate date range for query
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);
    
    console.log('📅 Stats calculation range:', {
      from: startDate.toISOString().split('T')[0],
      to: endDate.toISOString().split('T')[0],
      days
    });
    
    // Get attendance data
    const statsQuery = await pool.request()
      .input('studentId', sql.Int, studentId)
      .input('schoolId', sql.Int, schoolId || 2)
      .input('startDate', sql.DateTime, startDate)
      .input('lateArrivalTime', sql.Time, lateTime)
      .query(`
        SELECT 
          -- Count unique days with ANY attendance (IN or OUT)
          COUNT(DISTINCT CAST(a.ScanTime as DATE)) as PresentDays,
          
          -- Count unique days with late arrivals (only IN records)
          COUNT(DISTINCT CASE 
            WHEN a.Status = 'IN' 
            AND CONVERT(TIME, a.ScanTime) > @lateArrivalTime
            THEN CAST(a.ScanTime as DATE) 
          END) as LateDays,
          
          -- Total records for reference
          COUNT(a.AttendanceID) as TotalRecords,
          
          -- Get earliest and latest dates
          MIN(CAST(a.ScanTime as DATE)) as EarliestDate,
          MAX(CAST(a.ScanTime as DATE)) as LatestDate
        FROM dbo.Attendance a
        WHERE a.StudentID = @studentId 
        AND a.SchoolID = @schoolId
        AND a.ScanTime >= @startDate
      `);

    const result = statsQuery.recordset[0];
    
    // ✅ FIX: Count expected school days from QUERY START DATE to TODAY
    // Not from earliest attendance to latest attendance!
    let expectedSchoolDays = 0;
    const current = new Date(startDate);
    const today = new Date(endDate);
    today.setHours(23, 59, 59, 999);
    
    while (current <= today) {
      const dayOfWeek = current.getDay();
      // Count Monday-Friday only
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        expectedSchoolDays++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    // Calculate stats
    const presentDays = result.PresentDays || 0;
    const lateDays = result.LateDays || 0;
    const absentDays = Math.max(0, expectedSchoolDays - presentDays);
    
    // Calculate attendance rate
    const attendanceRate = expectedSchoolDays > 0 
      ? Math.round((presentDays / expectedSchoolDays) * 100) 
      : 0;

    console.log('📊 Attendance Stats Calculated:', {
      studentId,
      dateRange: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
      expectedSchoolDays,
      presentDays,
      absentDays,
      lateDays,
      attendanceRate: `${attendanceRate}%`,
      earliestRecord: result.EarliestDate,
      latestRecord: result.LatestDate
    });

    return {
      presentDays: presentDays,
      lateDays: lateDays,
      absentDays: absentDays,
      attendanceRate: attendanceRate,
      totalRecords: result.TotalRecords || 0,
      expectedSchoolDays: expectedSchoolDays,
      period: {
        days: days,
        earliestRecord: result.EarliestDate,
        latestRecord: result.LatestDate,
        queryStartDate: startDate.toISOString().split('T')[0],
        queryEndDate: endDate.toISOString().split('T')[0]
      }
    };

  } catch (error) {
    console.error('❌ Calculate attendance stats error:', error);
    throw new Error(`Calculate attendance stats failed: ${error.message}`);
  }
}

// Get recent activity (last few check-ins/outs)
async function getRecentActivity(pool, studentId, schoolId, limit) {
  try {
    if (!studentId) {
      throw new Error('Student ID is required');
    }

    const recentQuery = await pool.request()
      .input('studentId', sql.Int, studentId)
      .input('schoolId', sql.Int, schoolId || 2)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit)
          a.AttendanceID,
          a.ScanTime,
          a.Status,
          a.CreatedAt
        FROM dbo.Attendance a
        WHERE a.StudentID = @studentId 
        AND a.SchoolID = @schoolId
        ORDER BY a.ScanTime DESC
      `);

    const recentActivity = recentQuery.recordset.map(record => ({
      id: record.AttendanceID,
      scanTime: record.ScanTime.toISOString(),
      status: record.Status,
      createdAt: record.CreatedAt.toISOString(),
      displayText: `${record.Status === 'IN' ? 'Checked in' : 'Checked out'} at ${record.ScanTime.toLocaleTimeString()}`
    }));

    return {
      recentActivity,
      count: recentActivity.length
    };

  } catch (error) {
    throw new Error(`Get recent activity failed: ${error.message}`);
  }
}

// Helper function to calculate attendance statistics (legacy, kept for reference)
function calculateAttendanceStats(records, periodDays) {
  if (!records || records.length === 0) {
    return {
      totalDays: periodDays,
      presentDays: 0,
      lateDays: 0,
      absentDays: periodDays,
      attendanceRate: 0,
      checkIns: 0,
      checkOuts: 0
    };
  }

  // Group records by date to determine daily attendance
  const dailyAttendance = {};
  let checkIns = 0;
  let checkOuts = 0;

  records.forEach(record => {
    const date = record.date || record.scanTime.split('T')[0];
    
    if (!dailyAttendance[date]) {
      dailyAttendance[date] = { hasCheckIn: false, hasCheckOut: false, records: [] };
    }
    
    dailyAttendance[date].records.push(record);
    
    if (record.status === 'IN') {
      dailyAttendance[date].hasCheckIn = true;
      checkIns++;
    } else if (record.status === 'OUT') {
      dailyAttendance[date].hasCheckOut = true;
      checkOuts++;
    }
  });

  // Calculate attendance stats
  const uniqueDatesWithActivity = Object.keys(dailyAttendance).length;
  const presentDays = Object.values(dailyAttendance).filter(day => day.hasCheckIn).length;
  
  // For simplicity, we'll consider any day with a check-in as present
  // In a more sophisticated system, you might have business rules for late arrivals
  const lateDays = 0; // Could be calculated based on check-in times vs school start time
  const absentDays = Math.max(0, periodDays - presentDays);
  const attendanceRate = periodDays > 0 ? ((presentDays / periodDays) * 100) : 0;

  return {
    totalDays: periodDays,
    presentDays,
    lateDays,
    absentDays,
    attendanceRate: Math.round(attendanceRate * 10) / 10, // Round to 1 decimal place
    checkIns,
    checkOuts,
    activeDays: uniqueDatesWithActivity,
    lastActivity: records.length > 0 ? records[0].scanTime : null
  };
}

module.exports = router;