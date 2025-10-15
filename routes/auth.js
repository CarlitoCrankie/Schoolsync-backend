// // routes/auth.js
// const express = require('express');
// const router = express.Router();
// const crypto = require('crypto');
// const jwt = require('jsonwebtoken');
// const { getPool, sql } = require('../lib/database');

// // Helper functions
// function hashPassword(password) {
//   return crypto.createHash('sha256').update(password).digest('hex');
// }

// function generateToken(userData) {
//   return jwt.sign(userData, process.env.JWT_SECRET_KEY || 'fallback-secret', { expiresIn: '24h' });
// }

// // Main auth endpoint
// router.post('/', async (req, res) => {
//   const { action, username, password, student_name, school_id, new_password, is_student_id } = req.body;

//   try {
//     if (action === 'login') {
//       return await handleLogin(username, password, is_student_id, res);
//     } else if (action === 'check_student_schools') {
//       return await handleCheckStudentSchools(student_name, res);
//     } else if (action === 'check_password_status') {
//       return await handleCheckPasswordStatus(student_name, school_id, res);
//     } else if (action === 'set_password') {
//       return await handleSetPassword(student_name, school_id, new_password, res);
//     } else if (action === 'reset_password') {
//       return await handleResetPassword(student_name, school_id, new_password, res);
//     } else {
//       return res.status(400).json({ error: 'Invalid action' });
//     }

//   } catch (error) {
//     console.error('Auth error:', error);
//     return res.status(500).json({ 
//       error: 'Internal server error',
//       message: error.message,
//       code: error.code 
//     });
//   }
// });

// // Check student schools
// async function handleCheckStudentSchools(student_name, res) {
//   if (!student_name) {
//     return res.status(400).json({ error: 'Student name is required' });
//   }

//   try {
//     const pool = await getPool();
//     const result = await pool.request()
//       .input('studentName', sql.NVarChar, student_name.trim())
//       .query(`
//         SELECT DISTINCT s.Name as name, s.SchoolID as id, s.Location as location
//         FROM Students st
//         INNER JOIN Schools s ON st.SchoolID = s.SchoolID
//         WHERE st.Name = @studentName AND st.IsActive = 1 AND s.Status = 'active'
//       `);

//     const schools = result.recordset.map(row => ({
//       id: row.id,
//       name: row.name,
//       location: row.location
//     }));

//     return res.json({ 
//       success: true, 
//       schools: schools 
//     });

//   } catch (error) {
//     console.error('Check student schools error:', error);
//     return res.status(500).json({ error: 'Failed to check student schools' });
//   }
// }

// // Handle login
// async function handleLogin(username, password, is_student_id, res) {
//   if (!username || !password) {
//     return res.status(400).json({ error: 'Username and password required' });
//   }

//   console.log('=== LOGIN ATTEMPT ===');
//   console.log('Username:', username);
//   console.log('Is Student ID:', is_student_id);
//   console.log('Password length:', password.length);
//   console.log('====================');

//   try {
//     const pool = await getPool();

//     // ADMIN LOGIN - Try first if NOT a student ID
//     if (!is_student_id) {
//       console.log('Attempting admin login...');
      
//       const adminResult = await pool.request()
//         .input('username', sql.NVarChar, username)
//         .query(`
//           SELECT 
//             u.UserID, 
//             u.Username, 
//             u.PasswordHash, 
//             u.Role, 
//             u.SchoolID, 
//             s.Name as SchoolName,
//             st.ThemeID,
//             st.PrimaryColor,
//             st.SecondaryColor,
//             st.AccentColor,
//             st.LogoUrl
//           FROM Users u
//           LEFT JOIN Schools s ON u.SchoolID = s.SchoolID
//           LEFT JOIN SchoolThemes st ON s.SchoolID = st.SchoolID
//           WHERE u.Username = @username AND u.IsActive = 1
//         `);
      
//       if (adminResult.recordset.length > 0) {
//         const user = adminResult.recordset[0];
//         console.log('Found admin user:', user.Username);
        
//         const hashedPassword = hashPassword(password);
//         const passwordMatch = hashedPassword === user.PasswordHash;
        
//         console.log('Password match:', passwordMatch);
        
//         if (passwordMatch) {
//           const token = generateToken({
//             user_id: user.UserID,
//             username: user.Username,
//             role: user.Role,
//             school_id: user.SchoolID,
//             user_type: 'admin'
//           });

//           return res.json({
//             token,
//             user: {
//               id: user.UserID,
//               username: user.Username,
//               role: user.Role,
//               user_type: 'admin',
//               school_id: user.SchoolID,
//               school: user.SchoolID ? {
//                 id: user.SchoolID,
//                 name: user.SchoolName
//               } : null,
//               hasCustomTheme: !!user.ThemeID,
//               theme: user.ThemeID ? {
//                 primary: user.PrimaryColor,
//                 secondary: user.SecondaryColor,
//                 accent: user.AccentColor,
//                 logo: user.LogoUrl
//               } : null
//             }
//           });
//         } else {
//           return res.status(401).json({ error: 'Invalid credentials' });
//         }
//       } else {
//         return res.status(401).json({ error: 'Invalid credentials - user not found' });
//       }
//     }

//     // PARENT LOGIN
//     if (is_student_id) {
//       console.log('Attempting parent login with Student ID:', username);
      
//       const studentResult = await pool.request()
//         .input('studentId', sql.Int, parseInt(username))
//         .query(`
//           SELECT 
//             s.StudentID,
//             s.Name as StudentName,
//             s.SchoolID,
//             sc.Name as SchoolName,
//             s.Grade,
//             s.ParentPasswordHash,
//             s.ParentPasswordSet,
//             p.Name as ParentName,
//             p.PhoneNumber,
//             p.Email,
//             p.ParentID,
//             st.ThemeID,
//             st.PrimaryColor,
//             st.SecondaryColor,
//             st.AccentColor,
//             st.LogoUrl
//           FROM Students s
//           JOIN Schools sc ON s.SchoolID = sc.SchoolID
//           LEFT JOIN Parents p ON s.StudentID = p.StudentID AND p.IsPrimary = 1
//           LEFT JOIN SchoolThemes st ON s.SchoolID = st.SchoolID
//           WHERE s.StudentID = @studentId AND s.IsActive = 1
//         `);

//       if (studentResult.recordset.length === 0) {
//         return res.status(401).json({ error: 'Invalid student ID' });
//       }

//       const student = studentResult.recordset[0];

//       if (!student.ParentPasswordSet || !student.ParentPasswordHash) {
//         return res.status(401).json({ 
//           error: 'No password set. Please contact your school administrator.' 
//         });
//       }

//       const hashedPassword = hashPassword(password);
//       if (student.ParentPasswordHash !== hashedPassword) {
//         return res.status(401).json({ error: 'Invalid password' });
//       }

//       await pool.request()
//         .input('studentId', sql.Int, student.StudentID)
//         .query(`UPDATE Students SET LastLoginAt = GETDATE() WHERE StudentID = @studentId`);

//       const token = generateToken({
//         student_id: student.StudentID,
//         student_name: student.StudentName,
//         school_id: student.SchoolID,
//         parent_name: student.ParentName,
//         parent_id: student.ParentID,
//         role: 'parent',
//         user_type: 'parent'
//       });

//       return res.json({
//         token,
//         user: {
//           student_id: student.StudentID,
//           student_name: student.StudentName,
//           parent_name: student.ParentName,
//           parent_id: student.ParentID,
//           role: 'parent',
//           user_type: 'parent',
//           school: {
//             id: student.SchoolID,
//             name: student.SchoolName
//           },
//           contact: {
//             email: student.Email,
//             phone: student.PhoneNumber
//           },
//           hasCustomTheme: !!student.ThemeID,
//           theme: student.ThemeID ? {
//             primary: student.PrimaryColor,
//             secondary: student.SecondaryColor,
//             accent: student.AccentColor,
//             logo: student.LogoUrl
//           } : null
//         }
//       });
//     }

//   } catch (error) {
//     console.error('Login error:', error);
//     return res.status(500).json({ 
//       error: 'Login failed', 
//       message: error.message 
//     });
//   }
// }

// // Check password status
// async function handleCheckPasswordStatus(student_name, school_id, res) {
//   if (!student_name || !school_id) {
//     return res.status(400).json({ error: 'Student name and school ID required' });
//   }

//   try {
//     const pool = await getPool();
    
//     const result = await pool.request()
//       .input('studentName', sql.NVarChar, student_name)
//       .input('schoolId', sql.Int, school_id)
//       .query(`
//         SELECT ParentPasswordSet, Grade, 
//                (SELECT Name FROM Schools WHERE SchoolID = s.SchoolID) as SchoolName
//         FROM Students s 
//         WHERE Name = @studentName AND SchoolID = @schoolId AND IsActive = 1
//       `);

//     if (result.recordset.length === 0) {
//       return res.status(404).json({ error: 'Student not found' });
//     }

//     const student = result.recordset[0];
//     return res.json({
//       password_set: Boolean(student.ParentPasswordSet),
//       student_name,
//       grade: student.Grade,
//       school_name: student.SchoolName
//     });

//   } catch (error) {
//     console.error('Check password status error:', error);
//     return res.status(500).json({ error: 'Failed to check password status', message: error.message });
//   }
// }

// // Set password (first time)
// async function handleSetPassword(student_name, school_id, new_password, res) {
//   if (!student_name || !school_id || !new_password) {
//     return res.status(400).json({ error: 'All fields required' });
//   }

//   if (new_password.length < 6) {
//     return res.status(400).json({ error: 'Password must be at least 6 characters' });
//   }

//   try {
//     const pool = await getPool();
    
//     // Start transaction for atomic operation
//     const transaction = pool.transaction();
//     await transaction.begin();
    
//     try {
//       // Update student password
//       const studentResult = await transaction.request()
//         .input('studentName', sql.NVarChar, student_name)
//         .input('schoolId', sql.Int, school_id)
//         .input('passwordHash', sql.NVarChar, hashPassword(new_password))
//         .query(`
//           UPDATE Students 
//           SET ParentPasswordHash = @passwordHash, ParentPasswordSet = 1
//           OUTPUT INSERTED.StudentID
//           WHERE Name = @studentName AND SchoolID = @schoolId AND IsActive = 1
//         `);

//       if (studentResult.recordset.length === 0) {
//         throw new Error('Student not found or password already set');
//       }

//       const studentId = studentResult.recordset[0].StudentID;

//       // Check if Parents record already exists
//       const existingParent = await transaction.request()
//         .input('studentId', sql.Int, studentId)
//         .query('SELECT ParentID FROM Parents WHERE StudentID = @studentId');

//       // Create Parents record if it doesn't exist
//       if (existingParent.recordset.length === 0) {
//         await transaction.request()
//           .input('studentId', sql.Int, studentId)
//           .input('parentName', sql.NVarChar, 'Parent/Guardian')
//           .query(`
//             INSERT INTO Parents (StudentID, Name, IsPrimary, CreatedAt)
//             VALUES (@studentId, @parentName, 1, GETDATE())
//           `);
        
//         console.log(`Created Parents record for StudentID ${studentId}`);
//       }

//       // Commit transaction
//       await transaction.commit();

//       return res.json({ 
//         message: 'Password set successfully and parent account created',
//         student_id: studentId,
//         parent_record_created: existingParent.recordset.length === 0
//       });

//     } catch (error) {
//       await transaction.rollback();
//       throw error;
//     }

//   } catch (error) {
//     console.error('Set password error:', error);
//     return res.status(500).json({ error: 'Failed to set password', message: error.message });
//   }
// }

// // Reset password
// async function handleResetPassword(student_name, school_id, new_password, res) {
//   if (!student_name || !school_id || !new_password) {
//     return res.status(400).json({ error: 'All fields required' });
//   }

//   if (new_password.length < 6) {
//     return res.status(400).json({ error: 'Password must be at least 6 characters' });
//   }

//   try {
//     const pool = await getPool();
    
//     // Check if student exists and already has a password set
//     const checkResult = await pool.request()
//       .input('studentName', sql.NVarChar, student_name)
//       .input('schoolId', sql.Int, school_id)
//       .query(`
//         SELECT StudentID, ParentPasswordSet 
//         FROM Students 
//         WHERE Name = @studentName AND SchoolID = @schoolId AND IsActive = 1
//       `);

//     if (checkResult.recordset.length === 0) {
//       return res.status(404).json({ error: 'Student not found' });
//     }

//     const student = checkResult.recordset[0];
    
//     if (!student.ParentPasswordSet) {
//       return res.status(400).json({ 
//         error: 'No password is set for this student. Please use the "First Time?" option instead.' 
//       });
//     }

//     // Update the password
//     const updateResult = await pool.request()
//       .input('studentName', sql.NVarChar, student_name)
//       .input('schoolId', sql.Int, school_id)
//       .input('passwordHash', sql.NVarChar, hashPassword(new_password))
//       .query(`
//         UPDATE Students 
//         SET ParentPasswordHash = @passwordHash
//         WHERE Name = @studentName AND SchoolID = @schoolId AND IsActive = 1
//       `);

//     if (updateResult.rowsAffected[0] === 0) {
//       return res.status(500).json({ error: 'Failed to update password' });
//     }

//     return res.json({ 
//       message: 'Password reset successfully',
//       student_id: student.StudentID
//     });

//   } catch (error) {
//     console.error('Reset password error:', error);
//     return res.status(500).json({ error: 'Failed to reset password', message: error.message });
//   }
// }

// module.exports = router;
// routes/auth.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../lib/database');

// Helper functions
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken(userData) {
  return jwt.sign(userData, process.env.JWT_SECRET_KEY || 'fallback-secret', { expiresIn: '24h' });
}

// Main auth endpoint
router.post('/', async (req, res) => {
  const { action, username, password, student_id, school_id, new_password, is_student_id } = req.body;

  try {
    if (action === 'login') {
      return await handleLogin(username, password, is_student_id, res);
    } else if (action === 'set_password') {
      // ADMIN ONLY - Called from school dashboard Students tab
      return await handleSetPasswordByAdmin(student_id, school_id, new_password, res);
    } else if (action === 'update_parent_contact') {
      // ADMIN ONLY - Called from school dashboard Students tab
      return await handleUpdateParentContact(student_id, req.body, res);
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Handle login (Admin or Parent)
async function handleLogin(username, password, is_student_id, res) {
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  console.log('=== LOGIN ATTEMPT ===');
  console.log('Username:', username);
  console.log('Is Student ID:', is_student_id);
  console.log('====================');

  try {
    const pool = await getPool();

    // ADMIN LOGIN
    if (!is_student_id) {
      console.log('🔐 Attempting admin login...');
      
      const adminResult = await pool.request()
        .input('username', sql.NVarChar, username)
        .query(`
          SELECT 
            u.UserID, 
            u.Username, 
            u.PasswordHash, 
            u.Role, 
            u.SchoolID, 
            s.Name as SchoolName,
            st.ThemeID,
            st.PrimaryColor,
            st.SecondaryColor,
            st.AccentColor,
            st.LogoUrl
          FROM Users u
          LEFT JOIN Schools s ON u.SchoolID = s.SchoolID
          LEFT JOIN SchoolThemes st ON s.SchoolID = st.SchoolID
          WHERE u.Username = @username AND u.IsActive = 1
        `);
      
      if (adminResult.recordset.length > 0) {
        const user = adminResult.recordset[0];
        const hashedPassword = hashPassword(password);
        
        if (hashedPassword === user.PasswordHash) {
          const token = generateToken({
            user_id: user.UserID,
            username: user.Username,
            role: user.Role,
            school_id: user.SchoolID,
            user_type: 'admin'
          });

          console.log('✅ Admin login successful:', user.Username);

          return res.json({
            token,
            user: {
              id: user.UserID,
              username: user.Username,
              role: user.Role,
              user_type: 'admin',
              school_id: user.SchoolID,
              school: user.SchoolID ? {
                id: user.SchoolID,
                name: user.SchoolName
              } : null,
              hasCustomTheme: !!user.ThemeID,
              theme: user.ThemeID ? {
                primary: user.PrimaryColor,
                secondary: user.SecondaryColor,
                accent: user.AccentColor,
                logo: user.LogoUrl
              } : null
            }
          });
        }
      }
      
      return res.status(401).json({ error: 'Invalid credentials' });
    }

  // PARENT LOGIN (StudentID-based)
  if (is_student_id) {
    console.log('👨‍👩‍👧 Attempting parent login with Student ID:', username);
    
    const studentResult = await pool.request()
      .input('studentId', sql.Int, parseInt(username))
      .query(`
        SELECT 
          s.StudentID,
          s.Name as StudentName,
          s.SchoolID,
          sc.Name as SchoolName,
          s.Grade,
          s.ParentPasswordHash,
          s.ParentPasswordSet,
          p.ParentID,
          p.Name as ParentName,
          p.PhoneNumber as ParentPhone,
          p.Email as ParentEmail,
          p.Relationship,
          p.IsPrimary,
          st.ThemeID,
          st.PrimaryColor,
          st.SecondaryColor,
          st.AccentColor,
          st.LogoUrl
        FROM Students s
        JOIN Schools sc ON s.SchoolID = sc.SchoolID
        LEFT JOIN (
          SELECT TOP 1 *
          FROM Parents
          WHERE StudentID = @studentId
          ORDER BY IsPrimary DESC, ParentID ASC
        ) p ON s.StudentID = p.StudentID
        LEFT JOIN SchoolThemes st ON s.SchoolID = st.SchoolID
        WHERE s.StudentID = @studentId AND s.IsActive = 1
      `);

    if (studentResult.recordset.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid student ID or account is inactive' 
      });
    }

    const student = studentResult.recordset[0];

    // ✅ Debug contact info
    console.log('📞 Contact Info Retrieved:', {
      studentId: student.StudentID,
      parentId: student.ParentID,
      parentName: student.ParentName,
      parentEmail: student.ParentEmail,
      parentPhone: student.ParentPhone,
      relationship: student.Relationship,
      isPrimary: student.IsPrimary
    });

    // Check if password is set by school
    if (!student.ParentPasswordSet || !student.ParentPasswordHash) {
      return res.status(401).json({ 
        error: 'Password not set. Please contact your school administrator.'
      });
    }

    // Verify password
    const hashedPassword = hashPassword(password);
    if (student.ParentPasswordHash !== hashedPassword) {
      console.log('❌ Invalid password for StudentID:', username);
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Update last login
    await pool.request()
      .input('studentId', sql.Int, student.StudentID)
      .query(`UPDATE Students SET LastLoginAt = GETDATE() WHERE StudentID = @studentId`);

    const token = generateToken({
      student_id: student.StudentID,
      student_name: student.StudentName,
      school_id: student.SchoolID,
      parent_name: student.ParentName,
      parent_id: student.ParentID,
      role: 'parent',
      user_type: 'parent'
    });

    console.log('✅ Parent login successful - Returning contact info:', {
      email: student.ParentEmail,
      phone: student.ParentPhone
    });

    return res.json({
      token,
      user: {
        student_id: student.StudentID,
        student_name: student.StudentName,
        parent_name: student.ParentName || 'Parent',
        parent_id: student.ParentID,
        role: 'parent',
        user_type: 'parent',
        school: {
          id: student.SchoolID,
          name: student.SchoolName
        },
        contact: {
          email: student.ParentEmail || null,
          phone: student.ParentPhone || null,
          relationship: student.Relationship || null,
          hasContact: !!(student.ParentEmail || student.ParentPhone)
        },
        hasCustomTheme: !!student.ThemeID,
        theme: student.ThemeID ? {
          primary: student.PrimaryColor,
          secondary: student.SecondaryColor,
          accent: student.AccentColor,
          logo: student.LogoUrl
        } : null
      }
    });
  }

  } catch (error) {
    console.error('❌ Login error:', error);
    return res.status(500).json({ 
      error: 'Login failed', 
      message: error.message 
    });
  }
}

// Set/Update password - ADMIN ONLY (called from Students dashboard)
async function handleSetPasswordByAdmin(student_id, school_id, new_password, res) {
  if (!student_id || !school_id || !new_password) {
    return res.status(400).json({ error: 'Student ID, school ID, and password required' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const pool = await getPool();
    
    // Start transaction
    const transaction = pool.transaction();
    await transaction.begin();
    
    try {
      // Get student record
      const studentCheck = await transaction.request()
        .input('studentId', sql.Int, parseInt(student_id))
        .input('schoolId', sql.Int, parseInt(school_id))
        .query(`
          SELECT 
            s.StudentID, 
            s.Name, 
            s.ParentPasswordSet,
            p.ParentID
          FROM Students s
          LEFT JOIN Parents p ON s.StudentID = p.StudentID AND p.IsPrimary = 1
          WHERE s.StudentID = @studentId AND s.SchoolID = @schoolId AND s.IsActive = 1
        `);

      if (studentCheck.recordset.length === 0) {
        throw new Error('Student not found');
      }

      const studentData = studentCheck.recordset[0];
      let parentId = studentData.ParentID;
      
      // Create Parents record if it doesn't exist
      if (!parentId) {
        const parentResult = await transaction.request()
          .input('studentId', sql.Int, parseInt(student_id))
          .input('parentName', sql.NVarChar, `Parent of ${studentData.Name}`)
          .input('isPrimary', sql.Bit, true)
          .query(`
            INSERT INTO Parents (StudentID, Name, IsPrimary, CreatedAt)
            OUTPUT INSERTED.ParentID
            VALUES (@studentId, @parentName, @isPrimary, GETDATE())
          `);
        
        parentId = parentResult.recordset[0].ParentID;
        console.log(`✅ Created Parents record with ID ${parentId} for StudentID ${student_id}`);
      }

      // Update student password
      await transaction.request()
        .input('studentId', sql.Int, parseInt(student_id))
        .input('passwordHash', sql.NVarChar, hashPassword(new_password))
        .query(`
          UPDATE Students 
          SET 
            ParentPasswordHash = @passwordHash, 
            ParentPasswordSet = 1
          WHERE StudentID = @studentId
        `);

      await transaction.commit();

      console.log(`✅ Password ${studentData.ParentPasswordSet ? 'updated' : 'set'} by ADMIN for StudentID ${student_id}`);

      return res.json({ 
        success: true,
        message: studentData.ParentPasswordSet ? 'Parent password updated successfully' : 'Parent password set successfully',
        student_id: parseInt(student_id),
        parent_id: parentId,
        note: 'Parent can now log in with StudentID and the password you set'
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('❌ Set password error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to set password', 
      message: error.message 
    });
  }
}

// Update parent contact info - ADMIN ONLY
async function handleUpdateParentContact(student_id, data, res) {
  const { parent_email, parent_phone } = data;

  if (!student_id) {
    return res.status(400).json({ error: 'Student ID required' });
  }

  try {
    const pool = await getPool();
    
    // ✅ Get first parent record for this student (regardless of IsPrimary)
    const parentCheck = await pool.request()
      .input('studentId', sql.Int, parseInt(student_id))
      .query(`
        SELECT TOP 1 ParentID 
        FROM Parents 
        WHERE StudentID = @studentId
        ORDER BY IsPrimary DESC, ParentID ASC
      `);

    let parentId;

    if (parentCheck.recordset.length === 0) {
      // Create parent record if it doesn't exist
      const createResult = await pool.request()
        .input('studentId', sql.Int, parseInt(student_id))
        .input('parentName', sql.NVarChar, 'Parent/Guardian')
        .input('isPrimary', sql.Bit, 1)
        .query(`
          INSERT INTO Parents (StudentID, Name, IsPrimary, CreatedAt)
          OUTPUT INSERTED.ParentID
          VALUES (@studentId, @parentName, @isPrimary, GETDATE())
        `);
      
      parentId = createResult.recordset[0].ParentID;
      console.log(`✅ Created parent record for StudentID ${student_id}`);
    } else {
      parentId = parentCheck.recordset[0].ParentID;
    }

    // Update parent contact info
    await pool.request()
      .input('parentId', sql.Int, parentId)
      .input('email', sql.NVarChar, parent_email || null)
      .input('phoneNumber', sql.NVarChar, parent_phone || null)
      .query(`
        UPDATE Parents 
        SET 
          Email = @email,
          PhoneNumber = @phoneNumber
        WHERE ParentID = @parentId
      `);

    console.log(`✅ Updated parent contact info for StudentID ${student_id}`);

    return res.json({ 
      success: true,
      message: 'Parent contact information updated successfully' 
    });

  } catch (error) {
    console.error('❌ Update contact error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to update contact information', 
      message: error.message 
    });
  }
}

module.exports = router;