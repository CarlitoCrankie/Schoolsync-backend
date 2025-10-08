// /**
//  * Complete Analytics API - Clean rewrite with all functionality
//  * Handles overview, real-time, students, schools, sync-performance, trends, and attendance analytics
//  */
// const { executeQuery } = require('../../lib/database');

// export default async function handler(req, res) {
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

//   if (req.method === 'OPTIONS') {
//     res.status(200).end();
//     return;
//   }

//   if (req.method !== 'GET') {
//     return res.status(405).json({ error: 'Method not allowed' });
//   }

//   const startTime = Date.now();

//   try {
//     const { 
//       type, 
//       school_id, 
//       company_id, 
//       date_from, 
//       date_to,
//       granularity = 'daily',
//       grade
//     } = req.query;

//     console.log('Analytics API called:', {
//       type,
//       school_id,
//       company_id,
//       grade,
//       timestamp: new Date().toISOString()
//     });

//     let result;
//     switch (type) {
//       case 'overview':
//         result = await getOverviewAnalytics(school_id, company_id);
//         break;
//       case 'attendance':
//         result = await getAttendanceAnalytics(school_id, date_from, date_to, granularity);
//         break;
//       case 'students':
//         result = await getStudentAnalytics(school_id);
//         break;
//       case 'schools':
//         result = await getSchoolAnalytics();
//         break;
//       case 'sync-performance':
//         result = await getSyncPerformanceAnalytics(school_id);
//         break;
//       case 'trends':
//         result = await getTrendAnalytics(school_id, date_from, date_to);
//         break;
//       case 'real-time':
//         result = await getRealTimeAttendance(school_id, date_from, date_to, grade, company_id);
//         break;
//       default:
//         return res.status(400).json({ 
//           error: 'Invalid analytics type', 
//           available_types: ['overview', 'attendance', 'students', 'schools', 'sync-performance', 'trends', 'real-time']
//         });
//     }

//     const totalTime = Date.now() - startTime;

//     if (totalTime > 5000) {
//       console.warn(`SLOW QUERY WARNING: ${type} took ${totalTime}ms`);
//     }

//     res.json({
//       success: true,
//       type: type,
//       filters: {
//         school_id: school_id,
//         company_id: company_id,
//         date_from: date_from,
//         date_to: date_to,
//         granularity: granularity,
//         grade: grade
//       },
//       ...result,
//       queryTime: totalTime,
//       timestamp: new Date().toISOString()
//     });

//   } catch (error) {
//     const totalTime = Date.now() - startTime;
//     console.error('Analytics API error:', {
//       error: error.message,
//       stack: error.stack,
//       totalTime,
//       timestamp: new Date().toISOString()
//     });
    
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       timestamp: new Date().toISOString(),
//       queryTime: totalTime
//     });
//   }
// }

// async function getOverviewAnalytics(schoolId, companyId) {
//   const startTime = Date.now();

//   try {
//     const params = {};
//     let schoolFilter = '';
    
//     if (schoolId) {
//       schoolFilter = ' AND s.SchoolID = @schoolId';
//       params.schoolId = parseInt(schoolId);
//     }

//     // Basic school and student counts
//     const basicStatsResult = await executeQuery(`
//       SELECT 
//         COUNT(DISTINCT s.SchoolID) as TotalSchools,
//         COUNT(DISTINCT CASE WHEN s.Status = 'active' THEN s.SchoolID END) as ActiveSchools,
//         COUNT(DISTINCT st.StudentID) as TotalStudents,
//         COUNT(DISTINCT CASE WHEN st.IsActive = 1 THEN st.StudentID END) as ActiveStudents
//       FROM Schools s
//       LEFT JOIN Students st ON s.SchoolID = st.SchoolID
//       WHERE 1=1 ${schoolFilter}
//       OPTION (MAXDOP 1)
//     `, params, 30000);

//     // Students present today
//     const todayPresentResult = await executeQuery(`
//       SELECT COUNT(DISTINCT a.StudentID) as TodayPresentStudents
//       FROM Attendance a WITH (NOLOCK)
//       INNER JOIN Students st ON a.StudentID = st.StudentID
//       INNER JOIN Schools s ON st.SchoolID = s.SchoolID
//       WHERE CAST(a.ScanTime as DATE) = CAST(GETDATE() as DATE)
//       AND a.Status IN ('IN', 'OUT')
//       AND st.IsActive = 1
//       ${schoolFilter}
//       OPTION (MAXDOP 1)
//     `, params, 30000);

//     // Attendance record counts
//     const attendanceCountsResult = await executeQuery(`
//       SELECT 
//         COUNT(CASE WHEN CAST(a.ScanTime as DATE) = CAST(GETDATE() as DATE) THEN a.AttendanceID END) as TodayAttendanceRecords,
//         COUNT(CASE WHEN a.ScanTime > DATEADD(day, -7, GETDATE()) THEN a.AttendanceID END) as WeekAttendance,
//         COUNT(CASE WHEN a.ScanTime > DATEADD(day, -30, GETDATE()) THEN a.AttendanceID END) as MonthAttendance
//       FROM Attendance a WITH (NOLOCK)
//       INNER JOIN Students st ON a.StudentID = st.StudentID
//       INNER JOIN Schools s ON st.SchoolID = s.SchoolID
//       WHERE 1=1 ${schoolFilter}
//       OPTION (MAXDOP 1)
//     `, params, 30000);

//     // Sync agent status (aggregate)
//     const syncResult = await executeQuery(`
//       SELECT 
//         COUNT(DISTINCT sas.SchoolID) as TotalAgents,
//         COUNT(CASE 
//           WHEN ISNULL(sas.Status, 'stopped') != 'stopped' 
//           AND sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) 
//           THEN 1 
//         END) as OnlineAgents,
//         COUNT(CASE 
//           WHEN ISNULL(sas.Status, 'stopped') != 'stopped' 
//           AND sas.LastHeartbeat BETWEEN DATEADD(MINUTE, -30, GETDATE()) AND DATEADD(MINUTE, -10, GETDATE()) 
//           THEN 1 
//         END) as WarningAgents,
//         COUNT(CASE 
//           WHEN ISNULL(sas.Status, 'stopped') = 'stopped' 
//           THEN 1 
//         END) as StoppedAgents,
//         SUM(ISNULL(sas.TotalSynced, 0)) as TotalSynced,
//         SUM(ISNULL(sas.TotalErrors, 0)) as TotalErrors
//       FROM SyncAgentStatus sas
//       WHERE EXISTS (SELECT 1 FROM Schools s WHERE s.SchoolID = sas.SchoolID ${schoolFilter.replace(' AND s.', ' AND ')})
//       OPTION (MAXDOP 1)
//     `, params, 30000);

//     // NEW: Get specific school's sync status when school_id is provided
//     let schoolSpecificSyncStatus = null;
//     if (schoolId) {
//       try {
//         const schoolSyncResult = await executeQuery(`
//           SELECT TOP 1
//             sas.Status,
//             sas.LastHeartbeat,
//             CASE 
//               WHEN ISNULL(sas.Status, 'stopped') = 'stopped' THEN 'offline'
//               WHEN ISNULL(sas.Status, 'stopped') = 'error' THEN 'offline'
//               WHEN sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) THEN 'online'
//               WHEN sas.LastHeartbeat > DATEADD(MINUTE, -30, GETDATE()) THEN 'warning'
//               WHEN sas.LastHeartbeat IS NULL THEN 'offline'
//               ELSE 'offline'
//             END as sync_status
//           FROM SyncAgentStatus sas
//           WHERE sas.SchoolID = @schoolId
//           ORDER BY sas.LastHeartbeat DESC
//         `, params, 15000);

//         schoolSpecificSyncStatus = schoolSyncResult.recordset[0] || { sync_status: 'offline', LastHeartbeat: null };
//         console.log(`School ${schoolId} sync agent status:`, schoolSpecificSyncStatus);
//       } catch (syncError) {
//         console.error(`Failed to get sync status for school ${schoolId}:`, syncError.message);
//         schoolSpecificSyncStatus = { sync_status: 'offline', LastHeartbeat: null };
//       }
//     }

//     // Recent activity
//     const activityResult = await executeQuery(`
//       SELECT TOP 20
//         a.AttendanceID,
//         a.StudentID,
//         st.Name as StudentName,
//         s.SchoolID,
//         s.Name as SchoolName,
//         a.ScanTime,
//         a.Status,
//         a.CreatedAt,
//         DATEDIFF(MINUTE, a.CreatedAt, GETDATE()) as MinutesAgo
//       FROM Attendance a WITH (NOLOCK)
//       JOIN Students st ON a.StudentID = st.StudentID
//       JOIN Schools s ON st.SchoolID = s.SchoolID
//       WHERE a.ScanTime > DATEADD(HOUR, -4, GETDATE()) ${schoolFilter}
//       ORDER BY a.ScanTime DESC
//       OPTION (MAXDOP 1)
//     `, params, 30000);

//     // Combine results
//     const basicStats = basicStatsResult.recordset[0];
//     const todayStats = todayPresentResult.recordset[0];
//     const attendanceCounts = attendanceCountsResult.recordset[0];
//     const syncStats = syncResult.recordset[0];
    
//     const totalActiveStudents = basicStats.ActiveStudents || 0;
//     const presentToday = todayStats.TodayPresentStudents || 0;
//     const absentToday = Math.max(0, totalActiveStudents - presentToday);

//     const queryTime = Date.now() - startTime;
//     console.log(`Overview analytics completed in ${queryTime}ms`);
//     console.log(`Present today: ${presentToday} unique students out of ${totalActiveStudents} active students`);

//     const responseData = {
//       overview: {
//         schools: {
//           total: basicStats.TotalSchools || 0,
//           active: basicStats.ActiveSchools || 0,
//           inactive: (basicStats.TotalSchools || 0) - (basicStats.ActiveSchools || 0)
//         },
//         students: {
//           total: basicStats.TotalStudents || 0,
//           active: totalActiveStudents,
//           inactive: (basicStats.TotalStudents || 0) - totalActiveStudents
//         },
//         attendance: {
//           today: presentToday,
//           absent_today: absentToday,
//           week: attendanceCounts.WeekAttendance || 0,
//           month: attendanceCounts.MonthAttendance || 0,
//           today_records: attendanceCounts.TodayAttendanceRecords || 0,
//           attendance_rate: totalActiveStudents > 0 ? Math.round((presentToday / totalActiveStudents) * 100) : 0
//         },
//         sync_agents: {
//           total: syncStats.TotalAgents || 0,
//           online: syncStats.OnlineAgents || 0,
//           warning: syncStats.WarningAgents || 0,
//           stopped: syncStats.StoppedAgents || 0,
//           offline: Math.max(0, (syncStats.TotalAgents || 0) - (syncStats.OnlineAgents || 0) - (syncStats.WarningAgents || 0) - (syncStats.StoppedAgents || 0))
//         },
//         performance: {
//           total_synced: syncStats.TotalSynced || 0,
//           total_errors: syncStats.TotalErrors || 0,
//           error_rate: (syncStats.TotalSynced + syncStats.TotalErrors) > 0 ? 
//             Math.round((syncStats.TotalErrors / (syncStats.TotalSynced + syncStats.TotalErrors)) * 100) : 0
//         }
//       },
//       current_activity: activityResult.recordset.map(row => ({
//         attendance_id: row.AttendanceID,
//         student_id: row.StudentID,
//         student_name: row.StudentName,
//         school_id: row.SchoolID,
//         school_name: row.SchoolName,
//         scan_time: row.ScanTime,
//         status: row.Status,
//         created_at: row.CreatedAt,
//         minutes_ago: row.MinutesAgo
//       }))
//     };

//     // Add school-specific sync status if available
//     if (schoolSpecificSyncStatus) {
//       responseData.sync_status = schoolSpecificSyncStatus.sync_status;
//       responseData.sync_last_heartbeat = schoolSpecificSyncStatus.LastHeartbeat;
//     }

//     return responseData;
//   } catch (error) {
//     console.error('Error in getOverviewAnalytics:', error);
//     throw error;
//   }
// }

// // Real-time Attendance Analytics
// async function getRealTimeAttendance(schoolId, dateFrom, dateTo, grade = null, companyId = null) {
//   const startTime = Date.now();

//   try {
//     const params = {};
    
//     // Handle date range
//     let dateFilter = '';
//     if (dateFrom && dateTo) {
//       const startDateTime = new Date(dateFrom + 'T00:00:00.000Z');
//       const endDateTime = new Date(dateTo + 'T23:59:59.999Z');
      
//       params.startDate = startDateTime;
//       params.endDate = endDateTime;
//       dateFilter = ' AND a.ScanTime BETWEEN @startDate AND @endDate';
//     } else {
//       const defaultStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
//       params.defaultStart = defaultStart;
//       dateFilter = ' AND a.ScanTime >= @defaultStart';
//     }
    
//     let schoolFilter = '';
//     if (schoolId) {
//       schoolFilter = ' AND st.SchoolID = @schoolId';
//       params.schoolId = parseInt(schoolId);
//     }

//     // Grade filter
//     let gradeFilter = '';
//     if (grade && grade.trim() !== '') {
//       const decodedGrade = decodeURIComponent(grade.trim());
//       if (decodedGrade.length <= 50) {
//         gradeFilter = ' AND st.Grade = @grade';
//         params.grade = decodedGrade;
//       }
//     }

//     const combinedFilter = dateFilter + schoolFilter + gradeFilter;

//     // Get time settings
//     let timeSettingsMap = {};
//     try {
//       let timeSettingsParams = {};
//       let timeSettingsFilter = '';
      
//       if (schoolId) {
//         timeSettingsFilter = 'WHERE sts.SchoolID = @schoolId';
//         timeSettingsParams.schoolId = parseInt(schoolId);
//       }

//       const timeSettingsResult = await executeQuery(`
//         SELECT 
//           sts.SchoolID,
//           CONVERT(VARCHAR(5), sts.SchoolStartTime, 108) as SchoolStartTime,
//           CONVERT(VARCHAR(5), sts.SchoolEndTime, 108) as SchoolEndTime,
//           CONVERT(VARCHAR(5), sts.LateArrivalTime, 108) as LateArrivalTime,
//           CONVERT(VARCHAR(5), sts.EarlyDepartureTime, 108) as EarlyDepartureTime,
//           sts.Timezone
//         FROM SchoolTimeSettings sts
//         ${timeSettingsFilter}
//       `, timeSettingsParams, 15000);

//       timeSettingsResult.recordset.forEach(settings => {
//         timeSettingsMap[settings.SchoolID] = {
//           school_start_time: settings.SchoolStartTime,
//           school_end_time: settings.SchoolEndTime,
//           late_arrival_time: settings.LateArrivalTime,
//           early_departure_time: settings.EarlyDepartureTime,
//           timezone: settings.Timezone
//         };
//       });
//     } catch (error) {
//       console.warn('Failed to load time settings for analytics:', error.message);
//     }

//     // Main attendance query
//     const attendanceResult = await executeQuery(`
//       SELECT TOP 100
//         a.AttendanceID as attendance_id,
//         a.StudentID as student_id,
//         st.Name as student_name,
//         st.Grade as grade,
//         a.ScanTime as scan_time,
//         a.Status as status,
//         a.CreatedAt as created_at,
//         s.Name as school_name,
//         s.SchoolID as school_id
//       FROM Attendance a WITH (NOLOCK)
//       INNER JOIN Students st ON a.StudentID = st.StudentID
//       INNER JOIN Schools s ON st.SchoolID = s.SchoolID
//       WHERE 1=1 
//       ${combinedFilter}
//       ORDER BY a.ScanTime DESC, a.CreatedAt DESC
//       OPTION (MAXDOP 1)
//     `, params, 45000);

//     // Enhance attendance records with time settings
//     const enhancedAttendance = attendanceResult.recordset.map(record => {
//       const baseRecord = {
//         attendance_id: record.attendance_id,
//         student_id: record.student_id,
//         student_name: record.student_name,
//         grade: record.grade,
//         scan_time: record.scan_time,
//         status: record.status,
//         created_at: record.created_at,
//         school_name: record.school_name,
//         school_id: record.school_id
//       };

//       const timeSettings = timeSettingsMap[record.school_id];
//       if (timeSettings) {
//         const statusInfo = calculateAttendanceStatus(
//           record.scan_time,
//           record.status,
//           timeSettings
//         );
        
//         return {
//           ...baseRecord,
//           statusLabel: statusInfo.statusLabel,
//           statusType: statusInfo.statusType,
//           message: statusInfo.message
//         };
//       }

//       return baseRecord;
//     });

//     // Summary query
//     const summaryResult = await executeQuery(`
//       SELECT 
//         COUNT(*) as total_records,
//         COUNT(CASE WHEN a.Status = 'IN' THEN 1 END) as check_ins,
//         COUNT(CASE WHEN a.Status = 'OUT' THEN 1 END) as check_outs,
//         COUNT(DISTINCT a.StudentID) as unique_students,
//         MIN(a.ScanTime) as earliest_scan,
//         MAX(a.ScanTime) as latest_scan
//       FROM Attendance a WITH (NOLOCK)
//       INNER JOIN Students st ON a.StudentID = st.StudentID
//       INNER JOIN Schools s ON st.SchoolID = s.SchoolID
//       WHERE 1=1 
//       ${combinedFilter}
//       OPTION (MAXDOP 1)
//     `, params, 30000);

//     const summary = summaryResult.recordset[0];
//     const lateArrivals = enhancedAttendance.filter(r => r.statusType === 'late' && r.status === 'IN').length;
//     const earlyArrivals = enhancedAttendance.filter(r => r.statusType === 'early-arrival' && r.status === 'IN').length;
//     const onTimeArrivals = enhancedAttendance.filter(r => r.statusType === 'on-time' && r.status === 'IN').length;

//     const queryTime = Date.now() - startTime;
//     console.log(`Real-time attendance completed in ${queryTime}ms`);

//     return {
//       current_activity: enhancedAttendance,
//       summary: {
//         total_records: summary.total_records || 0,
//         check_ins: summary.check_ins || 0,
//         check_outs: summary.check_outs || 0,
//         unique_students: summary.unique_students || 0,
//         late_arrivals: lateArrivals,
//         early_arrivals: earlyArrivals,
//         on_time_arrivals: onTimeArrivals,
//         punctuality_rate: summary.check_ins > 0 ? Math.round((onTimeArrivals / summary.check_ins) * 100) : 0,
//         date_range: {
//           earliest: summary.earliest_scan,
//           latest: summary.latest_scan,
//           requested_from: dateFrom,
//           requested_to: dateTo
//         }
//       },
//       time_settings_applied: Object.keys(timeSettingsMap).length > 0,
//       schools_with_settings: Object.keys(timeSettingsMap).map(Number),
//       filters_applied: {
//         school_id: schoolId,
//         company_id: companyId,
//         date_from: dateFrom,
//         date_to: dateTo,
//         grade: grade ? decodeURIComponent(grade) : null
//       }
//     };
//   } catch (error) {
//     console.error('Error in getRealTimeAttendance:', error);
//     throw error;
//   }
// }

// // School Analytics
// async function getSchoolAnalytics() {
//   const startTime = Date.now();

//   try {
//     const schoolsResult = await executeQuery(`
//       SELECT 
//         s.SchoolID,
//         s.Name as SchoolName,
//         ISNULL(s.Location, 'Not specified') as Location,
//         ISNULL(s.Status, 'active') as SchoolStatus,
//         COUNT(DISTINCT st.StudentID) as TotalStudents,
//         COUNT(DISTINCT CASE WHEN st.IsActive = 1 THEN st.StudentID END) as ActiveStudents,
//         COUNT(CASE WHEN a.ScanTime >= DATEADD(DAY, -30, GETDATE()) THEN a.AttendanceID END) as RecentAttendance,
//         COUNT(CASE WHEN CAST(a.ScanTime as DATE) = CAST(GETDATE() as DATE) THEN a.AttendanceID END) as TodayAttendance,
//         MAX(a.CreatedAt) as LastAttendanceRecord,
//         sas.Status as SyncStatus,
//         sas.LastHeartbeat,
//         CASE 
//           WHEN sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) THEN 'Online'
//           WHEN sas.LastHeartbeat > DATEADD(MINUTE, -30, GETDATE()) THEN 'Warning'  
//           WHEN sas.LastHeartbeat IS NULL THEN 'Unknown'
//           ELSE 'Offline'
//         END as SyncConnectionStatus,
//         ISNULL(sas.TotalSynced, 0) as TotalSynced,
//         ISNULL(sas.TotalErrors, 0) as TotalErrors
//       FROM Schools s
//       LEFT JOIN Students st ON s.SchoolID = st.SchoolID
//       LEFT JOIN (
//         SELECT StudentID, ScanTime, CreatedAt, AttendanceID
//         FROM Attendance WITH (NOLOCK)
//         WHERE ScanTime >= DATEADD(DAY, -30, GETDATE())
//       ) a ON st.StudentID = a.StudentID
//       LEFT JOIN SyncAgentStatus sas ON s.SchoolID = sas.SchoolID
//       GROUP BY s.SchoolID, s.Name, s.Location, s.Status, sas.Status, sas.LastHeartbeat, sas.TotalSynced, sas.TotalErrors
//       ORDER BY s.Name
//       OPTION (MAXDOP 1)
//     `, {}, 30000);

//     const queryTime = Date.now() - startTime;
//     console.log(`Schools analytics completed in ${queryTime}ms`);

//     return {
//       schools: schoolsResult.recordset.map(row => ({
//         school_id: row.SchoolID,
//         name: row.SchoolName,
//         location: row.Location,
//         status: row.SchoolStatus,
//         students: {
//           total: row.TotalStudents || 0,
//           active: row.ActiveStudents || 0,
//           inactive: (row.TotalStudents || 0) - (row.ActiveStudents || 0)
//         },
//         attendance: {
//           total: row.RecentAttendance || 0,
//           today: row.TodayAttendance || 0,
//           last_record: row.LastAttendanceRecord
//         },
//         sync_agent: {
//           status: row.SyncStatus,
//           connection_status: row.SyncConnectionStatus,
//           last_heartbeat: row.LastHeartbeat,
//           total_synced: row.TotalSynced,
//           total_errors: row.TotalErrors,
//           health_score: row.TotalSynced > 0 ? 
//             Math.round((1 - (row.TotalErrors / (row.TotalSynced + row.TotalErrors))) * 100) : 100
//         }
//       })),
//       summary: {
//         total_schools: schoolsResult.recordset.length,
//         active_schools: schoolsResult.recordset.filter(row => row.SchoolStatus === 'active').length,
//         schools_online: schoolsResult.recordset.filter(row => row.SyncConnectionStatus === 'Online').length
//       }
//     };
//   } catch (error) {
//     console.error('Error in getSchoolAnalytics:', error);
//     throw error;
//   }
// }

// // Attendance Analytics
// async function getAttendanceAnalytics(schoolId, dateFrom, dateTo, granularity) {
//   try {
//     const endDate = dateTo ? new Date(dateTo) : new Date();
//     const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
//     const params = {
//       startDate: startDate,
//       endDate: endDate
//     };
    
//     let schoolFilter = '';
//     if (schoolId) {
//       schoolFilter = ' AND s.SchoolID = @schoolId';
//       params.schoolId = parseInt(schoolId);
//     }

//     const schoolBreakdownResult = await executeQuery(`
//       SELECT 
//         s.SchoolID,
//         s.Name as SchoolName,
//         ISNULL(s.Location, 'Not specified') as Location,
//         COUNT(a.AttendanceID) as AttendanceCount,
//         COUNT(DISTINCT a.StudentID) as UniqueStudents
//       FROM Schools s
//       LEFT JOIN Students st ON s.SchoolID = st.SchoolID
//       LEFT JOIN Attendance a WITH (NOLOCK) ON st.StudentID = a.StudentID 
//         AND a.ScanTime BETWEEN @startDate AND @endDate
//       WHERE 1=1 ${schoolFilter}
//       GROUP BY s.SchoolID, s.Name, s.Location
//       ORDER BY AttendanceCount DESC
//       OPTION (MAXDOP 1)
//     `, params, 30000);

//     const totalAttendance = schoolBreakdownResult.recordset.reduce((sum, row) => sum + (row.AttendanceCount || 0), 0);
//     const totalUniqueStudents = Math.max(...schoolBreakdownResult.recordset.map(row => row.UniqueStudents || 0), 0);

//     return {
//       date_range: {
//         from: startDate.toISOString(),
//         to: endDate.toISOString(),
//         granularity: granularity
//       },
//       school_breakdown: schoolBreakdownResult.recordset.map(row => ({
//         school_id: row.SchoolID,
//         school_name: row.SchoolName,
//         location: row.Location,
//         attendance_count: row.AttendanceCount || 0,
//         unique_students: row.UniqueStudents || 0
//       })),
//       summary: {
//         total_attendance: totalAttendance,
//         total_unique_students: totalUniqueStudents,
//         avg_daily_attendance: Math.round(totalAttendance / Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))))
//       }
//     };
//   } catch (error) {
//     console.error('Error in getAttendanceAnalytics:', error);
//     throw error;
//   }
// }

// // Student Analytics
// async function getStudentAnalytics(schoolId) {
//   try {
//     const params = {};
//     let schoolFilter = '';
//     if (schoolId) {
//       schoolFilter = ' AND s.SchoolID = @schoolId';
//       params.schoolId = parseInt(schoolId);
//     }

//     const gradeDistributionResult = await executeQuery(`
//       SELECT 
//         ISNULL(st.Grade, 'Not specified') as Grade,
//         COUNT(st.StudentID) as TotalStudents,
//         COUNT(CASE WHEN st.IsActive = 1 THEN st.StudentID END) as ActiveStudents,
//         COUNT(DISTINCT a.StudentID) as StudentsWithAttendance
//       FROM Students st
//       LEFT JOIN Schools s ON st.SchoolID = s.SchoolID
//       LEFT JOIN (
//         SELECT DISTINCT StudentID 
//         FROM Attendance WITH (NOLOCK)
//         WHERE ScanTime >= DATEADD(DAY, -30, GETDATE())
//       ) a ON st.StudentID = a.StudentID
//       WHERE 1=1 ${schoolFilter}
//       GROUP BY st.Grade
//       ORDER BY st.Grade
//       OPTION (MAXDOP 1)
//     `, params, 20000);

//     const totalStats = gradeDistributionResult.recordset.reduce((acc, row) => ({
//       total_students: acc.total_students + (row.TotalStudents || 0),
//       active_students: acc.active_students + (row.ActiveStudents || 0),
//       students_with_attendance: acc.students_with_attendance + (row.StudentsWithAttendance || 0)
//     }), { total_students: 0, active_students: 0, students_with_attendance: 0 });

//     return {
//       grade_distribution: gradeDistributionResult.recordset.map(row => ({
//         grade: row.Grade,
//         total_students: row.TotalStudents || 0,
//         active_students: row.ActiveStudents || 0,
//         students_with_attendance: row.StudentsWithAttendance || 0,
//         attendance_rate: row.ActiveStudents > 0 ? 
//           Math.round((row.StudentsWithAttendance / row.ActiveStudents) * 100) : 0
//       })),
//       totals: {
//         total_grades: gradeDistributionResult.recordset.length,
//         total_students: totalStats.total_students,
//         active_students: totalStats.active_students,
//         students_with_attendance: totalStats.students_with_attendance,
//         overall_participation_rate: totalStats.active_students > 0 ? 
//           Math.round((totalStats.students_with_attendance / totalStats.active_students) * 100) : 0
//       }
//     };
//   } catch (error) {
//     console.error('Error in getStudentAnalytics:', error);
//     throw error;
//   }
// }

// // Sync Performance Analytics
// async function getSyncPerformanceAnalytics(schoolId) {
//   try {
//     const params = {};
//     let schoolFilter = '';
//     if (schoolId) {
//       schoolFilter = ' AND s.SchoolID = @schoolId';
//       params.schoolId = parseInt(schoolId);
//     }

//     const performanceResult = await executeQuery(`
//       SELECT 
//         s.SchoolID,
//         s.Name as SchoolName,
//         ISNULL(sas.Status, 'stopped') as Status,
//         sas.LastHeartbeat,
//         ISNULL(sas.UptimeHours, 0) as UptimeHours,
//         ISNULL(sas.TotalSynced, 0) as TotalSynced,
//         ISNULL(sas.TotalErrors, 0) as TotalErrors,
//         ISNULL(sas.MemoryUsageMB, 0) as MemoryUsageMB,
//         CASE 
//           WHEN ISNULL(sas.Status, 'stopped') = 'stopped' THEN 'Stopped'
//           WHEN ISNULL(sas.Status, 'stopped') = 'error' THEN 'Error'
//           WHEN sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) THEN 'Online'
//           WHEN sas.LastHeartbeat > DATEADD(MINUTE, -30, GETDATE()) THEN 'Warning'
//           WHEN sas.LastHeartbeat IS NULL THEN 'Unknown'
//           ELSE 'Offline'
//         END as ConnectionStatus,
//         CASE 
//           WHEN sas.TotalSynced + sas.TotalErrors > 0 
//           THEN ROUND((sas.TotalErrors * 100.0 / (sas.TotalSynced + sas.TotalErrors)), 2)
//           ELSE 0 
//         END as ErrorRate
//       FROM Schools s
//       LEFT JOIN SyncAgentStatus sas ON s.SchoolID = sas.SchoolID
//       WHERE 1=1 ${schoolFilter}
//       ORDER BY s.Name
//       OPTION (MAXDOP 1)
//     `, params, 15000);

//     const agents = performanceResult.recordset.map(row => ({
//       school_id: row.SchoolID,
//       school_name: row.SchoolName,
//       status: row.Status,
//       connection_status: row.ConnectionStatus,
//       uptime_hours: row.UptimeHours,
//       total_synced: row.TotalSynced,
//       total_errors: row.TotalErrors,
//       error_rate: row.ErrorRate,
//       memory_usage_mb: row.MemoryUsageMB,
//       health_score: calculateHealthScore(row),
//       last_heartbeat: row.LastHeartbeat
//     }));

//     return {
//       agents: agents,
//       performance_metrics: {
//         total_agents: agents.length,
//         online_agents: agents.filter(a => a.connection_status === 'Online').length,
//         stopped_agents: agents.filter(a => a.connection_status === 'Stopped').length,
//         offline_agents: agents.filter(a => a.connection_status === 'Offline').length,
//         avg_error_rate: agents.length > 0 ? 
//           Math.round(agents.reduce((sum, a) => sum + a.error_rate, 0) / agents.length * 100) / 100 : 0,
//         total_synced: agents.reduce((sum, a) => sum + a.total_synced, 0),
//         total_errors: agents.reduce((sum, a) => sum + a.total_errors, 0),
//         avg_uptime_hours: agents.length > 0 ? 
//           Math.round(agents.reduce((sum, a) => sum + a.uptime_hours, 0) / agents.length * 100) / 100 : 0
//       },
//       health_distribution: {
//         excellent: agents.filter(a => a.health_score >= 90).length,
//         good: agents.filter(a => a.health_score >= 70 && a.health_score < 90).length,
//         fair: agents.filter(a => a.health_score >= 50 && a.health_score < 70).length,
//         poor: agents.filter(a => a.health_score < 50).length
//       }
//     };
//   } catch (error) {
//     console.error('Error in getSyncPerformanceAnalytics:', error);
//     throw error;
//   }
// }

// // Trend Analytics
// async function getTrendAnalytics(schoolId, dateFrom, dateTo) {
//   try {
//     const endDate = dateTo ? new Date(dateTo) : new Date();
//     const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
//     const params = {
//       startDate: startDate,
//       endDate: endDate
//     };
    
//     let schoolFilter = '';
//     if (schoolId) {
//       schoolFilter = ' AND s.SchoolID = @schoolId';
//       params.schoolId = parseInt(schoolId);
//     }

//     // Daily trends
//     const dailyTrendsResult = await executeQuery(`
//       SELECT 
//         CAST(a.ScanTime as DATE) as ScanDate,
//         COUNT(a.AttendanceID) as TotalScans,
//         COUNT(CASE WHEN a.Status = 'IN' THEN a.AttendanceID END) as CheckIns,
//         COUNT(CASE WHEN a.Status = 'OUT' THEN a.AttendanceID END) as CheckOuts,
//         COUNT(DISTINCT a.StudentID) as UniqueStudents
//       FROM Attendance a WITH (NOLOCK)
//       INNER JOIN Students st ON a.StudentID = st.StudentID
//       INNER JOIN Schools s ON st.SchoolID = s.SchoolID
//       WHERE a.ScanTime BETWEEN @startDate AND @endDate ${schoolFilter}
//       GROUP BY CAST(a.ScanTime as DATE)
//       ORDER BY ScanDate
//       OPTION (MAXDOP 1)
//     `, params, 25000);

//     // Hourly patterns
//     const hourlyPatternsResult = await executeQuery(`
//       SELECT 
//         DATEPART(HOUR, a.ScanTime) as ScanHour,
//         COUNT(a.AttendanceID) as TotalScans,
//         COUNT(CASE WHEN a.Status = 'IN' THEN a.AttendanceID END) as CheckIns,
//         COUNT(CASE WHEN a.Status = 'OUT' THEN a.AttendanceID END) as CheckOuts
//       FROM Attendance a WITH (NOLOCK)
//       INNER JOIN Students st ON a.StudentID = st.StudentID
//       INNER JOIN Schools s ON st.SchoolID = s.SchoolID
//       WHERE a.ScanTime BETWEEN @startDate AND @endDate ${schoolFilter}
//       GROUP BY DATEPART(HOUR, a.ScanTime)
//       ORDER BY ScanHour
//       OPTION (MAXDOP 1)
//     `, params, 25000);

//     // Calculate trend analysis
//     const dailyData = dailyTrendsResult.recordset;
//     let overallTrend = 'stable';
//     let trendPercentage = 0;

//     if (dailyData.length >= 2) {
//       const firstHalf = dailyData.slice(0, Math.floor(dailyData.length / 2));
//       const secondHalf = dailyData.slice(Math.floor(dailyData.length / 2));
      
//       const firstHalfAvg = firstHalf.reduce((sum, day) => sum + day.TotalScans, 0) / firstHalf.length;
//       const secondHalfAvg = secondHalf.reduce((sum, day) => sum + day.TotalScans, 0) / secondHalf.length;
      
//       if (firstHalfAvg > 0) {
//         trendPercentage = Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100);
        
//         if (trendPercentage > 10) overallTrend = 'increasing';
//         else if (trendPercentage < -10) overallTrend = 'decreasing';
//         else overallTrend = 'stable';
//       }
//     }

//     return {
//       date_range: {
//         from: startDate.toISOString(),
//         to: endDate.toISOString()
//       },
//       daily_trends: dailyData.map(row => ({
//         date: row.ScanDate,
//         total_scans: row.TotalScans || 0,
//         check_ins: row.CheckIns || 0,
//         check_outs: row.CheckOuts || 0,
//         unique_students: row.UniqueStudents || 0
//       })),
//       hourly_patterns: hourlyPatternsResult.recordset.map(row => ({
//         hour: row.ScanHour,
//         total_scans: row.TotalScans || 0,
//         check_ins: row.CheckIns || 0,
//         check_outs: row.CheckOuts || 0
//       })),
//       trend_analysis: {
//         overall_trend: overallTrend,
//         trend_percentage: trendPercentage,
//         total_days_analyzed: dailyData.length,
//         peak_hour: hourlyPatternsResult.recordset.length > 0 ? 
//           hourlyPatternsResult.recordset.reduce((max, hour) => 
//             hour.TotalScans > max.TotalScans ? hour : max
//           ).ScanHour : 0,
//         avg_daily_scans: dailyData.length > 0 ? 
//           Math.round(dailyData.reduce((sum, day) => sum + day.TotalScans, 0) / dailyData.length) : 0
//       }
//     };
//   } catch (error) {
//     console.error('Error in getTrendAnalytics:', error);
//     throw error;
//   }
// }

// // Helper Functions
// function calculateAttendanceStatus(scanTime, status, timeSettings) {
//   if (!scanTime || !status || !timeSettings) {
//     return {
//       status: status,
//       statusLabel: status === 'IN' ? 'Check In' : 'Check Out',
//       statusType: 'normal',
//       message: null,
//       scanTime: scanTime ? new Date(scanTime).toTimeString().substr(0, 5) : null
//     };
//   }

//   const scanDateTime = new Date(scanTime);
//   const scanTimeOnly = scanDateTime.toTimeString().substr(0, 5);
  
//   const {
//     school_start_time = '08:00',
//     school_end_time = '15:00',
//     late_arrival_time = '08:30',
//     early_departure_time = '14:00'
//   } = timeSettings;

//   let statusType = 'normal';
//   let statusLabel = status === 'IN' ? 'Check In' : 'Check Out';
//   let message = null;

//   if (status === 'IN') {
//     if (scanTimeOnly <= school_start_time) {
//       statusType = 'early-arrival';
//       statusLabel = 'Early Arrival';
//       message = `Arrived early at ${scanTimeOnly}`;
//     } else if (scanTimeOnly <= late_arrival_time) {
//       statusType = 'on-time';
//       statusLabel = 'On Time';
//       message = `Arrived on time at ${scanTimeOnly}`;
//     } else {
//       statusType = 'late';
//       statusLabel = 'Late Arrival';
//       message = `Arrived late at ${scanTimeOnly} (after ${late_arrival_time})`;
//     }
//   } else if (status === 'OUT') {
//     if (scanTimeOnly < early_departure_time) {
//       statusType = 'early-departure';
//       statusLabel = 'Early Departure';
//       message = `Left early at ${scanTimeOnly} (before ${early_departure_time})`;
//     } else if (scanTimeOnly < school_end_time) {
//       statusType = 'normal-departure';
//       statusLabel = 'Normal Departure';
//       message = `Left at ${scanTimeOnly}`;
//     } else {
//       statusType = 'after-hours';
//       statusLabel = 'After Hours';
//       message = `Left after school hours at ${scanTimeOnly}`;
//     }
//   }

//   return {
//     status,
//     statusLabel,
//     statusType,
//     message,
//     scanTime: scanTimeOnly
//   };
// }

// function calculateHealthScore(agent) {
//   let score = 100;
  
//   if (agent.Status === 'stopped') {
//     score -= 60;
//   } else if (agent.ConnectionStatus === 'Offline') {
//     score -= 50;
//   } else if (agent.ConnectionStatus === 'Warning') {
//     score -= 20;
//   } else if (agent.ConnectionStatus === 'Unknown') {
//     score -= 30;
//   }
  
//   const errorRate = agent.ErrorRate || 0;
//   if (errorRate > 10) score -= 30;
//   else if (errorRate > 5) score -= 15;
//   else if (errorRate > 1) score -= 5;
  
//   return Math.max(0, Math.min(100, score));
// }
// routes/analytics.js
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../lib/database');

// Helper function to execute queries with timeout
async function executeQuery(query, params = {}, timeout = 30000) {
  const pool = await getPool();
  const request = pool.request();
  request.setTimeout(timeout);
  
  // Add parameters to request
  Object.entries(params).forEach(([key, value]) => {
    if (value instanceof Date) {
      request.input(key, sql.DateTime, value);
    } else if (typeof value === 'number') {
      request.input(key, sql.Int, value);
    } else {
      request.input(key, sql.NVarChar, value);
    }
  });
  
  return await request.query(query);
}

// Main analytics endpoint
router.get('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const { 
      type, 
      school_id, 
      company_id, 
      date_from, 
      date_to,
      granularity = 'daily',
      grade
    } = req.query;

    console.log('Analytics API called:', {
      type,
      school_id,
      company_id,
      grade,
      timestamp: new Date().toISOString()
    });

    let result;
    switch (type) {
      case 'overview':
        result = await getOverviewAnalytics(school_id, company_id);
        break;
      case 'attendance':
        result = await getAttendanceAnalytics(school_id, date_from, date_to, granularity);
        break;
      case 'students':
        result = await getStudentAnalytics(school_id);
        break;
      case 'schools':
        result = await getSchoolAnalytics();
        break;
      case 'sync-performance':
        result = await getSyncPerformanceAnalytics(school_id);
        break;
      case 'trends':
        result = await getTrendAnalytics(school_id, date_from, date_to);
        break;
      case 'real-time':
        result = await getRealTimeAttendance(school_id, date_from, date_to, grade, company_id);
        break;
      default:
        return res.status(400).json({ 
          error: 'Invalid analytics type', 
          available_types: ['overview', 'attendance', 'students', 'schools', 'sync-performance', 'trends', 'real-time']
        });
    }

    const totalTime = Date.now() - startTime;

    if (totalTime > 5000) {
      console.warn(`SLOW QUERY WARNING: ${type} took ${totalTime}ms`);
    }

    res.json({
      success: true,
      type: type,
      filters: {
        school_id: school_id,
        company_id: company_id,
        date_from: date_from,
        date_to: date_to,
        granularity: granularity,
        grade: grade
      },
      ...result,
      queryTime: totalTime,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('Analytics API error:', {
      error: error.message,
      stack: error.stack,
      totalTime,
      timestamp: new Date().toISOString()
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      queryTime: totalTime
    });
  }
});

// Overview Analytics
async function getOverviewAnalytics(schoolId, companyId) {
  const startTime = Date.now();

  try {
    const params = {};
    let schoolFilter = '';
    
    if (schoolId) {
      schoolFilter = ' AND s.SchoolID = @schoolId';
      params.schoolId = parseInt(schoolId);
    }

    // Basic school and student counts
    const basicStatsResult = await executeQuery(`
      SELECT 
        COUNT(DISTINCT s.SchoolID) as TotalSchools,
        COUNT(DISTINCT CASE WHEN s.Status = 'active' THEN s.SchoolID END) as ActiveSchools,
        COUNT(DISTINCT st.StudentID) as TotalStudents,
        COUNT(DISTINCT CASE WHEN st.IsActive = 1 THEN st.StudentID END) as ActiveStudents
      FROM Schools s
      LEFT JOIN Students st ON s.SchoolID = st.SchoolID
      WHERE 1=1 ${schoolFilter}
      OPTION (MAXDOP 1)
    `, params, 30000);

    // Students present today
    const todayPresentResult = await executeQuery(`
      SELECT COUNT(DISTINCT a.StudentID) as TodayPresentStudents
      FROM Attendance a WITH (NOLOCK)
      INNER JOIN Students st ON a.StudentID = st.StudentID
      INNER JOIN Schools s ON st.SchoolID = s.SchoolID
      WHERE CAST(a.ScanTime as DATE) = CAST(GETDATE() as DATE)
      AND a.Status IN ('IN', 'OUT')
      AND st.IsActive = 1
      ${schoolFilter}
      OPTION (MAXDOP 1)
    `, params, 30000);

    // Attendance record counts
    const attendanceCountsResult = await executeQuery(`
      SELECT 
        COUNT(CASE WHEN CAST(a.ScanTime as DATE) = CAST(GETDATE() as DATE) THEN a.AttendanceID END) as TodayAttendanceRecords,
        COUNT(CASE WHEN a.ScanTime > DATEADD(day, -7, GETDATE()) THEN a.AttendanceID END) as WeekAttendance,
        COUNT(CASE WHEN a.ScanTime > DATEADD(day, -30, GETDATE()) THEN a.AttendanceID END) as MonthAttendance
      FROM Attendance a WITH (NOLOCK)
      INNER JOIN Students st ON a.StudentID = st.StudentID
      INNER JOIN Schools s ON st.SchoolID = s.SchoolID
      WHERE 1=1 ${schoolFilter}
      OPTION (MAXDOP 1)
    `, params, 30000);

    // Sync agent status (aggregate)
    const syncResult = await executeQuery(`
      SELECT 
        COUNT(DISTINCT sas.SchoolID) as TotalAgents,
        COUNT(CASE 
          WHEN ISNULL(sas.Status, 'stopped') != 'stopped' 
          AND sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) 
          THEN 1 
        END) as OnlineAgents,
        COUNT(CASE 
          WHEN ISNULL(sas.Status, 'stopped') != 'stopped' 
          AND sas.LastHeartbeat BETWEEN DATEADD(MINUTE, -30, GETDATE()) AND DATEADD(MINUTE, -10, GETDATE()) 
          THEN 1 
        END) as WarningAgents,
        COUNT(CASE 
          WHEN ISNULL(sas.Status, 'stopped') = 'stopped' 
          THEN 1 
        END) as StoppedAgents,
        SUM(ISNULL(sas.TotalSynced, 0)) as TotalSynced,
        SUM(ISNULL(sas.TotalErrors, 0)) as TotalErrors
      FROM SyncAgentStatus sas
      WHERE EXISTS (SELECT 1 FROM Schools s WHERE s.SchoolID = sas.SchoolID ${schoolFilter.replace(' AND s.', ' AND ')})
      OPTION (MAXDOP 1)
    `, params, 30000);

    // Get specific school's sync status when school_id is provided
    let schoolSpecificSyncStatus = null;
    if (schoolId) {
      try {
        const schoolSyncResult = await executeQuery(`
          SELECT TOP 1
            sas.Status,
            sas.LastHeartbeat,
            CASE 
              WHEN ISNULL(sas.Status, 'stopped') = 'stopped' THEN 'offline'
              WHEN ISNULL(sas.Status, 'stopped') = 'error' THEN 'offline'
              WHEN sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) THEN 'online'
              WHEN sas.LastHeartbeat > DATEADD(MINUTE, -30, GETDATE()) THEN 'warning'
              WHEN sas.LastHeartbeat IS NULL THEN 'offline'
              ELSE 'offline'
            END as sync_status
          FROM SyncAgentStatus sas
          WHERE sas.SchoolID = @schoolId
          ORDER BY sas.LastHeartbeat DESC
        `, params, 15000);

        schoolSpecificSyncStatus = schoolSyncResult.recordset[0] || { sync_status: 'offline', LastHeartbeat: null };
        console.log(`School ${schoolId} sync agent status:`, schoolSpecificSyncStatus);
      } catch (syncError) {
        console.error(`Failed to get sync status for school ${schoolId}:`, syncError.message);
        schoolSpecificSyncStatus = { sync_status: 'offline', LastHeartbeat: null };
      }
    }

    // Recent activity
    const activityResult = await executeQuery(`
      SELECT TOP 20
        a.AttendanceID,
        a.StudentID,
        st.Name as StudentName,
        s.SchoolID,
        s.Name as SchoolName,
        a.ScanTime,
        a.Status,
        a.CreatedAt,
        DATEDIFF(MINUTE, a.CreatedAt, GETDATE()) as MinutesAgo
      FROM Attendance a WITH (NOLOCK)
      JOIN Students st ON a.StudentID = st.StudentID
      JOIN Schools s ON st.SchoolID = s.SchoolID
      WHERE a.ScanTime > DATEADD(HOUR, -4, GETDATE()) ${schoolFilter}
      ORDER BY a.ScanTime DESC
      OPTION (MAXDOP 1)
    `, params, 30000);

    // Combine results
    const basicStats = basicStatsResult.recordset[0];
    const todayStats = todayPresentResult.recordset[0];
    const attendanceCounts = attendanceCountsResult.recordset[0];
    const syncStats = syncResult.recordset[0];
    
    const totalActiveStudents = basicStats.ActiveStudents || 0;
    const presentToday = todayStats.TodayPresentStudents || 0;
    const absentToday = Math.max(0, totalActiveStudents - presentToday);

    const queryTime = Date.now() - startTime;
    console.log(`Overview analytics completed in ${queryTime}ms`);
    console.log(`Present today: ${presentToday} unique students out of ${totalActiveStudents} active students`);

    const responseData = {
      overview: {
        schools: {
          total: basicStats.TotalSchools || 0,
          active: basicStats.ActiveSchools || 0,
          inactive: (basicStats.TotalSchools || 0) - (basicStats.ActiveSchools || 0)
        },
        students: {
          total: basicStats.TotalStudents || 0,
          active: totalActiveStudents,
          inactive: (basicStats.TotalStudents || 0) - totalActiveStudents
        },
        attendance: {
          today: presentToday,
          absent_today: absentToday,
          week: attendanceCounts.WeekAttendance || 0,
          month: attendanceCounts.MonthAttendance || 0,
          today_records: attendanceCounts.TodayAttendanceRecords || 0,
          attendance_rate: totalActiveStudents > 0 ? Math.round((presentToday / totalActiveStudents) * 100) : 0
        },
        sync_agents: {
          total: syncStats.TotalAgents || 0,
          online: syncStats.OnlineAgents || 0,
          warning: syncStats.WarningAgents || 0,
          stopped: syncStats.StoppedAgents || 0,
          offline: Math.max(0, (syncStats.TotalAgents || 0) - (syncStats.OnlineAgents || 0) - (syncStats.WarningAgents || 0) - (syncStats.StoppedAgents || 0))
        },
        performance: {
          total_synced: syncStats.TotalSynced || 0,
          total_errors: syncStats.TotalErrors || 0,
          error_rate: (syncStats.TotalSynced + syncStats.TotalErrors) > 0 ? 
            Math.round((syncStats.TotalErrors / (syncStats.TotalSynced + syncStats.TotalErrors)) * 100) : 0
        }
      },
      current_activity: activityResult.recordset.map(row => ({
        attendance_id: row.AttendanceID,
        student_id: row.StudentID,
        student_name: row.StudentName,
        school_id: row.SchoolID,
        school_name: row.SchoolName,
        scan_time: row.ScanTime,
        status: row.Status,
        created_at: row.CreatedAt,
        minutes_ago: row.MinutesAgo
      }))
    };

    // Add school-specific sync status if available
    if (schoolSpecificSyncStatus) {
      responseData.sync_status = schoolSpecificSyncStatus.sync_status;
      responseData.sync_last_heartbeat = schoolSpecificSyncStatus.LastHeartbeat;
    }

    return responseData;
  } catch (error) {
    console.error('Error in getOverviewAnalytics:', error);
    throw error;
  }
}

// Real-time Attendance Analytics
async function getRealTimeAttendance(schoolId, dateFrom, dateTo, grade = null, companyId = null) {
  const startTime = Date.now();

  try {
    const params = {};
    
    // Handle date range
    let dateFilter = '';
    if (dateFrom && dateTo) {
      const startDateTime = new Date(dateFrom + 'T00:00:00.000Z');
      const endDateTime = new Date(dateTo + 'T23:59:59.999Z');
      
      params.startDate = startDateTime;
      params.endDate = endDateTime;
      dateFilter = ' AND a.ScanTime BETWEEN @startDate AND @endDate';
    } else {
      const defaultStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
      params.defaultStart = defaultStart;
      dateFilter = ' AND a.ScanTime >= @defaultStart';
    }
    
    let schoolFilter = '';
    if (schoolId) {
      schoolFilter = ' AND st.SchoolID = @schoolId';
      params.schoolId = parseInt(schoolId);
    }

    // Grade filter
    let gradeFilter = '';
    if (grade && grade.trim() !== '') {
      const decodedGrade = decodeURIComponent(grade.trim());
      if (decodedGrade.length <= 50) {
        gradeFilter = ' AND st.Grade = @grade';
        params.grade = decodedGrade;
      }
    }

    const combinedFilter = dateFilter + schoolFilter + gradeFilter;

    // Get time settings
    let timeSettingsMap = {};
    try {
      let timeSettingsParams = {};
      let timeSettingsFilter = '';
      
      if (schoolId) {
        timeSettingsFilter = 'WHERE sts.SchoolID = @schoolId';
        timeSettingsParams.schoolId = parseInt(schoolId);
      }

      const timeSettingsResult = await executeQuery(`
        SELECT 
          sts.SchoolID,
          CONVERT(VARCHAR(5), sts.SchoolStartTime, 108) as SchoolStartTime,
          CONVERT(VARCHAR(5), sts.SchoolEndTime, 108) as SchoolEndTime,
          CONVERT(VARCHAR(5), sts.LateArrivalTime, 108) as LateArrivalTime,
          CONVERT(VARCHAR(5), sts.EarlyDepartureTime, 108) as EarlyDepartureTime,
          sts.Timezone
        FROM SchoolTimeSettings sts
        ${timeSettingsFilter}
      `, timeSettingsParams, 15000);

      timeSettingsResult.recordset.forEach(settings => {
        timeSettingsMap[settings.SchoolID] = {
          school_start_time: settings.SchoolStartTime,
          school_end_time: settings.SchoolEndTime,
          late_arrival_time: settings.LateArrivalTime,
          early_departure_time: settings.EarlyDepartureTime,
          timezone: settings.Timezone
        };
      });
    } catch (error) {
      console.warn('Failed to load time settings for analytics:', error.message);
    }

    // Main attendance query
    const attendanceResult = await executeQuery(`
      SELECT TOP 100
        a.AttendanceID as attendance_id,
        a.StudentID as student_id,
        st.Name as student_name,
        st.Grade as grade,
        a.ScanTime as scan_time,
        a.Status as status,
        a.CreatedAt as created_at,
        s.Name as school_name,
        s.SchoolID as school_id
      FROM Attendance a WITH (NOLOCK)
      INNER JOIN Students st ON a.StudentID = st.StudentID
      INNER JOIN Schools s ON st.SchoolID = s.SchoolID
      WHERE 1=1 
      ${combinedFilter}
      ORDER BY a.ScanTime DESC, a.CreatedAt DESC
      OPTION (MAXDOP 1)
    `, params, 45000);

    // Enhance attendance records with time settings
    const enhancedAttendance = attendanceResult.recordset.map(record => {
      const baseRecord = {
        attendance_id: record.attendance_id,
        student_id: record.student_id,
        student_name: record.student_name,
        grade: record.grade,
        scan_time: record.scan_time,
        status: record.status,
        created_at: record.created_at,
        school_name: record.school_name,
        school_id: record.school_id
      };

      const timeSettings = timeSettingsMap[record.school_id];
      if (timeSettings) {
        const statusInfo = calculateAttendanceStatus(
          record.scan_time,
          record.status,
          timeSettings
        );
        
        return {
          ...baseRecord,
          statusLabel: statusInfo.statusLabel,
          statusType: statusInfo.statusType,
          message: statusInfo.message
        };
      }

      return baseRecord;
    });

    // Summary query
    const summaryResult = await executeQuery(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN a.Status = 'IN' THEN 1 END) as check_ins,
        COUNT(CASE WHEN a.Status = 'OUT' THEN 1 END) as check_outs,
        COUNT(DISTINCT a.StudentID) as unique_students,
        MIN(a.ScanTime) as earliest_scan,
        MAX(a.ScanTime) as latest_scan
      FROM Attendance a WITH (NOLOCK)
      INNER JOIN Students st ON a.StudentID = st.StudentID
      INNER JOIN Schools s ON st.SchoolID = s.SchoolID
      WHERE 1=1 
      ${combinedFilter}
      OPTION (MAXDOP 1)
    `, params, 30000);

    const summary = summaryResult.recordset[0];
    const lateArrivals = enhancedAttendance.filter(r => r.statusType === 'late' && r.status === 'IN').length;
    const earlyArrivals = enhancedAttendance.filter(r => r.statusType === 'early-arrival' && r.status === 'IN').length;
    const onTimeArrivals = enhancedAttendance.filter(r => r.statusType === 'on-time' && r.status === 'IN').length;

    const queryTime = Date.now() - startTime;
    console.log(`Real-time attendance completed in ${queryTime}ms`);

    return {
      current_activity: enhancedAttendance,
      summary: {
        total_records: summary.total_records || 0,
        check_ins: summary.check_ins || 0,
        check_outs: summary.check_outs || 0,
        unique_students: summary.unique_students || 0,
        late_arrivals: lateArrivals,
        early_arrivals: earlyArrivals,
        on_time_arrivals: onTimeArrivals,
        punctuality_rate: summary.check_ins > 0 ? Math.round((onTimeArrivals / summary.check_ins) * 100) : 0,
        date_range: {
          earliest: summary.earliest_scan,
          latest: summary.latest_scan,
          requested_from: dateFrom,
          requested_to: dateTo
        }
      },
      time_settings_applied: Object.keys(timeSettingsMap).length > 0,
      schools_with_settings: Object.keys(timeSettingsMap).map(Number),
      filters_applied: {
        school_id: schoolId,
        company_id: companyId,
        date_from: dateFrom,
        date_to: dateTo,
        grade: grade ? decodeURIComponent(grade) : null
      }
    };
  } catch (error) {
    console.error('Error in getRealTimeAttendance:', error);
    throw error;
  }
}

// School Analytics
async function getSchoolAnalytics() {
  const startTime = Date.now();

  try {
    const schoolsResult = await executeQuery(`
      SELECT 
        s.SchoolID,
        s.Name as SchoolName,
        ISNULL(s.Location, 'Not specified') as Location,
        ISNULL(s.Status, 'active') as SchoolStatus,
        COUNT(DISTINCT st.StudentID) as TotalStudents,
        COUNT(DISTINCT CASE WHEN st.IsActive = 1 THEN st.StudentID END) as ActiveStudents,
        COUNT(CASE WHEN a.ScanTime >= DATEADD(DAY, -30, GETDATE()) THEN a.AttendanceID END) as RecentAttendance,
        COUNT(CASE WHEN CAST(a.ScanTime as DATE) = CAST(GETDATE() as DATE) THEN a.AttendanceID END) as TodayAttendance,
        MAX(a.CreatedAt) as LastAttendanceRecord,
        sas.Status as SyncStatus,
        sas.LastHeartbeat,
        CASE 
          WHEN sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) THEN 'Online'
          WHEN sas.LastHeartbeat > DATEADD(MINUTE, -30, GETDATE()) THEN 'Warning'  
          WHEN sas.LastHeartbeat IS NULL THEN 'Unknown'
          ELSE 'Offline'
        END as SyncConnectionStatus,
        ISNULL(sas.TotalSynced, 0) as TotalSynced,
        ISNULL(sas.TotalErrors, 0) as TotalErrors
      FROM Schools s
      LEFT JOIN Students st ON s.SchoolID = st.SchoolID
      LEFT JOIN (
        SELECT StudentID, ScanTime, CreatedAt, AttendanceID
        FROM Attendance WITH (NOLOCK)
        WHERE ScanTime >= DATEADD(DAY, -30, GETDATE())
      ) a ON st.StudentID = a.StudentID
      LEFT JOIN SyncAgentStatus sas ON s.SchoolID = sas.SchoolID
      GROUP BY s.SchoolID, s.Name, s.Location, s.Status, sas.Status, sas.LastHeartbeat, sas.TotalSynced, sas.TotalErrors
      ORDER BY s.Name
      OPTION (MAXDOP 1)
    `, {}, 30000);

    const queryTime = Date.now() - startTime;
    console.log(`Schools analytics completed in ${queryTime}ms`);

    return {
      schools: schoolsResult.recordset.map(row => ({
        school_id: row.SchoolID,
        name: row.SchoolName,
        location: row.Location,
        status: row.SchoolStatus,
        students: {
          total: row.TotalStudents || 0,
          active: row.ActiveStudents || 0,
          inactive: (row.TotalStudents || 0) - (row.ActiveStudents || 0)
        },
        attendance: {
          total: row.RecentAttendance || 0,
          today: row.TodayAttendance || 0,
          last_record: row.LastAttendanceRecord
        },
        sync_agent: {
          status: row.SyncStatus,
          connection_status: row.SyncConnectionStatus,
          last_heartbeat: row.LastHeartbeat,
          total_synced: row.TotalSynced,
          total_errors: row.TotalErrors,
          health_score: row.TotalSynced > 0 ? 
            Math.round((1 - (row.TotalErrors / (row.TotalSynced + row.TotalErrors))) * 100) : 100
        }
      })),
      summary: {
        total_schools: schoolsResult.recordset.length,
        active_schools: schoolsResult.recordset.filter(row => row.SchoolStatus === 'active').length,
        schools_online: schoolsResult.recordset.filter(row => row.SyncConnectionStatus === 'Online').length
      }
    };
  } catch (error) {
    console.error('Error in getSchoolAnalytics:', error);
    throw error;
  }
}

// Attendance Analytics
async function getAttendanceAnalytics(schoolId, dateFrom, dateTo, granularity) {
  try {
    const endDate = dateTo ? new Date(dateTo) : new Date();
    const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const params = {
      startDate: startDate,
      endDate: endDate
    };
    
    let schoolFilter = '';
    if (schoolId) {
      schoolFilter = ' AND s.SchoolID = @schoolId';
      params.schoolId = parseInt(schoolId);
    }

    const schoolBreakdownResult = await executeQuery(`
      SELECT 
        s.SchoolID,
        s.Name as SchoolName,
        ISNULL(s.Location, 'Not specified') as Location,
        COUNT(a.AttendanceID) as AttendanceCount,
        COUNT(DISTINCT a.StudentID) as UniqueStudents
      FROM Schools s
      LEFT JOIN Students st ON s.SchoolID = st.SchoolID
      LEFT JOIN Attendance a WITH (NOLOCK) ON st.StudentID = a.StudentID 
        AND a.ScanTime BETWEEN @startDate AND @endDate
      WHERE 1=1 ${schoolFilter}
      GROUP BY s.SchoolID, s.Name, s.Location
      ORDER BY AttendanceCount DESC
      OPTION (MAXDOP 1)
    `, params, 30000);

    const totalAttendance = schoolBreakdownResult.recordset.reduce((sum, row) => sum + (row.AttendanceCount || 0), 0);
    const totalUniqueStudents = Math.max(...schoolBreakdownResult.recordset.map(row => row.UniqueStudents || 0), 0);

    return {
      date_range: {
        from: startDate.toISOString(),
        to: endDate.toISOString(),
        granularity: granularity
      },
      school_breakdown: schoolBreakdownResult.recordset.map(row => ({
        school_id: row.SchoolID,
        school_name: row.SchoolName,
        location: row.Location,
        attendance_count: row.AttendanceCount || 0,
        unique_students: row.UniqueStudents || 0
      })),
      summary: {
        total_attendance: totalAttendance,
        total_unique_students: totalUniqueStudents,
        avg_daily_attendance: Math.round(totalAttendance / Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))))
      }
    };
  } catch (error) {
    console.error('Error in getAttendanceAnalytics:', error);
    throw error;
  }
}

// Student Analytics
async function getStudentAnalytics(schoolId) {
  try {
    const params = {};
    let schoolFilter = '';
    if (schoolId) {
      schoolFilter = ' AND s.SchoolID = @schoolId';
      params.schoolId = parseInt(schoolId);
    }

    const gradeDistributionResult = await executeQuery(`
      SELECT 
        ISNULL(st.Grade, 'Not specified') as Grade,
        COUNT(st.StudentID) as TotalStudents,
        COUNT(CASE WHEN st.IsActive = 1 THEN st.StudentID END) as ActiveStudents,
        COUNT(DISTINCT a.StudentID) as StudentsWithAttendance
      FROM Students st
      LEFT JOIN Schools s ON st.SchoolID = s.SchoolID
      LEFT JOIN (
        SELECT DISTINCT StudentID 
        FROM Attendance WITH (NOLOCK)
        WHERE ScanTime >= DATEADD(DAY, -30, GETDATE())
      ) a ON st.StudentID = a.StudentID
      WHERE 1=1 ${schoolFilter}
      GROUP BY st.Grade
      ORDER BY st.Grade
      OPTION (MAXDOP 1)
    `, params, 20000);

    const totalStats = gradeDistributionResult.recordset.reduce((acc, row) => ({
      total_students: acc.total_students + (row.TotalStudents || 0),
      active_students: acc.active_students + (row.ActiveStudents || 0),
      students_with_attendance: acc.students_with_attendance + (row.StudentsWithAttendance || 0)
    }), { total_students: 0, active_students: 0, students_with_attendance: 0 });

    return {
      grade_distribution: gradeDistributionResult.recordset.map(row => ({
        grade: row.Grade,
        total_students: row.TotalStudents || 0,
        active_students: row.ActiveStudents || 0,
        students_with_attendance: row.StudentsWithAttendance || 0,
        attendance_rate: row.ActiveStudents > 0 ? 
          Math.round((row.StudentsWithAttendance / row.ActiveStudents) * 100) : 0
      })),
      totals: {
        total_grades: gradeDistributionResult.recordset.length,
        total_students: totalStats.total_students,
        active_students: totalStats.active_students,
        students_with_attendance: totalStats.students_with_attendance,
        overall_participation_rate: totalStats.active_students > 0 ? 
          Math.round((totalStats.students_with_attendance / totalStats.active_students) * 100) : 0
      }
    };
  } catch (error) {
    console.error('Error in getStudentAnalytics:', error);
    throw error;
  }
}

// Sync Performance Analytics
async function getSyncPerformanceAnalytics(schoolId) {
  try {
    const params = {};
    let schoolFilter = '';
    if (schoolId) {
      schoolFilter = ' AND s.SchoolID = @schoolId';
      params.schoolId = parseInt(schoolId);
    }

    const performanceResult = await executeQuery(`
      SELECT 
        s.SchoolID,
        s.Name as SchoolName,
        ISNULL(sas.Status, 'stopped') as Status,
        sas.LastHeartbeat,
        ISNULL(sas.UptimeHours, 0) as UptimeHours,
        ISNULL(sas.TotalSynced, 0) as TotalSynced,
        ISNULL(sas.TotalErrors, 0) as TotalErrors,
        ISNULL(sas.MemoryUsageMB, 0) as MemoryUsageMB,
        CASE 
          WHEN ISNULL(sas.Status, 'stopped') = 'stopped' THEN 'Stopped'
          WHEN ISNULL(sas.Status, 'stopped') = 'error' THEN 'Error'
          WHEN sas.LastHeartbeat > DATEADD(MINUTE, -10, GETDATE()) THEN 'Online'
          WHEN sas.LastHeartbeat > DATEADD(MINUTE, -30, GETDATE()) THEN 'Warning'
          WHEN sas.LastHeartbeat IS NULL THEN 'Unknown'
          ELSE 'Offline'
        END as ConnectionStatus,
        CASE 
          WHEN sas.TotalSynced + sas.TotalErrors > 0 
          THEN ROUND((sas.TotalErrors * 100.0 / (sas.TotalSynced + sas.TotalErrors)), 2)
          ELSE 0 
        END as ErrorRate
      FROM Schools s
      LEFT JOIN SyncAgentStatus sas ON s.SchoolID = sas.SchoolID
      WHERE 1=1 ${schoolFilter}
      ORDER BY s.Name
      OPTION (MAXDOP 1)
    `, params, 15000);

    const agents = performanceResult.recordset.map(row => ({
      school_id: row.SchoolID,
      school_name: row.SchoolName,
      status: row.Status,
      connection_status: row.ConnectionStatus,
      uptime_hours: row.UptimeHours,
      total_synced: row.TotalSynced,
      total_errors: row.TotalErrors,
      error_rate: row.ErrorRate,
      memory_usage_mb: row.MemoryUsageMB,
      health_score: calculateHealthScore(row),
      last_heartbeat: row.LastHeartbeat
    }));

    return {
      agents: agents,
      performance_metrics: {
        total_agents: agents.length,
        online_agents: agents.filter(a => a.connection_status === 'Online').length,
        stopped_agents: agents.filter(a => a.connection_status === 'Stopped').length,
        offline_agents: agents.filter(a => a.connection_status === 'Offline').length,
        avg_error_rate: agents.length > 0 ? 
          Math.round(agents.reduce((sum, a) => sum + a.error_rate, 0) / agents.length * 100) / 100 : 0,
        total_synced: agents.reduce((sum, a) => sum + a.total_synced, 0),
        total_errors: agents.reduce((sum, a) => sum + a.total_errors, 0),
        avg_uptime_hours: agents.length > 0 ? 
          Math.round(agents.reduce((sum, a) => sum + a.uptime_hours, 0) / agents.length * 100) / 100 : 0
      },
      health_distribution: {
        excellent: agents.filter(a => a.health_score >= 90).length,
        good: agents.filter(a => a.health_score >= 70 && a.health_score < 90).length,
        fair: agents.filter(a => a.health_score >= 50 && a.health_score < 70).length,
        poor: agents.filter(a => a.health_score < 50).length
      }
    };
  } catch (error) {
    console.error('Error in getSyncPerformanceAnalytics:', error);
    throw error;
  }
}

// Trend Analytics
async function getTrendAnalytics(schoolId, dateFrom, dateTo) {
  try {
    const endDate = dateTo ? new Date(dateTo) : new Date();
    const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const params = {
      startDate: startDate,
      endDate: endDate
    };
    
    let schoolFilter = '';
    if (schoolId) {
      schoolFilter = ' AND s.SchoolID = @schoolId';
      params.schoolId = parseInt(schoolId);
    }

    // Daily trends
    const dailyTrendsResult = await executeQuery(`
      SELECT 
        CAST(a.ScanTime as DATE) as ScanDate,
        COUNT(a.AttendanceID) as TotalScans,
        COUNT(CASE WHEN a.Status = 'IN' THEN a.AttendanceID END) as CheckIns,
        COUNT(CASE WHEN a.Status = 'OUT' THEN a.AttendanceID END) as CheckOuts,
        COUNT(DISTINCT a.StudentID) as UniqueStudents
      FROM Attendance a WITH (NOLOCK)
      INNER JOIN Students st ON a.StudentID = st.StudentID
      INNER JOIN Schools s ON st.SchoolID = s.SchoolID
      WHERE a.ScanTime BETWEEN @startDate AND @endDate ${schoolFilter}
      GROUP BY CAST(a.ScanTime as DATE)
      ORDER BY ScanDate
      OPTION (MAXDOP 1)
    `, params, 25000);

    // Hourly patterns
    const hourlyPatternsResult = await executeQuery(`
      SELECT 
        DATEPART(HOUR, a.ScanTime) as ScanHour,
        COUNT(a.AttendanceID) as TotalScans,
        COUNT(CASE WHEN a.Status = 'IN' THEN a.AttendanceID END) as CheckIns,
        COUNT(CASE WHEN a.Status = 'OUT' THEN a.AttendanceID END) as CheckOuts
      FROM Attendance a WITH (NOLOCK)
      INNER JOIN Students st ON a.StudentID = st.StudentID
      INNER JOIN Schools s ON st.SchoolID = s.SchoolID
      WHERE a.ScanTime BETWEEN @startDate AND @endDate ${schoolFilter}
      GROUP BY DATEPART(HOUR, a.ScanTime)
      ORDER BY ScanHour
      OPTION (MAXDOP 1)
    `, params, 25000);

    // Calculate trend analysis
    const dailyData = dailyTrendsResult.recordset;
    let overallTrend = 'stable';
    let trendPercentage = 0;

    if (dailyData.length >= 2) {
      const firstHalf = dailyData.slice(0, Math.floor(dailyData.length / 2));
      const secondHalf = dailyData.slice(Math.floor(dailyData.length / 2));
      
      const firstHalfAvg = firstHalf.reduce((sum, day) => sum + day.TotalScans, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((sum, day) => sum + day.TotalScans, 0) / secondHalf.length;
      
      if (firstHalfAvg > 0) {
        trendPercentage = Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100);
        
        if (trendPercentage > 10) overallTrend = 'increasing';
        else if (trendPercentage < -10) overallTrend = 'decreasing';
        else overallTrend = 'stable';
      }
    }

    return {
      date_range: {
        from: startDate.toISOString(),
        to: endDate.toISOString()
      },
      daily_trends: dailyData.map(row => ({
        date: row.ScanDate,
        total_scans: row.TotalScans || 0,
        check_ins: row.CheckIns || 0,
        check_outs: row.CheckOuts || 0,
        unique_students: row.UniqueStudents || 0
      })),
      hourly_patterns: hourlyPatternsResult.recordset.map(row => ({
        hour: row.ScanHour,
        total_scans: row.TotalScans || 0,
        check_ins: row.CheckIns || 0,
        check_outs: row.CheckOuts || 0
      })),
      trend_analysis: {
        overall_trend: overallTrend,
        trend_percentage: trendPercentage,
        total_days_analyzed: dailyData.length,
        peak_hour: hourlyPatternsResult.recordset.length > 0 ? 
          hourlyPatternsResult.recordset.reduce((max, hour) => 
            hour.TotalScans > max.TotalScans ? hour : max
          ).ScanHour : 0,
        avg_daily_scans: dailyData.length > 0 ? 
          Math.round(dailyData.reduce((sum, day) => sum + day.TotalScans, 0) / dailyData.length) : 0
      }
    };
  } catch (error) {
    console.error('Error in getTrendAnalytics:', error);
    throw error;
  }
}

// Helper Functions
function calculateAttendanceStatus(scanTime, status, timeSettings) {
  if (!scanTime || !status || !timeSettings) {
    return {
      status: status,
      statusLabel: status === 'IN' ? 'Check In' : 'Check Out',
      statusType: 'normal',
      message: null,
      scanTime: scanTime ? new Date(scanTime).toTimeString().substr(0, 5) : null
    };
  }

  const scanDateTime = new Date(scanTime);
  const scanTimeOnly = scanDateTime.toTimeString().substr(0, 5);
  
  const {
    school_start_time = '08:00',
    school_end_time = '15:00',
    late_arrival_time = '08:30',
    early_departure_time = '14:00'
  } = timeSettings;

  let statusType = 'normal';
  let statusLabel = status === 'IN' ? 'Check In' : 'Check Out';
  let message = null;

  if (status === 'IN') {
    if (scanTimeOnly <= school_start_time) {
      statusType = 'early-arrival';
      statusLabel = 'Early Arrival';
      message = `Arrived early at ${scanTimeOnly}`;
    } else if (scanTimeOnly <= late_arrival_time) {
      statusType = 'on-time';
      statusLabel = 'On Time';
      message = `Arrived on time at ${scanTimeOnly}`;
    } else {
      statusType = 'late';
      statusLabel = 'Late Arrival';
      message = `Arrived late at ${scanTimeOnly} (after ${late_arrival_time})`;
    }
  } else if (status === 'OUT') {
    if (scanTimeOnly < early_departure_time) {
      statusType = 'early-departure';
      statusLabel = 'Early Departure';
      message = `Left early at ${scanTimeOnly} (before ${early_departure_time})`;
    } else if (scanTimeOnly < school_end_time) {
      statusType = 'normal-departure';
      statusLabel = 'Normal Departure';
      message = `Left at ${scanTimeOnly}`;
    } else {
      statusType = 'after-hours';
      statusLabel = 'After Hours';
      message = `Left after school hours at ${scanTimeOnly}`;
    }
  }

  return {
    status,
    statusLabel,
    statusType,
    message,
    scanTime: scanTimeOnly
  };
}

function calculateHealthScore(agent) {
  let score = 100;
  
  if (agent.Status === 'stopped') {
    score -= 60;
  } else if (agent.ConnectionStatus === 'Offline') {
    score -= 50;
  } else if (agent.ConnectionStatus === 'Warning') {
    score -= 20;
  } else if (agent.ConnectionStatus === 'Unknown') {
    score -= 30;
  }
  
  const errorRate = agent.ErrorRate || 0;
  if (errorRate > 10) score -= 30;
  else if (errorRate > 5) score -= 15;
  else if (errorRate > 1) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

module.exports = router;