// // pages/api/auth.js - Updated to auto-create Parents record when password is set
// const sql = require('mssql')
// const crypto = require('crypto')
// const jwt = require('jsonwebtoken')

// // Import the improved database connection
// const { getPool } = require('../../lib/database')

// function hashPassword(password) {
//   return crypto.createHash('sha256').update(password).digest('hex')
// }

// function generateToken(userData) {
//   return jwt.sign(userData, process.env.JWT_SECRET_KEY || 'fallback-secret', { expiresIn: '24h' })
// }

// export default async function handler(req, res) {
//   // Enable CORS
//   res.setHeader('Access-Control-Allow-Credentials', true)
//   res.setHeader('Access-Control-Allow-Origin', '*')
//   res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
//   res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization')

//   if (req.method === 'OPTIONS') {
//     res.status(200).end()
//     return
//   }

//   if (req.method !== 'POST') {
//     return res.status(405).json({ error: 'Method not allowed' })
//   }
// const { action, username, password, student_name, school_id, new_password, is_student_id } = req.body

//   try {
//     if (action === 'login') {
//   return await handleLogin(username, password, is_student_id, res)
//     } else if (action === 'check_student_schools') {
//       return await handleCheckStudentSchools(student_name, res)
//     } else if (action === 'check_password_status') {
//       return await handleCheckPasswordStatus(student_name, school_id, res)
//     } else if (action === 'set_password') {
//       return await handleSetPassword(student_name, school_id, new_password, res)
//     } else if (action === 'reset_password') {
//       return await handleResetPassword(student_name, school_id, new_password, res)
//     } else {
//       return res.status(400).json({ error: 'Invalid action' })
//     }

//   } catch (error) {
//     console.error('Auth error:', error)
//     return res.status(500).json({ 
//       error: 'Internal server error',
//       message: error.message,
//       code: error.code 
//     })
//   }
// }

// async function handleCheckStudentSchools(student_name, res) {
//   if (!student_name) {
//     return res.status(400).json({ error: 'Student name is required' })
//   }

//   try {
//     const pool = await getPool()
//     const result = await pool.request()
//       .input('studentName', sql.NVarChar, student_name.trim())
//       .query(`
//         SELECT DISTINCT s.Name as name, s.SchoolID as id, s.Location as location
//         FROM Students st
//         INNER JOIN Schools s ON st.SchoolID = s.SchoolID
//         WHERE st.Name = @studentName AND st.IsActive = 1 AND s.Status = 'active'
//       `)

//     const schools = result.recordset.map(row => ({
//       id: row.id,
//       name: row.name,
//       location: row.location
//     }))

//     return res.json({ 
//       success: true, 
//       schools: schools 
//     })

//   } catch (error) {
//     console.error('Check student schools error:', error)
//     return res.status(500).json({ error: 'Failed to check student schools' })
//   }
// }

// async function handleLogin(username, password, is_student_id, res) {
//   if (!username || !password) {
//     return res.status(400).json({ error: 'Username and password required' })
//   }

//   console.log('=== LOGIN ATTEMPT ===')
//   console.log('Username:', username)
//   console.log('Is Student ID:', is_student_id)
//   console.log('Password length:', password.length)
//   console.log('====================')

//   try {
//     const pool = await getPool()

//     // ADMIN LOGIN - Try first if NOT a student ID
//     if (!is_student_id) {
//       console.log('Attempting admin login...')
      
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
//         `)
      
//       if (adminResult.recordset.length > 0) {
//         const user = adminResult.recordset[0]
//         console.log('Found admin user:', user.Username)
        
//         const hashedPassword = hashPassword(password)
//         const passwordMatch = hashedPassword === user.PasswordHash
        
//         console.log('Password match:', passwordMatch)
        
//         if (passwordMatch) {
//           const token = generateToken({
//             user_id: user.UserID,
//             username: user.Username,
//             role: user.Role,
//             school_id: user.SchoolID,
//             user_type: 'admin'
//           })

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
//               hasCustomTheme: !!user.ThemeID,  // NEW: Flag for custom theme
//               theme: user.ThemeID ? {          // NEW: Theme data
//                 primary: user.PrimaryColor,
//                 secondary: user.SecondaryColor,
//                 accent: user.AccentColor,
//                 logo: user.LogoUrl
//               } : null
//             }
//           })
//         } else {
//           return res.status(401).json({ error: 'Invalid credentials' })
//         }
//       } else {
//         return res.status(401).json({ error: 'Invalid credentials - user not found' })
//       }
//     }

//     // PARENT LOGIN - Keep your existing code
//     if (is_student_id) {
//       console.log('Attempting parent login with Student ID:', username)
      
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
//         `)

//       if (studentResult.recordset.length === 0) {
//         return res.status(401).json({ error: 'Invalid student ID' })
//       }

//       const student = studentResult.recordset[0]

//       if (!student.ParentPasswordSet || !student.ParentPasswordHash) {
//         return res.status(401).json({ 
//           error: 'No password set. Please contact your school administrator.' 
//         })
//       }

//       const hashedPassword = hashPassword(password)
//       if (student.ParentPasswordHash !== hashedPassword) {
//         return res.status(401).json({ error: 'Invalid password' })
//       }

//       await pool.request()
//         .input('studentId', sql.Int, student.StudentID)
//         .query(`UPDATE Students SET LastLoginAt = GETDATE() WHERE StudentID = @studentId`)

//       const token = generateToken({
//         student_id: student.StudentID,
//         student_name: student.StudentName,
//         school_id: student.SchoolID,
//         parent_name: student.ParentName,
//         parent_id: student.ParentID,
//         role: 'parent',
//         user_type: 'parent'
//       })

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
//           hasCustomTheme: !!student.ThemeID,  // NEW: Also for parents
//           theme: student.ThemeID ? {          // NEW: Theme for parent dashboard
//             primary: student.PrimaryColor,
//             secondary: student.SecondaryColor,
//             accent: student.AccentColor,
//             logo: student.LogoUrl
//           } : null
//         }
//       })
//     }

//   } catch (error) {
//     console.error('Login error:', error)
//     return res.status(500).json({ 
//       error: 'Login failed', 
//       message: error.message 
//     })
//   }
// }

// async function handleCheckPasswordStatus(student_name, school_id, res) {
//   if (!student_name || !school_id) {
//     return res.status(400).json({ error: 'Student name and school ID required' })
//   }

//   try {
//     const pool = await getPool()
    
//     const result = await pool.request()
//       .input('studentName', sql.NVarChar, student_name)
//       .input('schoolId', sql.Int, school_id)
//       .query(`
//         SELECT ParentPasswordSet, Grade, 
//                (SELECT Name FROM Schools WHERE SchoolID = s.SchoolID) as SchoolName
//         FROM Students s 
//         WHERE Name = @studentName AND SchoolID = @schoolId AND IsActive = 1
//       `)

//     if (result.recordset.length === 0) {
//       return res.status(404).json({ error: 'Student not found' })
//     }

//     const student = result.recordset[0]
//     return res.json({
//       password_set: Boolean(student.ParentPasswordSet),
//       student_name,
//       grade: student.Grade,
//       school_name: student.SchoolName
//     })

//   } catch (error) {
//     console.error('Check password status error:', error)
//     return res.status(500).json({ error: 'Failed to check password status', message: error.message })
//   }
// }

// // FIXED: Auto-create Parents record when password is set
// async function handleSetPassword(student_name, school_id, new_password, res) {
//   if (!student_name || !school_id || !new_password) {
//     return res.status(400).json({ error: 'All fields required' })
//   }

//   if (new_password.length < 6) {
//     return res.status(400).json({ error: 'Password must be at least 6 characters' })
//   }

//   try {
//     const pool = await getPool()
    
//     // Start transaction for atomic operation
//     const transaction = new sql.Transaction(pool)
//     await transaction.begin()
    
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
//         `)

//       if (studentResult.recordset.length === 0) {
//         throw new Error('Student not found or password already set')
//       }

//       const studentId = studentResult.recordset[0].StudentID

//       // Check if Parents record already exists
//       const existingParent = await transaction.request()
//         .input('studentId', sql.Int, studentId)
//         .query('SELECT ParentID FROM Parents WHERE StudentID = @studentId')

//       // Create Parents record if it doesn't exist
//       if (existingParent.recordset.length === 0) {
//         await transaction.request()
//           .input('studentId', sql.Int, studentId)
//           .input('parentName', sql.NVarChar, 'Parent/Guardian')
//           .query(`
//             INSERT INTO Parents (StudentID, Name, IsPrimary, CreatedAt)
//             VALUES (@studentId, @parentName, 1, GETDATE())
//           `)
        
//         console.log(`Created Parents record for StudentID ${studentId}`)
//       }

//       // Commit transaction
//       await transaction.commit()

//       return res.json({ 
//         message: 'Password set successfully and parent account created',
//         student_id: studentId,
//         parent_record_created: existingParent.recordset.length === 0
//       })

//     } catch (error) {
//       await transaction.rollback()
//       throw error
//     }

//   } catch (error) {
//     console.error('Set password error:', error)
//     return res.status(500).json({ error: 'Failed to set password', message: error.message })
//   }
// }

// async function handleResetPassword(student_name, school_id, new_password, res) {
//   if (!student_name || !school_id || !new_password) {
//     return res.status(400).json({ error: 'All fields required' })
//   }

//   if (new_password.length < 6) {
//     return res.status(400).json({ error: 'Password must be at least 6 characters' })
//   }

//   try {
//     const pool = await getPool()
    
//     // Check if student exists and already has a password set
//     const checkResult = await pool.request()
//       .input('studentName', sql.NVarChar, student_name)
//       .input('schoolId', sql.Int, school_id)
//       .query(`
//         SELECT StudentID, ParentPasswordSet 
//         FROM Students 
//         WHERE Name = @studentName AND SchoolID = @schoolId AND IsActive = 1
//       `)

//     if (checkResult.recordset.length === 0) {
//       return res.status(404).json({ error: 'Student not found' })
//     }

//     const student = checkResult.recordset[0]
    
//     if (!student.ParentPasswordSet) {
//       return res.status(400).json({ 
//         error: 'No password is set for this student. Please use the "First Time?" option instead.' 
//       })
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
//       `)

//     if (updateResult.rowsAffected[0] === 0) {
//       return res.status(500).json({ error: 'Failed to update password' })
//     }

//     return res.json({ 
//       message: 'Password reset successfully',
//       student_id: student.StudentID
//     })

//   } catch (error) {
//     console.error('Reset password error:', error)
//     return res.status(500).json({ error: 'Failed to reset password', message: error.message })
//   }
// }
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
  const { action, username, password, student_name, school_id, new_password, is_student_id } = req.body;

  try {
    if (action === 'login') {
      return await handleLogin(username, password, is_student_id, res);
    } else if (action === 'check_student_schools') {
      return await handleCheckStudentSchools(student_name, res);
    } else if (action === 'check_password_status') {
      return await handleCheckPasswordStatus(student_name, school_id, res);
    } else if (action === 'set_password') {
      return await handleSetPassword(student_name, school_id, new_password, res);
    } else if (action === 'reset_password') {
      return await handleResetPassword(student_name, school_id, new_password, res);
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      code: error.code 
    });
  }
});

// Check student schools
async function handleCheckStudentSchools(student_name, res) {
  if (!student_name) {
    return res.status(400).json({ error: 'Student name is required' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('studentName', sql.NVarChar, student_name.trim())
      .query(`
        SELECT DISTINCT s.Name as name, s.SchoolID as id, s.Location as location
        FROM Students st
        INNER JOIN Schools s ON st.SchoolID = s.SchoolID
        WHERE st.Name = @studentName AND st.IsActive = 1 AND s.Status = 'active'
      `);

    const schools = result.recordset.map(row => ({
      id: row.id,
      name: row.name,
      location: row.location
    }));

    return res.json({ 
      success: true, 
      schools: schools 
    });

  } catch (error) {
    console.error('Check student schools error:', error);
    return res.status(500).json({ error: 'Failed to check student schools' });
  }
}

// Handle login
async function handleLogin(username, password, is_student_id, res) {
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  console.log('=== LOGIN ATTEMPT ===');
  console.log('Username:', username);
  console.log('Is Student ID:', is_student_id);
  console.log('Password length:', password.length);
  console.log('====================');

  try {
    const pool = await getPool();

    // ADMIN LOGIN - Try first if NOT a student ID
    if (!is_student_id) {
      console.log('Attempting admin login...');
      
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
        console.log('Found admin user:', user.Username);
        
        const hashedPassword = hashPassword(password);
        const passwordMatch = hashedPassword === user.PasswordHash;
        
        console.log('Password match:', passwordMatch);
        
        if (passwordMatch) {
          const token = generateToken({
            user_id: user.UserID,
            username: user.Username,
            role: user.Role,
            school_id: user.SchoolID,
            user_type: 'admin'
          });

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
        } else {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
      } else {
        return res.status(401).json({ error: 'Invalid credentials - user not found' });
      }
    }

    // PARENT LOGIN
    if (is_student_id) {
      console.log('Attempting parent login with Student ID:', username);
      
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
            p.Name as ParentName,
            p.PhoneNumber,
            p.Email,
            p.ParentID,
            st.ThemeID,
            st.PrimaryColor,
            st.SecondaryColor,
            st.AccentColor,
            st.LogoUrl
          FROM Students s
          JOIN Schools sc ON s.SchoolID = sc.SchoolID
          LEFT JOIN Parents p ON s.StudentID = p.StudentID AND p.IsPrimary = 1
          LEFT JOIN SchoolThemes st ON s.SchoolID = st.SchoolID
          WHERE s.StudentID = @studentId AND s.IsActive = 1
        `);

      if (studentResult.recordset.length === 0) {
        return res.status(401).json({ error: 'Invalid student ID' });
      }

      const student = studentResult.recordset[0];

      if (!student.ParentPasswordSet || !student.ParentPasswordHash) {
        return res.status(401).json({ 
          error: 'No password set. Please contact your school administrator.' 
        });
      }

      const hashedPassword = hashPassword(password);
      if (student.ParentPasswordHash !== hashedPassword) {
        return res.status(401).json({ error: 'Invalid password' });
      }

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

      return res.json({
        token,
        user: {
          student_id: student.StudentID,
          student_name: student.StudentName,
          parent_name: student.ParentName,
          parent_id: student.ParentID,
          role: 'parent',
          user_type: 'parent',
          school: {
            id: student.SchoolID,
            name: student.SchoolName
          },
          contact: {
            email: student.Email,
            phone: student.PhoneNumber
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
    console.error('Login error:', error);
    return res.status(500).json({ 
      error: 'Login failed', 
      message: error.message 
    });
  }
}

// Check password status
async function handleCheckPasswordStatus(student_name, school_id, res) {
  if (!student_name || !school_id) {
    return res.status(400).json({ error: 'Student name and school ID required' });
  }

  try {
    const pool = await getPool();
    
    const result = await pool.request()
      .input('studentName', sql.NVarChar, student_name)
      .input('schoolId', sql.Int, school_id)
      .query(`
        SELECT ParentPasswordSet, Grade, 
               (SELECT Name FROM Schools WHERE SchoolID = s.SchoolID) as SchoolName
        FROM Students s 
        WHERE Name = @studentName AND SchoolID = @schoolId AND IsActive = 1
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const student = result.recordset[0];
    return res.json({
      password_set: Boolean(student.ParentPasswordSet),
      student_name,
      grade: student.Grade,
      school_name: student.SchoolName
    });

  } catch (error) {
    console.error('Check password status error:', error);
    return res.status(500).json({ error: 'Failed to check password status', message: error.message });
  }
}

// Set password (first time)
async function handleSetPassword(student_name, school_id, new_password, res) {
  if (!student_name || !school_id || !new_password) {
    return res.status(400).json({ error: 'All fields required' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const pool = await getPool();
    
    // Start transaction for atomic operation
    const transaction = pool.transaction();
    await transaction.begin();
    
    try {
      // Update student password
      const studentResult = await transaction.request()
        .input('studentName', sql.NVarChar, student_name)
        .input('schoolId', sql.Int, school_id)
        .input('passwordHash', sql.NVarChar, hashPassword(new_password))
        .query(`
          UPDATE Students 
          SET ParentPasswordHash = @passwordHash, ParentPasswordSet = 1
          OUTPUT INSERTED.StudentID
          WHERE Name = @studentName AND SchoolID = @schoolId AND IsActive = 1
        `);

      if (studentResult.recordset.length === 0) {
        throw new Error('Student not found or password already set');
      }

      const studentId = studentResult.recordset[0].StudentID;

      // Check if Parents record already exists
      const existingParent = await transaction.request()
        .input('studentId', sql.Int, studentId)
        .query('SELECT ParentID FROM Parents WHERE StudentID = @studentId');

      // Create Parents record if it doesn't exist
      if (existingParent.recordset.length === 0) {
        await transaction.request()
          .input('studentId', sql.Int, studentId)
          .input('parentName', sql.NVarChar, 'Parent/Guardian')
          .query(`
            INSERT INTO Parents (StudentID, Name, IsPrimary, CreatedAt)
            VALUES (@studentId, @parentName, 1, GETDATE())
          `);
        
        console.log(`Created Parents record for StudentID ${studentId}`);
      }

      // Commit transaction
      await transaction.commit();

      return res.json({ 
        message: 'Password set successfully and parent account created',
        student_id: studentId,
        parent_record_created: existingParent.recordset.length === 0
      });

    } catch (error) {
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Set password error:', error);
    return res.status(500).json({ error: 'Failed to set password', message: error.message });
  }
}

// Reset password
async function handleResetPassword(student_name, school_id, new_password, res) {
  if (!student_name || !school_id || !new_password) {
    return res.status(400).json({ error: 'All fields required' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const pool = await getPool();
    
    // Check if student exists and already has a password set
    const checkResult = await pool.request()
      .input('studentName', sql.NVarChar, student_name)
      .input('schoolId', sql.Int, school_id)
      .query(`
        SELECT StudentID, ParentPasswordSet 
        FROM Students 
        WHERE Name = @studentName AND SchoolID = @schoolId AND IsActive = 1
      `);

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const student = checkResult.recordset[0];
    
    if (!student.ParentPasswordSet) {
      return res.status(400).json({ 
        error: 'No password is set for this student. Please use the "First Time?" option instead.' 
      });
    }

    // Update the password
    const updateResult = await pool.request()
      .input('studentName', sql.NVarChar, student_name)
      .input('schoolId', sql.Int, school_id)
      .input('passwordHash', sql.NVarChar, hashPassword(new_password))
      .query(`
        UPDATE Students 
        SET ParentPasswordHash = @passwordHash
        WHERE Name = @studentName AND SchoolID = @schoolId AND IsActive = 1
      `);

    if (updateResult.rowsAffected[0] === 0) {
      return res.status(500).json({ error: 'Failed to update password' });
    }

    return res.json({ 
      message: 'Password reset successfully',
      student_id: student.StudentID
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Failed to reset password', message: error.message });
  }
}

module.exports = router;