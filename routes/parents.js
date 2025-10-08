// // pages/api/parents.js - Parents CRUD API
// const { getPool, sql } = require('../../lib/database')

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
//     console.error('Parents API error:', error)
//     res.status(500).json({
//       error: error.message,
//       timestamp: new Date().toISOString()
//     })
//   }
// }

// async function handleGet(req, res) {
//   const { parent_id, school_id, include_stats, search } = req.query
//   const pool = await getPool()

//   let query = `
//     SELECT DISTINCT
//       p.ParentID,
//       p.Name as ParentName,
//       p.Email,
//       p.Phone,
//       p.Address,
//       p.IsActive,
//       p.CreatedAt,
//   `
  
//   if (include_stats === 'true') {
//     query += `,
//       (SELECT COUNT(DISTINCT st.StudentID) 
//        FROM Students st 
//        WHERE st.ParentPasswordHash IS NOT NULL
//        AND EXISTS (
//          SELECT 1 FROM Students child 
//          WHERE child.ParentPasswordHash = st.ParentPasswordHash
//        )) as LinkedStudents,
//       (SELECT COUNT(*) 
//        FROM dbo.Attendance a 
//        JOIN Students st ON a.StudentID = st.StudentID 
//        WHERE st.ParentPasswordHash IS NOT NULL
//        AND CAST(a.CreatedAt as DATE) = CAST(GETDATE() as DATE)) as TodayChildrenAttendance,
//       (SELECT COUNT(*) 
//        FROM dbo.Attendance a 
//        JOIN Students st ON a.StudentID = st.StudentID 
//        WHERE st.ParentPasswordHash IS NOT NULL
//        AND a.CreatedAt > DATEADD(day, -7, GETDATE())) as WeekChildrenAttendance,
//       (SELECT STRING_AGG(st.Name, ', ') 
//        FROM Students st 
//        WHERE st.ParentPasswordHash IS NOT NULL
//        AND EXISTS (
//          SELECT 1 FROM Students child 
//          WHERE child.ParentPasswordHash = st.ParentPasswordHash
//        )) as ChildrenNames
//     `
//   }
  
//   query += ` FROM Parents p`
  
//   // If filtering by school, join with students
//   if (school_id) {
//     query += `
//       JOIN Students st ON p.ParentID = st.StudentID  -- Assuming relationship
//       WHERE st.SchoolID = @schoolId
//     `
//   }
  
//   const conditions = []
//   const request = pool.request()
  
//   if (parent_id) {
//     if (school_id) {
//       conditions.push('p.ParentID = @parentId')
//     } else {
//       query += ` WHERE p.ParentID = @parentId`
//     }
//     request.input('parentId', sql.Int, parseInt(parent_id))
//   }
  
//   if (search) {
//     const searchCondition = '(p.Name LIKE @search OR p.Email LIKE @search OR p.Phone LIKE @search)'
//     if (school_id || parent_id) {
//       conditions.push(searchCondition)
//     } else {
//       query += ` WHERE ${searchCondition}`
//     }
//     request.input('search', sql.NVarChar, `%${search}%`)
//   }
  
//   if (school_id) {
//     request.input('schoolId', sql.Int, parseInt(school_id))
//   }
  
//   if (conditions.length > 0) {
//     query += ` AND ${conditions.join(' AND ')}`
//   }
  
//   query += ` ORDER BY p.Name`
  
//   const result = await request.query(query)
  
//   const parents = result.recordset.map(parent => ({
//     parent_id: parent.ParentID,
//     name: parent.ParentName,
//     email: parent.Email,
//     phone: parent.Phone,
//     address: parent.Address,
//     is_active: parent.IsActive || false,
//     created_at: parent.CreatedAt,
//     ...(include_stats === 'true' && {
//       stats: {
//         linked_students: parent.LinkedStudents || 0,
//         today_children_attendance: parent.TodayChildrenAttendance || 0,
//         week_children_attendance: parent.WeekChildrenAttendance || 0,
//         children_names: parent.ChildrenNames ? parent.ChildrenNames.split(', ') : []
//       }
//     })
//   }))

//   res.json({
//     success: true,
//     data: parent_id ? parents[0] : parents,
//     total: parents.length,
//     timestamp: new Date().toISOString()
//   })
// }

// async function handlePost(req, res) {
//   const { name, email, phone, address, is_active = true } = req.body
  
//   if (!name) {
//     return res.status(400).json({ error: 'Parent name is required' })
//   }

//   const pool = await getPool()
  
//   // Check if email already exists (if provided)
//   if (email) {
//     const emailCheck = await pool.request()
//       .input('email', sql.NVarChar, email)
//       .query('SELECT ParentID FROM Parents WHERE Email = @email')
      
//     if (emailCheck.recordset.length > 0) {
//       return res.status(400).json({ error: 'Email already exists' })
//     }
//   }
  
//   const result = await pool.request()
//     .input('name', sql.NVarChar, name)
//     .input('email', sql.NVarChar, email)
//     .input('phone', sql.NVarChar, phone)
//     .input('address', sql.NVarChar, address)
//     .input('isActive', sql.Bit, is_active)
//     .query(`
//       INSERT INTO Parents (Name, Email, Phone, Address, IsActive, CreatedAt)
//       OUTPUT INSERTED.*
//       VALUES (@name, @email, @phone, @address, @isActive, GETDATE(), GETDATE())
//     `)

//   const newParent = result.recordset[0]

//   res.status(201).json({
//     success: true,
//     data: {
//       parent_id: newParent.ParentID,
//       name: newParent.Name,
//       email: newParent.Email,
//       phone: newParent.Phone,
//       address: newParent.Address,
//       is_active: newParent.IsActive,
//       created_at: newParent.CreatedAt,
//     },
//     message: 'Parent created successfully',
//     timestamp: new Date().toISOString()
//   })
// }

// async function handlePut(req, res) {
//   const { parent_id } = req.query
//   const { name, email, phone, address, is_active } = req.body
  
//   if (!parent_id) {
//     return res.status(400).json({ error: 'Parent ID is required' })
//   }

//   const pool = await getPool()
  
//   // Check if parent exists
//   const existingParent = await pool.request()
//     .input('parentId', sql.Int, parseInt(parent_id))
//     .query('SELECT ParentID FROM Parents WHERE ParentID = @parentId')
    
//   if (existingParent.recordset.length === 0) {
//     return res.status(404).json({ error: 'Parent not found' })
//   }

//   // Check email uniqueness if updating
//   if (email) {
//     const emailCheck = await pool.request()
//       .input('email', sql.NVarChar, email)
//       .input('parentId', sql.Int, parseInt(parent_id))
//       .query('SELECT ParentID FROM Parents WHERE Email = @email AND ParentID != @parentId')
      
//     if (emailCheck.recordset.length > 0) {
//       return res.status(400).json({ error: 'Email already exists' })
//     }
//   }

//   // Build dynamic update query
//   const updates = []
//   const request = pool.request()
//   request.input('parentId', sql.Int, parseInt(parent_id))
  
//   if (name) {
//     updates.push('Name = @name')
//     request.input('name', sql.NVarChar, name)
//   }
//   if (email !== undefined) {
//     updates.push('Email = @email')
//     request.input('email', sql.NVarChar, email)
//   }
//   if (phone !== undefined) {
//     updates.push('Phone = @phone')
//     request.input('phone', sql.NVarChar, phone)
//   }
//   if (address !== undefined) {
//     updates.push('Address = @address')
//     request.input('address', sql.NVarChar, address)
//   }
//   if (is_active !== undefined) {
//     updates.push('IsActive = @isActive')
//     request.input('isActive', sql.Bit, is_active)
//   }
  
//   if (updates.length === 0) {
//     return res.status(400).json({ error: 'No fields to update' })
//   }
  
//   updates.push('CreatedAt = GETDATE()')
  
//   const result = await request.query(`
//     UPDATE Parents 
//     SET ${updates.join(', ')}
//     OUTPUT INSERTED.*
//     WHERE ParentID = @parentId
//   `)

//   const updatedParent = result.recordset[0]

//   res.json({
//     success: true,
//     data: {
//       parent_id: updatedParent.ParentID,
//       name: updatedParent.Name,
//       email: updatedParent.Email,
//       phone: updatedParent.Phone,
//       address: updatedParent.Address,
//       is_active: updatedParent.IsActive,
//       created_at: updatedParent.CreatedAt,
//     },
//     message: 'Parent updated successfully',
//     timestamp: new Date().toISOString()
//   })
// }

// async function handleDelete(req, res) {
//   const { parent_id } = req.query
//   const { force_delete } = req.body
  
//   if (!parent_id) {
//     return res.status(400).json({ error: 'Parent ID is required' })
//   }

//   const pool = await getPool()
  
//   // Check if parent exists and get related data count
//   const parentCheck = await pool.request()
//     .input('parentId', sql.Int, parseInt(parent_id))
//     .query(`
//       SELECT 
//         p.ParentID, 
//         p.Name,
//         (SELECT COUNT(*) FROM Students st WHERE st.StudentID = p.ParentID) as LinkedStudentCount
//       FROM Parents p 
//       WHERE p.ParentID = @parentId
//     `)
    
//   if (parentCheck.recordset.length === 0) {
//     return res.status(404).json({ error: 'Parent not found' })
//   }

//   const parent = parentCheck.recordset[0]
  
//   // Soft delete if there are linked students (unless force delete)
//   if (parent.LinkedStudentCount > 0 && !force_delete) {
//     const result = await pool.request()
//       .input('parentId', sql.Int, parseInt(parent_id))
//       .query(`
//         UPDATE Parents 
//         SET IsActive = 0, CreatedAt = GETDATE()
//         OUTPUT INSERTED.*
//         WHERE ParentID = @parentId
//       `)

//     return res.json({
//       success: true,
//       message: `Parent "${parent.Name}" deactivated (has ${parent.LinkedStudentCount} linked students)`,
//       action: 'soft_delete',
//       note: 'Use force_delete: true to permanently delete',
//       timestamp: new Date().toISOString()
//     })
//   }

//   // Hard delete
//   if (force_delete && parent.LinkedStudentCount > 0) {
//     // You might want to handle student relationships here
//     // For now, we'll prevent cascade deletion of students
//     return res.status(400).json({
//       error: 'Cannot force delete parent with linked students',
//       message: 'Please remove student relationships first',
//       linked_students: parent.LinkedStudentCount
//     })
//   }

//   await pool.request()
//     .input('parentId', sql.Int, parseInt(parent_id))
//     .query('DELETE FROM Parents WHERE ParentID = @parentId')

//   res.json({
//     success: true,
//     message: `Parent "${parent.Name}" deleted permanently`,
//     action: 'hard_delete',
//     timestamp: new Date().toISOString()
//   })
// }


// routes/parents.js - Parents CRUD API
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../lib/database');

// CORS middleware
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// GET - Fetch parents with optional filters
router.get('/', async (req, res) => {
  try {
    const { parent_id, school_id, include_stats, search } = req.query;
    const pool = await getPool();

    let query = `
      SELECT DISTINCT
        p.ParentID,
        p.Name as ParentName,
        p.Email,
        p.Phone,
        p.Address,
        p.IsActive,
        p.CreatedAt
    `;
    
    if (include_stats === 'true') {
      query += `,
        (SELECT COUNT(DISTINCT st.StudentID) 
         FROM Students st 
         WHERE st.ParentPasswordHash IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM Students child 
           WHERE child.ParentPasswordHash = st.ParentPasswordHash
         )) as LinkedStudents,
        (SELECT COUNT(*) 
         FROM dbo.Attendance a 
         JOIN Students st ON a.StudentID = st.StudentID 
         WHERE st.ParentPasswordHash IS NOT NULL
         AND CAST(a.CreatedAt as DATE) = CAST(GETDATE() as DATE)) as TodayChildrenAttendance,
        (SELECT COUNT(*) 
         FROM dbo.Attendance a 
         JOIN Students st ON a.StudentID = st.StudentID 
         WHERE st.ParentPasswordHash IS NOT NULL
         AND a.CreatedAt > DATEADD(day, -7, GETDATE())) as WeekChildrenAttendance,
        (SELECT STRING_AGG(st.Name, ', ') 
         FROM Students st 
         WHERE st.ParentPasswordHash IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM Students child 
           WHERE child.ParentPasswordHash = st.ParentPasswordHash
         )) as ChildrenNames
      `;
    }
    
    query += ` FROM Parents p`;
    
    // If filtering by school, join with students
    if (school_id) {
      query += `
        JOIN Students st ON p.ParentID = st.StudentID
        WHERE st.SchoolID = @schoolId
      `;
    }
    
    const conditions = [];
    const request = pool.request();
    
    if (parent_id) {
      if (school_id) {
        conditions.push('p.ParentID = @parentId');
      } else {
        query += ` WHERE p.ParentID = @parentId`;
      }
      request.input('parentId', sql.Int, parseInt(parent_id));
    }
    
    if (search) {
      const searchCondition = '(p.Name LIKE @search OR p.Email LIKE @search OR p.Phone LIKE @search)';
      if (school_id || parent_id) {
        conditions.push(searchCondition);
      } else {
        query += ` WHERE ${searchCondition}`;
      }
      request.input('search', sql.NVarChar, `%${search}%`);
    }
    
    if (school_id) {
      request.input('schoolId', sql.Int, parseInt(school_id));
    }
    
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(' AND ')}`;
    }
    
    query += ` ORDER BY p.Name`;
    
    const result = await request.query(query);
    
    const parents = result.recordset.map(parent => ({
      parent_id: parent.ParentID,
      name: parent.ParentName,
      email: parent.Email,
      phone: parent.Phone,
      address: parent.Address,
      is_active: parent.IsActive || false,
      created_at: parent.CreatedAt,
      ...(include_stats === 'true' && {
        stats: {
          linked_students: parent.LinkedStudents || 0,
          today_children_attendance: parent.TodayChildrenAttendance || 0,
          week_children_attendance: parent.WeekChildrenAttendance || 0,
          children_names: parent.ChildrenNames ? parent.ChildrenNames.split(', ') : []
        }
      })
    }));

    res.json({
      success: true,
      data: parent_id ? parents[0] : parents,
      total: parents.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching parents:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST - Create new parent
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, address, is_active = true } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Parent name is required'
      });
    }

    const pool = await getPool();
    
    // Check if email already exists (if provided)
    if (email) {
      const emailCheck = await pool.request()
        .input('email', sql.NVarChar, email)
        .query('SELECT ParentID FROM Parents WHERE Email = @email');
        
      if (emailCheck.recordset.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Email already exists'
        });
      }
    }
    
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email)
      .input('phone', sql.NVarChar, phone)
      .input('address', sql.NVarChar, address)
      .input('isActive', sql.Bit, is_active)
      .query(`
        INSERT INTO Parents (Name, Email, Phone, Address, IsActive, CreatedAt)
        OUTPUT INSERTED.*
        VALUES (@name, @email, @phone, @address, @isActive, GETDATE())
      `);

    const newParent = result.recordset[0];

    res.status(201).json({
      success: true,
      data: {
        parent_id: newParent.ParentID,
        name: newParent.Name,
        email: newParent.Email,
        phone: newParent.Phone,
        address: newParent.Address,
        is_active: newParent.IsActive,
        created_at: newParent.CreatedAt,
      },
      message: 'Parent created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error creating parent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// PUT - Update parent
router.put('/', async (req, res) => {
  try {
    const { parent_id } = req.query;
    const { name, email, phone, address, is_active } = req.body;
    
    if (!parent_id) {
      return res.status(400).json({
        success: false,
        error: 'Parent ID is required'
      });
    }

    const pool = await getPool();
    
    // Check if parent exists
    const existingParent = await pool.request()
      .input('parentId', sql.Int, parseInt(parent_id))
      .query('SELECT ParentID FROM Parents WHERE ParentID = @parentId');
      
    if (existingParent.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Parent not found'
      });
    }

    // Check email uniqueness if updating
    if (email) {
      const emailCheck = await pool.request()
        .input('email', sql.NVarChar, email)
        .input('parentId', sql.Int, parseInt(parent_id))
        .query('SELECT ParentID FROM Parents WHERE Email = @email AND ParentID != @parentId');
        
      if (emailCheck.recordset.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Email already exists'
        });
      }
    }

    // Build dynamic update query
    const updates = [];
    const request = pool.request();
    request.input('parentId', sql.Int, parseInt(parent_id));
    
    if (name) {
      updates.push('Name = @name');
      request.input('name', sql.NVarChar, name);
    }
    if (email !== undefined) {
      updates.push('Email = @email');
      request.input('email', sql.NVarChar, email);
    }
    if (phone !== undefined) {
      updates.push('Phone = @phone');
      request.input('phone', sql.NVarChar, phone);
    }
    if (address !== undefined) {
      updates.push('Address = @address');
      request.input('address', sql.NVarChar, address);
    }
    if (is_active !== undefined) {
      updates.push('IsActive = @isActive');
      request.input('isActive', sql.Bit, is_active);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    updates.push('CreatedAt = GETDATE()');
    
    const result = await request.query(`
      UPDATE Parents 
      SET ${updates.join(', ')}
      OUTPUT INSERTED.*
      WHERE ParentID = @parentId
    `);

    const updatedParent = result.recordset[0];

    res.json({
      success: true,
      data: {
        parent_id: updatedParent.ParentID,
        name: updatedParent.Name,
        email: updatedParent.Email,
        phone: updatedParent.Phone,
        address: updatedParent.Address,
        is_active: updatedParent.IsActive,
        created_at: updatedParent.CreatedAt,
      },
      message: 'Parent updated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error updating parent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// DELETE - Delete/deactivate parent
router.delete('/', async (req, res) => {
  try {
    const { parent_id } = req.query;
    const { force_delete } = req.body;
    
    if (!parent_id) {
      return res.status(400).json({
        success: false,
        error: 'Parent ID is required'
      });
    }

    const pool = await getPool();
    
    // Check if parent exists and get related data count
    const parentCheck = await pool.request()
      .input('parentId', sql.Int, parseInt(parent_id))
      .query(`
        SELECT 
          p.ParentID, 
          p.Name,
          (SELECT COUNT(*) FROM Students st WHERE st.StudentID = p.ParentID) as LinkedStudentCount
        FROM Parents p 
        WHERE p.ParentID = @parentId
      `);
      
    if (parentCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Parent not found'
      });
    }

    const parent = parentCheck.recordset[0];
    
    // Soft delete if there are linked students (unless force delete)
    if (parent.LinkedStudentCount > 0 && !force_delete) {
      const result = await pool.request()
        .input('parentId', sql.Int, parseInt(parent_id))
        .query(`
          UPDATE Parents 
          SET IsActive = 0, CreatedAt = GETDATE()
          OUTPUT INSERTED.*
          WHERE ParentID = @parentId
        `);

      return res.json({
        success: true,
        message: `Parent "${parent.Name}" deactivated (has ${parent.LinkedStudentCount} linked students)`,
        action: 'soft_delete',
        note: 'Use force_delete: true to permanently delete',
        data: {
          parent_id: parent.ParentID,
          name: parent.Name,
          linked_students: parent.LinkedStudentCount
        },
        timestamp: new Date().toISOString()
      });
    }

    // Hard delete
    if (force_delete && parent.LinkedStudentCount > 0) {
      // Prevent cascade deletion of students
      return res.status(400).json({
        success: false,
        error: 'Cannot force delete parent with linked students',
        message: 'Please remove student relationships first',
        data: {
          linked_students: parent.LinkedStudentCount
        }
      });
    }

    await pool.request()
      .input('parentId', sql.Int, parseInt(parent_id))
      .query('DELETE FROM Parents WHERE ParentID = @parentId');

    res.json({
      success: true,
      message: `Parent "${parent.Name}" deleted permanently`,
      action: 'hard_delete',
      data: {
        parent_id: parent.ParentID,
        name: parent.Name
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error deleting parent:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;