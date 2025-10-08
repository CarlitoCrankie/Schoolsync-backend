// import { getPool, sql } from '../../lib/database'
// import formidable from 'formidable'
// import csv from 'csv-parser'
// import fs from 'fs'
// import crypto from 'crypto'
// import path from 'path'
// import os from 'os'

// export const config = {
//   api: {
//     bodyParser: false,
//     responseLimit: false,
//   },
// }

// function hashPassword(password) {
//   return crypto.createHash('sha256').update(password).digest('hex')
// }

// export default async function handler(req, res) {
//   if (req.method !== 'POST') {
//     return res.status(405).json({ error: 'Method not allowed' })
//   }

//   try {
//     // Use system temp directory instead of hardcoded path
//     const uploadDir = os.tmpdir()
    
//     // Ensure temp directory exists
//     if (!fs.existsSync(uploadDir)) {
//       fs.mkdirSync(uploadDir, { recursive: true })
//     }

//     const form = formidable({
//       uploadDir,
//       keepExtensions: true,
//       maxFileSize: 10 * 1024 * 1024, // 10MB
//     })

//     const [fields, files] = await form.parse(req)
    
//     const file = files.file?.[0]
//     if (!file) {
//       return res.status(400).json({ error: 'No file uploaded' })
//     }

//     const school_id = fields.school_id?.[0]
//     console.log('Upload handler - School ID from form:', school_id)
//     console.log('Upload handler - School ID parsed:', parseInt(school_id))
  
//     if (!school_id) {
//       return res.status(400).json({ error: 'School ID is required' })
//     }

//     const results = await processStudentCSV(file.filepath, parseInt(school_id))
    
//     // Clean up uploaded file
//     fs.unlinkSync(file.filepath)
    
//     res.json(results)
    
//   } catch (error) {
//     console.error('Upload error:', error)
//     res.status(500).json({
//       success: false,
//       error: 'Upload failed',
//       details: error.message
//     })
//   }
// }

// async function processStudentCSV(filePath, schoolId) {
//   console.log('Starting CSV processing for school:', schoolId)
  
//   const pool = await getPool()
//   const results = []
//   const errors = []
//   const warnings = []
  
//   let studentsAdded = 0
//   let studentsUpdated = 0
//   let parentsCreated = 0
//   let parentsUpdated = 0
//   let defaultPasswordsSet = 0

//   return new Promise((resolve, reject) => {
//     const students = []
    
//     fs.createReadStream(filePath)
//       .pipe(csv())
//       .on('data', (row) => {
//         // Clean up the row data and skip empty rows
//         const cleanRow = {}
//         for (const [key, value] of Object.entries(row)) {
//           cleanRow[key.trim().toLowerCase()] = value?.toString().trim() || ''
//         }
        
//         if (cleanRow.name && cleanRow.name !== '' && !cleanRow.name.includes('INSTRUCTIONS')) {
//           students.push(cleanRow)
//         }
//       })
//       .on('end', async () => {
//         console.log(`Found ${students.length} students to process`)
        
//         try {
//           // Initialize the sequence table if needed
//           await initializeSchoolSequence(pool, schoolId)
          
//           // Process each student
//           for (let i = 0; i < students.length; i++) {
//             const student = students[i]
            
//             try {
//               const result = await processStudentRow(pool, student, schoolId, i + 1)
              
//               if (result.studentAdded) studentsAdded++
//               if (result.studentUpdated) studentsUpdated++
//               if (result.parentCreated) parentsCreated++
//               if (result.parentUpdated) parentsUpdated++
//               if (result.defaultPasswordSet) defaultPasswordsSet++
              
//               if (result.warnings.length > 0) {
//                 warnings.push(...result.warnings)
//               }
              
//               results.push({
//                 row: i + 1,
//                 student_name: student.name,
//                 student_id: result.studentId,
//                 status: result.status,
//                 details: result.details
//               })
              
//             } catch (error) {
//               console.error(`Error processing row ${i + 1}:`, error)
//               errors.push({
//                 row: i + 1,
//                 student_name: student.name || 'Unknown',
//                 error: error.message
//               })
//             }
//           }

//           resolve({
//             success: errors.length === 0,
//             summary: {
//               total_rows: students.length,
//               students_added: studentsAdded,
//               students_updated: studentsUpdated,
//               parents_created: parentsCreated,
//               parents_updated: parentsUpdated,
//               default_passwords_set: defaultPasswordsSet,
//               errors: errors.length
//             },
//             results,
//             errors,
//             warnings,
//             timestamp: new Date().toISOString()
//           })
          
//         } catch (error) {
//           console.error('CSV processing error:', error)
//           reject(error)
//         }
//       })
//       .on('error', (error) => {
//         console.error('CSV reading error:', error)
//         reject(error)
//       })
//   })
// }

// async function initializeSchoolSequence(pool, schoolId) {
//   try {
//     // Check if SchoolStudentSequence table exists, create if not
//     await pool.request().query(`
//       IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SchoolStudentSequence' AND xtype='U')
//       CREATE TABLE SchoolStudentSequence (
//           SchoolID INT PRIMARY KEY,
//           NextStudentNumber INT DEFAULT 1
//       )
//     `)
    
//     // Check if this school has a sequence entry, create if not
//     const existingSequence = await pool.request()
//       .input('schoolId', sql.Int, schoolId)
//       .query('SELECT NextStudentNumber FROM SchoolStudentSequence WHERE SchoolID = @schoolId')
    
//     if (existingSequence.recordset.length === 0) {
//       // Find the highest existing student number for this school to continue the sequence
//       const maxExisting = await pool.request()
//         .input('schoolIdPattern', sql.VarChar, `${schoolId}%`)
//         .query(`
//           SELECT MAX(
//             CASE 
//               WHEN CAST(StudentID AS VARCHAR) LIKE @schoolIdPattern 
//                    AND LEN(CAST(StudentID AS VARCHAR)) = ${schoolId.toString().length + 4}
//               THEN CAST(RIGHT(CAST(StudentID AS VARCHAR), 4) AS INT)
//               ELSE 0
//             END
//           ) as MaxNumber
//           FROM Students
//         `)
      
//       const nextNumber = (maxExisting.recordset[0]?.MaxNumber || 0) + 1
      
//       await pool.request()
//         .input('schoolId', sql.Int, schoolId)
//         .input('nextNumber', sql.Int, nextNumber)
//         .query('INSERT INTO SchoolStudentSequence (SchoolID, NextStudentNumber) VALUES (@schoolId, @nextNumber)')
      
//       console.log(`Initialized sequence for school ${schoolId} starting at ${nextNumber}`)
//     }
//   } catch (error) {
//     console.error('Error initializing school sequence:', error)
//     throw error
//   }
// }

// async function getNextStudentId(transaction, schoolId) {
//   // Get and increment the next student number for this school
//   const sequenceResult = await transaction.request()
//     .input('schoolId', sql.Int, schoolId)
//     .query(`
//       UPDATE SchoolStudentSequence 
//       SET NextStudentNumber = NextStudentNumber + 1
//       OUTPUT INSERTED.NextStudentNumber - 1 as CurrentNumber
//       WHERE SchoolID = @schoolId
//     `)
  
//   if (sequenceResult.recordset.length === 0) {
//     throw new Error(`No sequence found for school ${schoolId}. This should have been initialized.`)
//   }
  
//   const studentNumber = sequenceResult.recordset[0].CurrentNumber
//   const customStudentId = parseInt(`${schoolId}${studentNumber.toString().padStart(4, '0')}`)
  
//   return customStudentId
// }


// // async function processStudentRow(pool, studentData, schoolId, rowNumber) {
// //   const studentName = studentData.name?.trim()
// //   const grade = studentData.grade?.trim()
// //   const parentName = studentData.parent_name?.trim()
// //   const parentEmail = studentData.parent_email?.trim()
// //   const parentPhone = studentData.parent_phone?.trim()
// //   const parentPassword = studentData.parent_password?.trim() || '12345'
  
// //   if (!studentName) {
// //     throw new Error('Student name is required')
// //   }

// //   try {
// //     // Check if student exists
// //     const existingStudent = await pool.request()
// //       .input('name', sql.NVarChar, studentName)
// //       .input('schoolId', sql.Int, schoolId)
// //       .query('SELECT StudentID, Grade FROM Students WHERE Name = @name AND SchoolID = @schoolId')
    
// //     let studentId
// //     let studentAdded = false
// //     let studentUpdated = false
    
// //     if (existingStudent.recordset.length > 0) {
// //       studentId = existingStudent.recordset[0].StudentID
      
// //       // Update student grade and password if provided
// //       const updateFields = []
// //       const updateRequest = pool.request().input('studentId', sql.Int, studentId)
      
// //       if (grade) {
// //         updateFields.push('Grade = @grade')
// //         updateRequest.input('grade', sql.NVarChar, grade)
// //       }
      
// //       // Always update parent password
// //       updateFields.push('ParentPasswordHash = @passwordHash')
// //       updateFields.push('ParentPasswordSet = 1')
// //       updateRequest.input('passwordHash', sql.NVarChar, hashPassword(parentPassword))
      
// //       if (updateFields.length > 0) {
// //         await updateRequest.query(`UPDATE Students SET ${updateFields.join(', ')} WHERE StudentID = @studentId`)
// //         studentUpdated = true
// //       }
      
// //     } else {
// //       // Create new student
// //       const insertResult = await pool.request()
// //         .input('name', sql.NVarChar, studentName)
// //         .input('schoolId', sql.Int, schoolId)
// //         .input('grade', sql.NVarChar, grade || null)
// //         .input('passwordHash', sql.NVarChar, hashPassword(parentPassword))
// //         .query(`
// //           INSERT INTO Students (Name, SchoolID, Grade, IsActive, CreatedAt, ParentPasswordHash, ParentPasswordSet)
// //           OUTPUT INSERTED.StudentID
// //           VALUES (@name, @schoolId, @grade, 1, GETDATE(), @passwordHash, 1)
// //         `)
      
// //       studentId = insertResult.recordset[0].StudentID
// //       studentAdded = true
// //     }

// //     // Handle parent information - ALWAYS process if any parent data exists
// //     let parentCreated = false
// //     let parentUpdated = false
    
// //     if (parentName || parentEmail || parentPhone) {
// //       // Check if parent exists for this student
// //       const existingParent = await pool.request()
// //         .input('studentId', sql.Int, studentId)
// //         .query('SELECT ParentID, Name, Email, PhoneNumber FROM Parents WHERE StudentID = @studentId')
      
// //       if (existingParent.recordset.length > 0) {
// //         // Update existing parent - only update fields that have values
// //         const parentUpdateFields = []
// //         const parentRequest = pool.request().input('parentId', sql.Int, existingParent.recordset[0].ParentID)
        
// //         if (parentName) {
// //           parentUpdateFields.push('Name = @parentName')
// //           parentRequest.input('parentName', sql.NVarChar, parentName)
// //         }
// //         if (parentEmail) {
// //           parentUpdateFields.push('Email = @parentEmail')
// //           parentRequest.input('parentEmail', sql.NVarChar, parentEmail)
// //         }
// //         if (parentPhone) {
// //           parentUpdateFields.push('PhoneNumber = @parentPhone')
// //           parentRequest.input('parentPhone', sql.NVarChar, parentPhone)
// //         }
        
// //         if (parentUpdateFields.length > 0) {
// //           await parentRequest.query(`UPDATE Parents SET ${parentUpdateFields.join(', ')} WHERE ParentID = @parentId`)
// //           parentUpdated = true
// //           console.log(`Row ${rowNumber} - Updated parent for student ${studentName}`)
// //         }
        
// //       } else {
// //         // Create new parent record with error checking
// //         try {
// //           const insertResult = await pool.request()
// //             .input('studentId', sql.Int, studentId)
// //             .input('parentName', sql.NVarChar, parentName || 'Parent/Guardian')
// //             .input('parentEmail', sql.NVarChar, parentEmail || null)
// //             .input('parentPhone', sql.NVarChar, parentPhone || null)
// //             .query(`
// //               INSERT INTO Parents (StudentID, Name, Email, PhoneNumber, IsPrimary, CreatedAt)
// //               OUTPUT INSERTED.ParentID
// //               VALUES (@studentId, @parentName, @parentEmail, @parentPhone, 1, GETDATE())
// //             `)
          
// //           const parentId = insertResult.recordset[0]?.ParentID
// //           if (parentId) {
// //             parentCreated = true
// //             console.log(`Row ${rowNumber} - Created parent ID ${parentId} for student ${studentName}`)
// //           } else {
// //             console.error(`Row ${rowNumber} - Failed to create parent for student ${studentName}`)
// //           }
// //         } catch (parentError) {
// //           console.error(`Row ${rowNumber} - Parent creation error for ${studentName}:`, parentError.message)
// //           // Don't throw - continue processing other students
// //         }
// //       }
// //     }

// //     // Debug logging
// //     console.log(`Row ${rowNumber} - ${studentName}: Student ${studentAdded ? 'added' : studentUpdated ? 'updated' : 'no change'}, Parent ${parentCreated ? 'created' : parentUpdated ? 'updated' : 'no change'}`)

// //     // Generate status message
// //     const statusParts = []
// //     if (studentAdded) statusParts.push('Student created')
// //     if (studentUpdated) statusParts.push('Student updated')
// //     if (parentCreated) statusParts.push('Parent created')
// //     if (parentUpdated) statusParts.push('Parent updated')

// //     return {
// //       status: statusParts.join(', ') || 'No changes',
// //       details: 'Processed successfully',
// //       studentId: studentId,
// //       studentAdded,
// //       studentUpdated,
// //       parentCreated,
// //       parentUpdated,
// //       defaultPasswordSet: true,
// //       warnings: []
// //     }

// //   } catch (error) {
// //     console.error(`Row ${rowNumber} error:`, error)
// //     throw error
// //   }
// // }
// // FIXED: Add student_code processing to the processStudentRow function

// async function processStudentRow(pool, studentData, schoolId, rowNumber) {
//   const studentName = studentData.name?.trim()
//   const grade = studentData.grade?.trim()
//   const studentCode = studentData.student_code?.trim() // ADD THIS LINE
//   const parentName = studentData.parent_name?.trim()
//   const parentEmail = studentData.parent_email?.trim()
//   const parentPhone = studentData.parent_phone?.trim()
//   const parentPassword = studentData.parent_password?.trim() || '12345'
  
//   if (!studentName) {
//     throw new Error('Student name is required')
//   }

//   try {
//     // Check if student exists
//     const existingStudent = await pool.request()
//       .input('name', sql.NVarChar, studentName)
//       .input('schoolId', sql.Int, schoolId)
//       .query('SELECT StudentID, Grade, StudentCode FROM Students WHERE Name = @name AND SchoolID = @schoolId') // ADD StudentCode to SELECT
    
//     let studentId
//     let studentAdded = false
//     let studentUpdated = false
    
//     if (existingStudent.recordset.length > 0) {
//       studentId = existingStudent.recordset[0].StudentID
      
//       // Update student grade, student code, and password if provided
//       const updateFields = []
//       const updateRequest = pool.request().input('studentId', sql.Int, studentId)
      
//       if (grade) {
//         updateFields.push('Grade = @grade')
//         updateRequest.input('grade', sql.NVarChar, grade)
//       }
      
//       // ADD THIS: Update student code if provided
//       if (studentCode) {
//         updateFields.push('StudentCode = @studentCode')
//         updateRequest.input('studentCode', sql.NVarChar, studentCode)
//       }
      
//       // Always update parent password
//       updateFields.push('ParentPasswordHash = @passwordHash')
//       updateFields.push('ParentPasswordSet = 1')
//       updateRequest.input('passwordHash', sql.NVarChar, hashPassword(parentPassword))
      
//       if (updateFields.length > 0) {
//         await updateRequest.query(`UPDATE Students SET ${updateFields.join(', ')} WHERE StudentID = @studentId`)
//         studentUpdated = true
//       }
      
//     } else {
//       // Create new student - ADD StudentCode to INSERT
//       const insertResult = await pool.request()
//         .input('name', sql.NVarChar, studentName)
//         .input('schoolId', sql.Int, schoolId)
//         .input('grade', sql.NVarChar, grade || null)
//         .input('studentCode', sql.NVarChar, studentCode || null) // ADD THIS LINE
//         .input('passwordHash', sql.NVarChar, hashPassword(parentPassword))
//         .query(`
//           INSERT INTO Students (Name, SchoolID, Grade, StudentCode, IsActive, CreatedAt, ParentPasswordHash, ParentPasswordSet)
//           OUTPUT INSERTED.StudentID
//           VALUES (@name, @schoolId, @grade, @studentCode, 1, GETDATE(), @passwordHash, 1)
//         `)
      
//       studentId = insertResult.recordset[0].StudentID
//       studentAdded = true
//     }

//     // Rest of the parent processing code remains the same...
//     let parentCreated = false
//     let parentUpdated = false
    
//     if (parentName || parentEmail || parentPhone) {
//       // Check if parent exists for this student
//       const existingParent = await pool.request()
//         .input('studentId', sql.Int, studentId)
//         .query('SELECT ParentID, Name, Email, PhoneNumber FROM Parents WHERE StudentID = @studentId')
      
//       if (existingParent.recordset.length > 0) {
//         // Update existing parent - only update fields that have values
//         const parentUpdateFields = []
//         const parentRequest = pool.request().input('parentId', sql.Int, existingParent.recordset[0].ParentID)
        
//         if (parentName) {
//           parentUpdateFields.push('Name = @parentName')
//           parentRequest.input('parentName', sql.NVarChar, parentName)
//         }
//         if (parentEmail) {
//           parentUpdateFields.push('Email = @parentEmail')
//           parentRequest.input('parentEmail', sql.NVarChar, parentEmail)
//         }
//         if (parentPhone) {
//           parentUpdateFields.push('PhoneNumber = @parentPhone')
//           parentRequest.input('parentPhone', sql.NVarChar, parentPhone)
//         }
        
//         if (parentUpdateFields.length > 0) {
//           await parentRequest.query(`UPDATE Parents SET ${parentUpdateFields.join(', ')} WHERE ParentID = @parentId`)
//           parentUpdated = true
//           console.log(`Row ${rowNumber} - Updated parent for student ${studentName}`)
//         }
        
//       } else {
//         // Create new parent record with error checking
//         try {
//           const insertResult = await pool.request()
//             .input('studentId', sql.Int, studentId)
//             .input('parentName', sql.NVarChar, parentName || 'Parent/Guardian')
//             .input('parentEmail', sql.NVarChar, parentEmail || null)
//             .input('parentPhone', sql.NVarChar, parentPhone || null)
//             .query(`
//               INSERT INTO Parents (StudentID, Name, Email, PhoneNumber, IsPrimary, CreatedAt)
//               OUTPUT INSERTED.ParentID
//               VALUES (@studentId, @parentName, @parentEmail, @parentPhone, 1, GETDATE())
//             `)
          
//           const parentId = insertResult.recordset[0]?.ParentID
//           if (parentId) {
//             parentCreated = true
//             console.log(`Row ${rowNumber} - Created parent ID ${parentId} for student ${studentName}`)
//           } else {
//             console.error(`Row ${rowNumber} - Failed to create parent for student ${studentName}`)
//           }
//         } catch (parentError) {
//           console.error(`Row ${rowNumber} - Parent creation error for ${studentName}:`, parentError.message)
//           // Don't throw - continue processing other students
//         }
//       }
//     }

//     // Debug logging - ADD student code to logging
//     console.log(`Row ${rowNumber} - ${studentName} (Code: ${studentCode || 'none'}): Student ${studentAdded ? 'added' : studentUpdated ? 'updated' : 'no change'}, Parent ${parentCreated ? 'created' : parentUpdated ? 'updated' : 'no change'}`)

//     // Generate status message
//     const statusParts = []
//     if (studentAdded) statusParts.push('Student created')
//     if (studentUpdated) statusParts.push('Student updated')
//     if (parentCreated) statusParts.push('Parent created')
//     if (parentUpdated) statusParts.push('Parent updated')

//     return {
//       status: statusParts.join(', ') || 'No changes',
//       details: 'Processed successfully',
//       studentId: studentId,
//       studentAdded,
//       studentUpdated,
//       parentCreated,
//       parentUpdated,
//       defaultPasswordSet: true,
//       warnings: []
//     }

//   } catch (error) {
//     console.error(`Row ${rowNumber} error:`, error)
//     throw error
//   }
// }

// routes/upload-students.js - CSV upload and processing for students
const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../lib/database');
const formidable = require('formidable');
const csv = require('csv-parser');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const os = require('os');

// Helper function to hash password
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// POST - Upload and process student CSV
router.post('/', async (req, res) => {
  try {
    // Use system temp directory
    const uploadDir = os.tmpdir();
    
    // Ensure temp directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const form = formidable({
      uploadDir,
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('Form parse error:', err);
        return res.status(400).json({
          success: false,
          error: 'Failed to parse form data',
          details: err.message
        });
      }

      try {
        const file = files.file?.[0] || files.file;
        if (!file) {
          return res.status(400).json({
            success: false,
            error: 'No file uploaded'
          });
        }

        const school_id = fields.school_id?.[0] || fields.school_id;
        console.log('Upload handler - School ID from form:', school_id);
        console.log('Upload handler - School ID parsed:', parseInt(school_id));
      
        if (!school_id) {
          // Clean up uploaded file
          fs.unlinkSync(file.filepath);
          return res.status(400).json({
            success: false,
            error: 'School ID is required'
          });
        }

        const results = await processStudentCSV(file.filepath, parseInt(school_id));
        
        // Clean up uploaded file
        try {
          fs.unlinkSync(file.filepath);
        } catch (unlinkError) {
          console.error('Error deleting temp file:', unlinkError);
        }
        
        res.json(results);

      } catch (processError) {
        console.error('Processing error:', processError);
        res.status(500).json({
          success: false,
          error: 'Processing failed',
          details: processError.message
        });
      }
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Upload failed',
      details: error.message
    });
  }
});

// Process CSV file
async function processStudentCSV(filePath, schoolId) {
  console.log('Starting CSV processing for school:', schoolId);
  
  const pool = await getPool();
  const results = [];
  const errors = [];
  const warnings = [];
  
  let studentsAdded = 0;
  let studentsUpdated = 0;
  let parentsCreated = 0;
  let parentsUpdated = 0;
  let defaultPasswordsSet = 0;

  return new Promise((resolve, reject) => {
    const students = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // Clean up the row data and skip empty rows
        const cleanRow = {};
        for (const [key, value] of Object.entries(row)) {
          cleanRow[key.trim().toLowerCase()] = value?.toString().trim() || '';
        }
        
        if (cleanRow.name && cleanRow.name !== '' && !cleanRow.name.includes('INSTRUCTIONS')) {
          students.push(cleanRow);
        }
      })
      .on('end', async () => {
        console.log(`Found ${students.length} students to process`);
        
        try {
          // Initialize the sequence table if needed
          await initializeSchoolSequence(pool, schoolId);
          
          // Process each student
          for (let i = 0; i < students.length; i++) {
            const student = students[i];
            
            try {
              const result = await processStudentRow(pool, student, schoolId, i + 1);
              
              if (result.studentAdded) studentsAdded++;
              if (result.studentUpdated) studentsUpdated++;
              if (result.parentCreated) parentsCreated++;
              if (result.parentUpdated) parentsUpdated++;
              if (result.defaultPasswordSet) defaultPasswordsSet++;
              
              if (result.warnings.length > 0) {
                warnings.push(...result.warnings);
              }
              
              results.push({
                row: i + 1,
                student_name: student.name,
                student_id: result.studentId,
                status: result.status,
                details: result.details
              });
              
            } catch (error) {
              console.error(`Error processing row ${i + 1}:`, error);
              errors.push({
                row: i + 1,
                student_name: student.name || 'Unknown',
                error: error.message
              });
            }
          }

          resolve({
            success: errors.length === 0,
            summary: {
              total_rows: students.length,
              students_added: studentsAdded,
              students_updated: studentsUpdated,
              parents_created: parentsCreated,
              parents_updated: parentsUpdated,
              default_passwords_set: defaultPasswordsSet,
              errors: errors.length
            },
            results,
            errors,
            warnings,
            timestamp: new Date().toISOString()
          });
          
        } catch (error) {
          console.error('CSV processing error:', error);
          reject(error);
        }
      })
      .on('error', (error) => {
        console.error('CSV reading error:', error);
        reject(error);
      });
  });
}

// Initialize school sequence
async function initializeSchoolSequence(pool, schoolId) {
  try {
    // Check if SchoolStudentSequence table exists, create if not
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SchoolStudentSequence' AND xtype='U')
      CREATE TABLE SchoolStudentSequence (
          SchoolID INT PRIMARY KEY,
          NextStudentNumber INT DEFAULT 1
      )
    `);
    
    // Check if this school has a sequence entry, create if not
    const existingSequence = await pool.request()
      .input('schoolId', sql.Int, schoolId)
      .query('SELECT NextStudentNumber FROM SchoolStudentSequence WHERE SchoolID = @schoolId');
    
    if (existingSequence.recordset.length === 0) {
      // Find the highest existing student number for this school to continue the sequence
      const maxExisting = await pool.request()
        .input('schoolIdPattern', sql.VarChar, `${schoolId}%`)
        .query(`
          SELECT MAX(
            CASE 
              WHEN CAST(StudentID AS VARCHAR) LIKE @schoolIdPattern 
                   AND LEN(CAST(StudentID AS VARCHAR)) = ${schoolId.toString().length + 4}
              THEN CAST(RIGHT(CAST(StudentID AS VARCHAR), 4) AS INT)
              ELSE 0
            END
          ) as MaxNumber
          FROM Students
        `);
      
      const nextNumber = (maxExisting.recordset[0]?.MaxNumber || 0) + 1;
      
      await pool.request()
        .input('schoolId', sql.Int, schoolId)
        .input('nextNumber', sql.Int, nextNumber)
        .query('INSERT INTO SchoolStudentSequence (SchoolID, NextStudentNumber) VALUES (@schoolId, @nextNumber)');
      
      console.log(`Initialized sequence for school ${schoolId} starting at ${nextNumber}`);
    }
  } catch (error) {
    console.error('Error initializing school sequence:', error);
    throw error;
  }
}

// Get next student ID
async function getNextStudentId(transaction, schoolId) {
  // Get and increment the next student number for this school
  const sequenceResult = await transaction.request()
    .input('schoolId', sql.Int, schoolId)
    .query(`
      UPDATE SchoolStudentSequence 
      SET NextStudentNumber = NextStudentNumber + 1
      OUTPUT INSERTED.NextStudentNumber - 1 as CurrentNumber
      WHERE SchoolID = @schoolId
    `);
  
  if (sequenceResult.recordset.length === 0) {
    throw new Error(`No sequence found for school ${schoolId}. This should have been initialized.`);
  }
  
  const studentNumber = sequenceResult.recordset[0].CurrentNumber;
  const customStudentId = parseInt(`${schoolId}${studentNumber.toString().padStart(4, '0')}`);
  
  return customStudentId;
}

// Process individual student row
async function processStudentRow(pool, studentData, schoolId, rowNumber) {
  const studentName = studentData.name?.trim();
  const grade = studentData.grade?.trim();
  const studentCode = studentData.student_code?.trim();
  const parentName = studentData.parent_name?.trim();
  const parentEmail = studentData.parent_email?.trim();
  const parentPhone = studentData.parent_phone?.trim();
  const parentPassword = studentData.parent_password?.trim() || '12345';
  
  if (!studentName) {
    throw new Error('Student name is required');
  }

  try {
    // Check if student exists
    const existingStudent = await pool.request()
      .input('name', sql.NVarChar, studentName)
      .input('schoolId', sql.Int, schoolId)
      .query('SELECT StudentID, Grade, StudentCode FROM Students WHERE Name = @name AND SchoolID = @schoolId');
    
    let studentId;
    let studentAdded = false;
    let studentUpdated = false;
    
    if (existingStudent.recordset.length > 0) {
      studentId = existingStudent.recordset[0].StudentID;
      
      // Update student grade, student code, and password if provided
      const updateFields = [];
      const updateRequest = pool.request().input('studentId', sql.Int, studentId);
      
      if (grade) {
        updateFields.push('Grade = @grade');
        updateRequest.input('grade', sql.NVarChar, grade);
      }
      
      // Update student code if provided
      if (studentCode) {
        updateFields.push('StudentCode = @studentCode');
        updateRequest.input('studentCode', sql.NVarChar, studentCode);
      }
      
      // Always update parent password
      updateFields.push('ParentPasswordHash = @passwordHash');
      updateFields.push('ParentPasswordSet = 1');
      updateRequest.input('passwordHash', sql.NVarChar, hashPassword(parentPassword));
      
      if (updateFields.length > 0) {
        await updateRequest.query(`UPDATE Students SET ${updateFields.join(', ')} WHERE StudentID = @studentId`);
        studentUpdated = true;
      }
      
    } else {
      // Create new student
      const insertResult = await pool.request()
        .input('name', sql.NVarChar, studentName)
        .input('schoolId', sql.Int, schoolId)
        .input('grade', sql.NVarChar, grade || null)
        .input('studentCode', sql.NVarChar, studentCode || null)
        .input('passwordHash', sql.NVarChar, hashPassword(parentPassword))
        .query(`
          INSERT INTO Students (Name, SchoolID, Grade, StudentCode, IsActive, CreatedAt, ParentPasswordHash, ParentPasswordSet)
          OUTPUT INSERTED.StudentID
          VALUES (@name, @schoolId, @grade, @studentCode, 1, GETDATE(), @passwordHash, 1)
        `);
      
      studentId = insertResult.recordset[0].StudentID;
      studentAdded = true;
    }

    // Handle parent information - ALWAYS process if any parent data exists
    let parentCreated = false;
    let parentUpdated = false;
    
    if (parentName || parentEmail || parentPhone) {
      // Check if parent exists for this student
      const existingParent = await pool.request()
        .input('studentId', sql.Int, studentId)
        .query('SELECT ParentID, Name, Email, PhoneNumber FROM Parents WHERE StudentID = @studentId');
      
      if (existingParent.recordset.length > 0) {
        // Update existing parent - only update fields that have values
        const parentUpdateFields = [];
        const parentRequest = pool.request().input('parentId', sql.Int, existingParent.recordset[0].ParentID);
        
        if (parentName) {
          parentUpdateFields.push('Name = @parentName');
          parentRequest.input('parentName', sql.NVarChar, parentName);
        }
        if (parentEmail) {
          parentUpdateFields.push('Email = @parentEmail');
          parentRequest.input('parentEmail', sql.NVarChar, parentEmail);
        }
        if (parentPhone) {
          parentUpdateFields.push('PhoneNumber = @parentPhone');
          parentRequest.input('parentPhone', sql.NVarChar, parentPhone);
        }
        
        if (parentUpdateFields.length > 0) {
          await parentRequest.query(`UPDATE Parents SET ${parentUpdateFields.join(', ')} WHERE ParentID = @parentId`);
          parentUpdated = true;
          console.log(`Row ${rowNumber} - Updated parent for student ${studentName}`);
        }
        
      } else {
        // Create new parent record with error checking
        try {
          const insertResult = await pool.request()
            .input('studentId', sql.Int, studentId)
            .input('parentName', sql.NVarChar, parentName || 'Parent/Guardian')
            .input('parentEmail', sql.NVarChar, parentEmail || null)
            .input('parentPhone', sql.NVarChar, parentPhone || null)
            .query(`
              INSERT INTO Parents (StudentID, Name, Email, PhoneNumber, IsPrimary, CreatedAt)
              OUTPUT INSERTED.ParentID
              VALUES (@studentId, @parentName, @parentEmail, @parentPhone, 1, GETDATE())
            `);
          
          const parentId = insertResult.recordset[0]?.ParentID;
          if (parentId) {
            parentCreated = true;
            console.log(`Row ${rowNumber} - Created parent ID ${parentId} for student ${studentName}`);
          } else {
            console.error(`Row ${rowNumber} - Failed to create parent for student ${studentName}`);
          }
        } catch (parentError) {
          console.error(`Row ${rowNumber} - Parent creation error for ${studentName}:`, parentError.message);
          // Don't throw - continue processing other students
        }
      }
    }

    // Debug logging
    console.log(`Row ${rowNumber} - ${studentName} (Code: ${studentCode || 'none'}): Student ${studentAdded ? 'added' : studentUpdated ? 'updated' : 'no change'}, Parent ${parentCreated ? 'created' : parentUpdated ? 'updated' : 'no change'}`);

    // Generate status message
    const statusParts = [];
    if (studentAdded) statusParts.push('Student created');
    if (studentUpdated) statusParts.push('Student updated');
    if (parentCreated) statusParts.push('Parent created');
    if (parentUpdated) statusParts.push('Parent updated');

    return {
      status: statusParts.join(', ') || 'No changes',
      details: 'Processed successfully',
      studentId: studentId,
      studentAdded,
      studentUpdated,
      parentCreated,
      parentUpdated,
      defaultPasswordSet: true,
      warnings: []
    };

  } catch (error) {
    console.error(`Row ${rowNumber} error:`, error);
    throw error;
  }
}

module.exports = router;