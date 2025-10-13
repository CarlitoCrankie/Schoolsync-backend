const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../lib/database');

router.get('/attendance-debug', async (req, res) => {
  try {
    const { school_id, date } = req.query;
    const pool = await getPool();
    
    // Get server timezone
    const timezoneQuery = await pool.request().query('SELECT SYSDATETIMEOFFSET() as ServerTime');
    
    // Get sample attendance records
    const attendanceQuery = await pool.request()
      .input('schoolId', sql.Int, school_id || 2)
      .input('date', sql.Date, date || new Date())
      .query(`
        SELECT TOP 10
          a.AttendanceID,
          a.StudentID,
          a.ScanTime,
          a.Status,
          CAST(a.ScanTime as DATE) as ScanDate,
          CAST(a.ScanTime as TIME) as ScanTimeOnly
        FROM Attendance a
        WHERE a.SchoolID = @schoolId
        AND CAST(a.ScanTime as DATE) = CAST(@date as DATE)
        ORDER BY a.ScanTime DESC
      `);
    
    // Count students
    const studentQuery = await pool.request()
      .input('schoolId', sql.Int, school_id || 2)
      .query(`
        SELECT COUNT(*) as TotalStudents
        FROM Students
        WHERE SchoolID = @schoolId
        AND IsActive = 1
      `);
    
    // Count unique students with attendance today
    const presentQuery = await pool.request()
      .input('schoolId', sql.Int, school_id || 2)
      .input('date', sql.Date, date || new Date())
      .query(`
        SELECT COUNT(DISTINCT StudentID) as PresentStudents
        FROM Attendance
        WHERE SchoolID = @schoolId
        AND CAST(ScanTime as DATE) = CAST(@date as DATE)
      `);
    
    res.json({
      serverInfo: {
        serverTime: timezoneQuery.recordset[0],
        nodeEnv: process.env.NODE_ENV,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      requestParams: {
        school_id,
        date,
        parsedDate: new Date(date || new Date()).toISOString()
      },
      counts: {
        totalStudents: studentQuery.recordset[0].TotalStudents,
        presentStudents: presentQuery.recordset[0].PresentStudents,
        absentStudents: studentQuery.recordset[0].TotalStudents - presentQuery.recordset[0].PresentStudents
      },
      sampleRecords: attendanceQuery.recordset
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;