// const { getPool, sql } = require('../../lib/database')

// export default async function handler(req, res) {
//   res.setHeader('Access-Control-Allow-Origin', '*')
//   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

//   if (req.method === 'OPTIONS') {
//     res.status(200).end()
//     return
//   }

//   try {
//     switch (req.method) {
//       case 'GET':
//         return await handleGetSettings(req, res)
//       case 'POST':
//         return await handleCreateOrUpdateSettings(req, res)
//       case 'PUT':
//         return await handleCreateOrUpdateSettings(req, res)
//       default:
//         return res.status(405).json({ error: 'Method not allowed' })
//     }
//   } catch (error) {
//     console.error('School settings API error:', error)
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       timestamp: new Date().toISOString()
//     })
//   }
// }

// // GET - Fetch school time settings
// async function handleGetSettings(req, res) {
//   const pool = await getPool()
//   const request = pool.request()
  
//   const { school_id } = req.query

//   if (!school_id) {
//     return res.status(400).json({
//       success: false,
//       error: 'School ID is required'
//     })
//   }

//   try {
//     request.input('schoolId', sql.Int, parseInt(school_id))

//     // First check if school exists
//     const schoolCheck = await request.query(`
//       SELECT SchoolID, Name FROM Schools WHERE SchoolID = @schoolId AND Status = 'active'
//     `)

//     if (schoolCheck.recordset.length === 0) {
//       return res.status(404).json({
//         success: false,
//         error: 'School not found or inactive'
//       })
//     }

//     // Get time settings - FIXED: Use CONVERT to format as HH:MM strings
//     const settingsResult = await request.query(`
//       SELECT 
//         sts.SettingID,
//         sts.SchoolID,
//         CONVERT(VARCHAR(5), sts.SchoolStartTime, 108) as SchoolStartTime,
//         CONVERT(VARCHAR(5), sts.SchoolEndTime, 108) as SchoolEndTime,
//         CONVERT(VARCHAR(5), sts.LateArrivalTime, 108) as LateArrivalTime,
//         CONVERT(VARCHAR(5), sts.EarlyDepartureTime, 108) as EarlyDepartureTime,
//         sts.Timezone,
//         sts.CreatedAt,
//         sts.UpdatedAt,
//         s.Name as SchoolName
//       FROM SchoolTimeSettings sts
//       JOIN Schools s ON sts.SchoolID = s.SchoolID
//       WHERE sts.SchoolID = @schoolId
//     `)

//     if (settingsResult.recordset.length === 0) {
//       // No settings found - return default settings
//       return res.json({
//         success: true,
//         settings: {
//           school_id: parseInt(school_id),
//           school_name: schoolCheck.recordset[0].Name,
//           school_start_time: '08:00',
//           school_end_time: '15:00',
//           late_arrival_time: '08:30',
//           early_departure_time: '14:00',
//           timezone: 'Africa/Accra',
//           is_default: true
//         },
//         message: 'Using default settings - no custom settings configured'
//       })
//     }

//     const settings = settingsResult.recordset[0]

//     // Debug logging to see what we're getting from the database
//     console.log('Raw settings from DB:', settings)

//     res.json({
//       success: true,
//       settings: {
//         setting_id: settings.SettingID,
//         school_id: settings.SchoolID,
//         school_name: settings.SchoolName,
//         school_start_time: settings.SchoolStartTime,     // Already formatted by SQL CONVERT
//         school_end_time: settings.SchoolEndTime,         // Already formatted by SQL CONVERT
//         late_arrival_time: settings.LateArrivalTime,     // Already formatted by SQL CONVERT
//         early_departure_time: settings.EarlyDepartureTime, // Already formatted by SQL CONVERT
//         timezone: settings.Timezone,
//         created_at: settings.CreatedAt,
//         updated_at: settings.UpdatedAt,
//         is_default: false
//       }
//     })

//   } catch (error) {
//     console.error('Error fetching school settings:', error)
//     throw error
//   }
// }

// // POST/PUT - Create or update school time settings
// async function handleCreateOrUpdateSettings(req, res) {
//   const pool = await getPool()
//   const request = pool.request()
  
//   const { 
//     school_id,
//     school_start_time,
//     school_end_time,
//     late_arrival_time,
//     early_departure_time,
//     timezone = 'Africa/Accra'
//   } = req.body

//   if (!school_id) {
//     return res.status(400).json({
//       success: false,
//       error: 'School ID is required'
//     })
//   }

//   // Validate required time fields
//   if (!school_start_time || !school_end_time || !late_arrival_time || !early_departure_time) {
//     return res.status(400).json({
//       success: false,
//       error: 'All time fields are required'
//     })
//   }

//   // Validate time format (HH:MM)
//   const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
//   if (!timeRegex.test(school_start_time) || !timeRegex.test(school_end_time) || 
//       !timeRegex.test(late_arrival_time) || !timeRegex.test(early_departure_time)) {
//     return res.status(400).json({
//       success: false,
//       error: 'Invalid time format. Use HH:MM format (24-hour)'
//     })
//   }

//   // Validate time logic
//   if (school_start_time >= school_end_time) {
//     return res.status(400).json({
//       success: false,
//       error: 'School end time must be after start time'
//     })
//   }

//   if (late_arrival_time <= school_start_time) {
//     return res.status(400).json({
//       success: false,
//       error: 'Late arrival time must be after school start time'
//     })
//   }

//   if (early_departure_time >= school_end_time) {
//     return res.status(400).json({
//       success: false,
//       error: 'Early departure time must be before school end time'
//     })
//   }

//   try {
//     request.input('schoolId', sql.Int, parseInt(school_id))

//     // Check if school exists
//     const schoolCheck = await request.query(`
//       SELECT SchoolID, Name FROM Schools WHERE SchoolID = @schoolId AND Status = 'active'
//     `)

//     if (schoolCheck.recordset.length === 0) {
//       return res.status(404).json({
//         success: false,
//         error: 'School not found or inactive'
//       })
//     }

//     // Check if settings already exist
//     const existingSettings = await request.query(`
//       SELECT SettingID FROM SchoolTimeSettings WHERE SchoolID = @schoolId
//     `)

//     // Format times properly for SQL Server TIME type
//     request.input('schoolStartTime', sql.NVarChar(8), school_start_time + ':00')
//     request.input('schoolEndTime', sql.NVarChar(8), school_end_time + ':00')
//     request.input('lateArrivalTime', sql.NVarChar(8), late_arrival_time + ':00')
//     request.input('earlyDepartureTime', sql.NVarChar(8), early_departure_time + ':00')
//     request.input('timezone', sql.NVarChar(50), timezone)

//     let result

//     if (existingSettings.recordset.length > 0) {
//       // Update existing settings - FIXED: Return formatted strings
//       result = await request.query(`
//         UPDATE SchoolTimeSettings 
//         SET 
//           SchoolStartTime = CAST(@schoolStartTime AS TIME),
//           SchoolEndTime = CAST(@schoolEndTime AS TIME),
//           LateArrivalTime = CAST(@lateArrivalTime AS TIME),
//           EarlyDepartureTime = CAST(@earlyDepartureTime AS TIME),
//           Timezone = @timezone,
//           UpdatedAt = GETDATE()
//         OUTPUT 
//           INSERTED.SettingID,
//           INSERTED.SchoolID,
//           CONVERT(VARCHAR(5), INSERTED.SchoolStartTime, 108) as SchoolStartTime,
//           CONVERT(VARCHAR(5), INSERTED.SchoolEndTime, 108) as SchoolEndTime,
//           CONVERT(VARCHAR(5), INSERTED.LateArrivalTime, 108) as LateArrivalTime,
//           CONVERT(VARCHAR(5), INSERTED.EarlyDepartureTime, 108) as EarlyDepartureTime,
//           INSERTED.Timezone
//         WHERE SchoolID = @schoolId
//       `)
//     } else {
//       // Create new settings - FIXED: Return formatted strings
//       result = await request.query(`
//         INSERT INTO SchoolTimeSettings (
//           SchoolID, 
//           SchoolStartTime, 
//           SchoolEndTime, 
//           LateArrivalTime, 
//           EarlyDepartureTime, 
//           Timezone,
//           CreatedAt,
//           UpdatedAt
//         )
//         OUTPUT 
//           INSERTED.SettingID,
//           INSERTED.SchoolID,
//           CONVERT(VARCHAR(5), INSERTED.SchoolStartTime, 108) as SchoolStartTime,
//           CONVERT(VARCHAR(5), INSERTED.SchoolEndTime, 108) as SchoolEndTime,
//           CONVERT(VARCHAR(5), INSERTED.LateArrivalTime, 108) as LateArrivalTime,
//           CONVERT(VARCHAR(5), INSERTED.EarlyDepartureTime, 108) as EarlyDepartureTime,
//           INSERTED.Timezone
//         VALUES (
//           @schoolId, 
//           CAST(@schoolStartTime AS TIME), 
//           CAST(@schoolEndTime AS TIME), 
//           CAST(@lateArrivalTime AS TIME), 
//           CAST(@earlyDepartureTime AS TIME), 
//           @timezone,
//           GETDATE(),
//           GETDATE()
//         )
//       `)
//     }

//     const savedSettings = result.recordset[0]
    
//     // Debug logging
//     console.log('Saved settings:', savedSettings)

//     res.json({
//       success: true,
//       message: existingSettings.recordset.length > 0 ? 'Settings updated successfully' : 'Settings created successfully',
//       settings: {
//         setting_id: savedSettings.SettingID,
//         school_id: savedSettings.SchoolID,
//         school_name: schoolCheck.recordset[0].Name,
//         school_start_time: savedSettings.SchoolStartTime,     // Already formatted by SQL CONVERT
//         school_end_time: savedSettings.SchoolEndTime,         // Already formatted by SQL CONVERT
//         late_arrival_time: savedSettings.LateArrivalTime,     // Already formatted by SQL CONVERT
//         early_departure_time: savedSettings.EarlyDepartureTime, // Already formatted by SQL CONVERT
//         timezone: savedSettings.Timezone
//       },
//       timestamp: new Date().toISOString()
//     })

//   } catch (error) {
//     console.error('Error saving school settings:', error)
//     throw error
//   }
// }

// // REMOVED: formatTime function - no longer needed since SQL CONVERT handles formatting

// routes/school-settings.js
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../lib/database');

// GET - Fetch school time settings
router.get('/', async (req, res) => {
  try {
    return await handleGetSettings(req, res);
  } catch (error) {
    console.error('School settings API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST/PUT - Create or update school time settings
router.post('/', async (req, res) => {
  try {
    return await handleCreateOrUpdateSettings(req, res);
  } catch (error) {
    console.error('School settings API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.put('/', async (req, res) => {
  try {
    return await handleCreateOrUpdateSettings(req, res);
  } catch (error) {
    console.error('School settings API error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET - Fetch school time settings
async function handleGetSettings(req, res) {
  const pool = await getPool();
  const request = pool.request();
  
  const { school_id } = req.query;

  if (!school_id) {
    return res.status(400).json({
      success: false,
      error: 'School ID is required'
    });
  }

  try {
    request.input('schoolId', sql.Int, parseInt(school_id));

    // First check if school exists
    const schoolCheck = await request.query(`
      SELECT SchoolID, Name FROM Schools WHERE SchoolID = @schoolId AND Status = 'active'
    `);

    if (schoolCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'School not found or inactive'
      });
    }

    // Get time settings - Use CONVERT to format as HH:MM strings
    const settingsResult = await request.query(`
      SELECT 
        sts.SettingID,
        sts.SchoolID,
        CONVERT(VARCHAR(5), sts.SchoolStartTime, 108) as SchoolStartTime,
        CONVERT(VARCHAR(5), sts.SchoolEndTime, 108) as SchoolEndTime,
        CONVERT(VARCHAR(5), sts.LateArrivalTime, 108) as LateArrivalTime,
        CONVERT(VARCHAR(5), sts.EarlyDepartureTime, 108) as EarlyDepartureTime,
        sts.Timezone,
        sts.CreatedAt,
        sts.UpdatedAt,
        s.Name as SchoolName
      FROM SchoolTimeSettings sts
      JOIN Schools s ON sts.SchoolID = s.SchoolID
      WHERE sts.SchoolID = @schoolId
    `);

    if (settingsResult.recordset.length === 0) {
      // No settings found - return default settings
      return res.json({
        success: true,
        settings: {
          school_id: parseInt(school_id),
          school_name: schoolCheck.recordset[0].Name,
          school_start_time: '08:00',
          school_end_time: '15:00',
          late_arrival_time: '08:30',
          early_departure_time: '14:00',
          timezone: 'Africa/Accra',
          is_default: true
        },
        message: 'Using default settings - no custom settings configured'
      });
    }

    const settings = settingsResult.recordset[0];

    // Debug logging to see what we're getting from the database
    console.log('Raw settings from DB:', settings);

    res.json({
      success: true,
      settings: {
        setting_id: settings.SettingID,
        school_id: settings.SchoolID,
        school_name: settings.SchoolName,
        school_start_time: settings.SchoolStartTime,     // Already formatted by SQL CONVERT
        school_end_time: settings.SchoolEndTime,         // Already formatted by SQL CONVERT
        late_arrival_time: settings.LateArrivalTime,     // Already formatted by SQL CONVERT
        early_departure_time: settings.EarlyDepartureTime, // Already formatted by SQL CONVERT
        timezone: settings.Timezone,
        created_at: settings.CreatedAt,
        updated_at: settings.UpdatedAt,
        is_default: false
      }
    });

  } catch (error) {
    console.error('Error fetching school settings:', error);
    throw error;
  }
}

// POST/PUT - Create or update school time settings
async function handleCreateOrUpdateSettings(req, res) {
  const pool = await getPool();
  const request = pool.request();
  
  const { 
    school_id,
    school_start_time,
    school_end_time,
    late_arrival_time,
    early_departure_time,
    timezone = 'Africa/Accra'
  } = req.body;

  if (!school_id) {
    return res.status(400).json({
      success: false,
      error: 'School ID is required'
    });
  }

  // Validate required time fields
  if (!school_start_time || !school_end_time || !late_arrival_time || !early_departure_time) {
    return res.status(400).json({
      success: false,
      error: 'All time fields are required'
    });
  }

  // Validate time format (HH:MM)
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(school_start_time) || !timeRegex.test(school_end_time) || 
      !timeRegex.test(late_arrival_time) || !timeRegex.test(early_departure_time)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid time format. Use HH:MM format (24-hour)'
    });
  }

  // Validate time logic
  if (school_start_time >= school_end_time) {
    return res.status(400).json({
      success: false,
      error: 'School end time must be after start time'
    });
  }

  if (late_arrival_time <= school_start_time) {
    return res.status(400).json({
      success: false,
      error: 'Late arrival time must be after school start time'
    });
  }

  if (early_departure_time >= school_end_time) {
    return res.status(400).json({
      success: false,
      error: 'Early departure time must be before school end time'
    });
  }

  try {
    request.input('schoolId', sql.Int, parseInt(school_id));

    // Check if school exists
    const schoolCheck = await request.query(`
      SELECT SchoolID, Name FROM Schools WHERE SchoolID = @schoolId AND Status = 'active'
    `);

    if (schoolCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'School not found or inactive'
      });
    }

    // Check if settings already exist
    const existingSettings = await request.query(`
      SELECT SettingID FROM SchoolTimeSettings WHERE SchoolID = @schoolId
    `);

    // Format times properly for SQL Server TIME type
    request.input('schoolStartTime', sql.NVarChar(8), school_start_time + ':00');
    request.input('schoolEndTime', sql.NVarChar(8), school_end_time + ':00');
    request.input('lateArrivalTime', sql.NVarChar(8), late_arrival_time + ':00');
    request.input('earlyDepartureTime', sql.NVarChar(8), early_departure_time + ':00');
    request.input('timezone', sql.NVarChar(50), timezone);

    let result;

    if (existingSettings.recordset.length > 0) {
      // Update existing settings - Return formatted strings
      result = await request.query(`
        UPDATE SchoolTimeSettings 
        SET 
          SchoolStartTime = CAST(@schoolStartTime AS TIME),
          SchoolEndTime = CAST(@schoolEndTime AS TIME),
          LateArrivalTime = CAST(@lateArrivalTime AS TIME),
          EarlyDepartureTime = CAST(@earlyDepartureTime AS TIME),
          Timezone = @timezone,
          UpdatedAt = GETDATE()
        OUTPUT 
          INSERTED.SettingID,
          INSERTED.SchoolID,
          CONVERT(VARCHAR(5), INSERTED.SchoolStartTime, 108) as SchoolStartTime,
          CONVERT(VARCHAR(5), INSERTED.SchoolEndTime, 108) as SchoolEndTime,
          CONVERT(VARCHAR(5), INSERTED.LateArrivalTime, 108) as LateArrivalTime,
          CONVERT(VARCHAR(5), INSERTED.EarlyDepartureTime, 108) as EarlyDepartureTime,
          INSERTED.Timezone
        WHERE SchoolID = @schoolId
      `);
    } else {
      // Create new settings - Return formatted strings
      result = await request.query(`
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
        OUTPUT 
          INSERTED.SettingID,
          INSERTED.SchoolID,
          CONVERT(VARCHAR(5), INSERTED.SchoolStartTime, 108) as SchoolStartTime,
          CONVERT(VARCHAR(5), INSERTED.SchoolEndTime, 108) as SchoolEndTime,
          CONVERT(VARCHAR(5), INSERTED.LateArrivalTime, 108) as LateArrivalTime,
          CONVERT(VARCHAR(5), INSERTED.EarlyDepartureTime, 108) as EarlyDepartureTime,
          INSERTED.Timezone
        VALUES (
          @schoolId, 
          CAST(@schoolStartTime AS TIME), 
          CAST(@schoolEndTime AS TIME), 
          CAST(@lateArrivalTime AS TIME), 
          CAST(@earlyDepartureTime AS TIME), 
          @timezone,
          GETDATE(),
          GETDATE()
        )
      `);
    }

    const savedSettings = result.recordset[0];
    
    // Debug logging
    console.log('Saved settings:', savedSettings);

    res.json({
      success: true,
      message: existingSettings.recordset.length > 0 ? 'Settings updated successfully' : 'Settings created successfully',
      settings: {
        setting_id: savedSettings.SettingID,
        school_id: savedSettings.SchoolID,
        school_name: schoolCheck.recordset[0].Name,
        school_start_time: savedSettings.SchoolStartTime,     // Already formatted by SQL CONVERT
        school_end_time: savedSettings.SchoolEndTime,         // Already formatted by SQL CONVERT
        late_arrival_time: savedSettings.LateArrivalTime,     // Already formatted by SQL CONVERT
        early_departure_time: savedSettings.EarlyDepartureTime, // Already formatted by SQL CONVERT
        timezone: savedSettings.Timezone
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error saving school settings:', error);
    throw error;
  }
}

module.exports = router;