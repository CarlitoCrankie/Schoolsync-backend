// // pages/api/schools/[id]/theme.js
// const { getPool, sql } = require('../../../../lib/database');

// // Main handler function - MUST be default export for Next.js
// // pages/api/schools/[id]/theme.js
// // Add DELETE method to your existing handler

// export default async function handler(req, res) {
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

//   if (req.method === 'OPTIONS') {
//     res.status(200).end();
//     return;
//   }

//   const { id } = req.query;
//   const schoolId = parseInt(id);

//   if (isNaN(schoolId)) {
//     return res.status(400).json({ error: 'Invalid school ID' });
//   }

//   try {
//     const pool = await getPool();

//     switch (req.method) {
//       case 'GET':
//         return await handleGetTheme(req, res, pool, schoolId);
//       case 'PUT':
//       case 'POST':
//         return await handleUpdateTheme(req, res, pool, schoolId);
//       case 'DELETE':
//         return await handleDeleteTheme(req, res, pool, schoolId);
//       default:
//         return res.status(405).json({ error: 'Method not allowed' });
//     }
//   } catch (error) {
//     console.error('Theme API error:', error);
//     return res.status(500).json({
//       success: false,
//       error: error.message,
//       timestamp: new Date().toISOString()
//     });
//   }
// }

// // Add this new function
// async function handleDeleteTheme(req, res, pool, schoolId) {
//   try {
//     const request = pool.request();
    
//     await request
//       .input('schoolId', sql.Int, schoolId)
//       .query('DELETE FROM SchoolThemes WHERE SchoolID = @schoolId');

//     return res.status(200).json({
//       success: true,
//       message: 'Theme removed successfully'
//     });
//   } catch (error) {
//     console.error('Error deleting theme:', error);
//     return res.status(500).json({
//       success: false,
//       error: 'Failed to delete theme'
//     });
//   }
// }

// // GET - Fetch school theme
// async function handleGetTheme(req, res, pool, schoolId) {
//   try {
//     const request = pool.request();
    
//     // First, check if SchoolThemes table exists, if not create it
//     await ensureThemeTableExists(pool);

//     // Get theme for this school
//     const result = await request
//       .input('schoolId', sql.Int, schoolId)
//       .query(`
//         SELECT 
//           st.SchoolID as school_id,
//           st.PrimaryColor as primary_color,
//           st.SecondaryColor as secondary_color,
//           st.AccentColor as accent_color,
//           st.LogoUrl as logo_url,
//           s.Name as school_name
//         FROM SchoolThemes st
//         INNER JOIN Schools s ON st.SchoolID = s.SchoolID
//         WHERE st.SchoolID = @schoolId
//       `);

//     if (result.recordset.length > 0) {
//       return res.status(200).json({
//         success: true,
//         theme: result.recordset[0]
//       });
//     } else {
//       // No theme found, return default
//       const schoolResult = await request.query(`
//         SELECT Name as school_name FROM Schools WHERE SchoolID = @schoolId
//       `);
      
//       return res.status(200).json({
//         success: true,
//         theme: {
//           school_id: schoolId,
//           primary_color: '#0EA5E9',
//           secondary_color: '#8B5CF6',
//           accent_color: '#FFFFFF',
//           logo_url: null,
//           school_name: schoolResult.recordset[0]?.school_name || 'School'
//         }
//       });
//     }
//   } catch (error) {
//     console.error('Error fetching theme:', error);
//     return res.status(500).json({
//       success: false,
//       error: 'Failed to fetch theme'
//     });
//   }
// }

// // PUT/POST - Update or create school theme
// async function handleUpdateTheme(req, res, pool, schoolId) {
//   try {
//     const { primary_color, secondary_color, accent_color, logo_url } = req.body;

//     // Validate hex colors
//     const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    
//     if (primary_color && !hexRegex.test(primary_color)) {
//       return res.status(400).json({
//         success: false,
//         error: 'Invalid primary_color format. Must be hex color (e.g., #0000FF)'
//       });
//     }

//     if (secondary_color && !hexRegex.test(secondary_color)) {
//       return res.status(400).json({
//         success: false,
//         error: 'Invalid secondary_color format. Must be hex color'
//       });
//     }

//     if (accent_color && !hexRegex.test(accent_color)) {
//       return res.status(400).json({
//         success: false,
//         error: 'Invalid accent_color format. Must be hex color'
//       });
//     }

//     await ensureThemeTableExists(pool);

//     const request = pool.request();
    
//     // Check if theme already exists
//     const checkResult = await request
//       .input('schoolId', sql.Int, schoolId)
//       .query('SELECT SchoolID FROM SchoolThemes WHERE SchoolID = @schoolId');

//     if (checkResult.recordset.length > 0) {
//       // Update existing theme
//       const updateRequest = pool.request();
//       await updateRequest
//         .input('schoolId', sql.Int, schoolId)
//         .input('primaryColor', sql.NVarChar, primary_color || null)
//         .input('secondaryColor', sql.NVarChar, secondary_color || null)
//         .input('accentColor', sql.NVarChar, accent_color || null)
//         .input('logoUrl', sql.NVarChar, logo_url || null)
//         .query(`
//           UPDATE SchoolThemes
//           SET 
//             PrimaryColor = COALESCE(@primaryColor, PrimaryColor),
//             SecondaryColor = COALESCE(@secondaryColor, SecondaryColor),
//             AccentColor = COALESCE(@accentColor, AccentColor),
//             LogoUrl = @logoUrl,
//             UpdatedAt = GETDATE()
//           WHERE SchoolID = @schoolId
//         `);

//       return res.status(200).json({
//         success: true,
//         message: 'Theme updated successfully'
//       });
//     } else {
//       // Insert new theme
//       const insertRequest = pool.request();
//       await insertRequest
//         .input('schoolId', sql.Int, schoolId)
//         .input('primaryColor', sql.NVarChar, primary_color || '#0EA5E9')
//         .input('secondaryColor', sql.NVarChar, secondary_color || '#8B5CF6')
//         .input('accentColor', sql.NVarChar, accent_color || '#FFFFFF')
//         .input('logoUrl', sql.NVarChar, logo_url || null)
//         .query(`
//           INSERT INTO SchoolThemes (
//             SchoolID, 
//             PrimaryColor, 
//             SecondaryColor, 
//             AccentColor, 
//             LogoUrl,
//             CreatedAt,
//             UpdatedAt
//           )
//           VALUES (
//             @schoolId,
//             @primaryColor,
//             @secondaryColor,
//             @accentColor,
//             @logoUrl,
//             GETDATE(),
//             GETDATE()
//           )
//         `);

//       return res.status(201).json({
//         success: true,
//         message: 'Theme created successfully'
//       });
//     }
//   } catch (error) {
//     console.error('Error updating theme:', error);
//     return res.status(500).json({
//       success: false,
//       error: 'Failed to update theme'
//     });
//   }
// }

// // Helper function to ensure SchoolThemes table exists
// async function ensureThemeTableExists(pool) {
//   try {
//     await pool.request().query(`
//       IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SchoolThemes')
//       BEGIN
//         CREATE TABLE SchoolThemes (
//           ThemeID INT IDENTITY(1,1) PRIMARY KEY,
//           SchoolID INT NOT NULL,
//           PrimaryColor NVARCHAR(7) DEFAULT '#0EA5E9',
//           SecondaryColor NVARCHAR(7) DEFAULT '#8B5CF6',
//           AccentColor NVARCHAR(7) DEFAULT '#FFFFFF',
//           LogoUrl NVARCHAR(500) NULL,
//           CreatedAt DATETIME DEFAULT GETDATE(),
//           UpdatedAt DATETIME DEFAULT GETDATE(),
//           FOREIGN KEY (SchoolID) REFERENCES Schools(SchoolID) ON DELETE CASCADE,
//           UNIQUE(SchoolID)
//         )
//       END
//     `);
    
//     return true;
//   } catch (error) {
//     console.error('Error creating SchoolThemes table:', error);
//     throw error;
//   }
// }

// routes/school-theme.js - School theme management
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../lib/database');

// CORS middleware
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// GET - Fetch school theme by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = parseInt(id);

    if (isNaN(schoolId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid school ID'
      });
    }

    const pool = await getPool();
    const request = pool.request();
    
    // First, check if SchoolThemes table exists, if not create it
    await ensureThemeTableExists(pool);

    // Get theme for this school
    const result = await request
      .input('schoolId', sql.Int, schoolId)
      .query(`
        SELECT 
          st.SchoolID as school_id,
          st.PrimaryColor as primary_color,
          st.SecondaryColor as secondary_color,
          st.AccentColor as accent_color,
          st.LogoUrl as logo_url,
          s.Name as school_name
        FROM SchoolThemes st
        INNER JOIN Schools s ON st.SchoolID = s.SchoolID
        WHERE st.SchoolID = @schoolId
      `);

    if (result.recordset.length > 0) {
      return res.status(200).json({
        success: true,
        theme: result.recordset[0]
      });
    } else {
      // No theme found, return default
      const schoolResult = await request.query(`
        SELECT Name as school_name FROM Schools WHERE SchoolID = @schoolId
      `);
      
      return res.status(200).json({
        success: true,
        theme: {
          school_id: schoolId,
          primary_color: '#0EA5E9',
          secondary_color: '#8B5CF6',
          accent_color: '#FFFFFF',
          logo_url: null,
          school_name: schoolResult.recordset[0]?.school_name || 'School'
        }
      });
    }

  } catch (error) {
    console.error('Error fetching theme:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch theme',
      timestamp: new Date().toISOString()
    });
  }
});

// PUT - Update school theme
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = parseInt(id);

    if (isNaN(schoolId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid school ID'
      });
    }

    const { primary_color, secondary_color, accent_color, logo_url } = req.body;

    // Validate hex colors
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    
    if (primary_color && !hexRegex.test(primary_color)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid primary_color format. Must be hex color (e.g., #0000FF)'
      });
    }

    if (secondary_color && !hexRegex.test(secondary_color)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid secondary_color format. Must be hex color'
      });
    }

    if (accent_color && !hexRegex.test(accent_color)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid accent_color format. Must be hex color'
      });
    }

    const pool = await getPool();
    await ensureThemeTableExists(pool);

    const request = pool.request();
    
    // Check if theme already exists
    const checkResult = await request
      .input('schoolId', sql.Int, schoolId)
      .query('SELECT SchoolID FROM SchoolThemes WHERE SchoolID = @schoolId');

    if (checkResult.recordset.length > 0) {
      // Update existing theme
      const updateRequest = pool.request();
      await updateRequest
        .input('schoolId', sql.Int, schoolId)
        .input('primaryColor', sql.NVarChar, primary_color || null)
        .input('secondaryColor', sql.NVarChar, secondary_color || null)
        .input('accentColor', sql.NVarChar, accent_color || null)
        .input('logoUrl', sql.NVarChar, logo_url || null)
        .query(`
          UPDATE SchoolThemes
          SET 
            PrimaryColor = COALESCE(@primaryColor, PrimaryColor),
            SecondaryColor = COALESCE(@secondaryColor, SecondaryColor),
            AccentColor = COALESCE(@accentColor, AccentColor),
            LogoUrl = @logoUrl,
            UpdatedAt = GETDATE()
          WHERE SchoolID = @schoolId
        `);

      return res.status(200).json({
        success: true,
        message: 'Theme updated successfully'
      });
    } else {
      // Insert new theme
      const insertRequest = pool.request();
      await insertRequest
        .input('schoolId', sql.Int, schoolId)
        .input('primaryColor', sql.NVarChar, primary_color || '#0EA5E9')
        .input('secondaryColor', sql.NVarChar, secondary_color || '#8B5CF6')
        .input('accentColor', sql.NVarChar, accent_color || '#FFFFFF')
        .input('logoUrl', sql.NVarChar, logo_url || null)
        .query(`
          INSERT INTO SchoolThemes (
            SchoolID, 
            PrimaryColor, 
            SecondaryColor, 
            AccentColor, 
            LogoUrl,
            CreatedAt,
            UpdatedAt
          )
          VALUES (
            @schoolId,
            @primaryColor,
            @secondaryColor,
            @accentColor,
            @logoUrl,
            GETDATE(),
            GETDATE()
          )
        `);

      return res.status(201).json({
        success: true,
        message: 'Theme created successfully'
      });
    }

  } catch (error) {
    console.error('Error updating theme:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update theme',
      timestamp: new Date().toISOString()
    });
  }
});

// POST - Create/Update school theme (alternative to PUT)
router.post('/:id', async (req, res) => {
  // Reuse PUT logic for POST
  return router.handle({ ...req, method: 'PUT' }, res);
});

// DELETE - Remove school theme
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const schoolId = parseInt(id);

    if (isNaN(schoolId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid school ID'
      });
    }

    const pool = await getPool();
    const request = pool.request();
    
    await request
      .input('schoolId', sql.Int, schoolId)
      .query('DELETE FROM SchoolThemes WHERE SchoolID = @schoolId');

    return res.status(200).json({
      success: true,
      message: 'Theme removed successfully'
    });

  } catch (error) {
    console.error('Error deleting theme:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete theme',
      timestamp: new Date().toISOString()
    });
  }
});

// Helper function to ensure SchoolThemes table exists
async function ensureThemeTableExists(pool) {
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SchoolThemes')
      BEGIN
        CREATE TABLE SchoolThemes (
          ThemeID INT IDENTITY(1,1) PRIMARY KEY,
          SchoolID INT NOT NULL,
          PrimaryColor NVARCHAR(7) DEFAULT '#0EA5E9',
          SecondaryColor NVARCHAR(7) DEFAULT '#8B5CF6',
          AccentColor NVARCHAR(7) DEFAULT '#FFFFFF',
          LogoUrl NVARCHAR(500) NULL,
          CreatedAt DATETIME DEFAULT GETDATE(),
          UpdatedAt DATETIME DEFAULT GETDATE(),
          FOREIGN KEY (SchoolID) REFERENCES Schools(SchoolID) ON DELETE CASCADE,
          UNIQUE(SchoolID)
        )
      END
    `);
    
    return true;
  } catch (error) {
    console.error('Error creating SchoolThemes table:', error);
    throw error;
  }
}

module.exports = router;