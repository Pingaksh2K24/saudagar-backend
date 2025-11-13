import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.body.folder || 'general';
    const uploadPath = `uploads/${folder}/`;

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images and documents allowed'));
    }
  }
});

const registerUser = async (req, res) => {
  try {
    const { full_name, mobile_number, role, email, password, created_by, village, address } = req.body;

    if (!full_name || !mobile_number || !role || !email || !password || !created_by) {
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'Full name, mobile number, role, email, password and created_by are required',
        errors: {
          field: 'validation'
        },
        timestamp: new Date().toISOString()
      });
    }

    const userExists = await pool.query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
    if (userExists.rows.length > 0) {
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'User already exists',
        errors: {
          field: 'email'
        },
        timestamp: new Date().toISOString()
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await pool.query(
      'INSERT INTO users (full_name, mobile_number, role, email, password_hash, village, address, created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8) RETURNING id, full_name, mobile_number, role, email, village, address, created_at, created_by',
      [full_name, mobile_number, role, email, hashedPassword, village, address, created_by]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id }, 'your-secret-key', { expiresIn: '30d' });

    res.status(200).json({
      success: true,
      statusCode: 201,
      message: 'User created successfully',
      data: {
        user: {
          id: user.id,
          full_name: user.full_name,
          mobile_number: user.mobile_number,
          role: user.role,
          email: user.email,
          village: user.village,
          address: user.address,
          created_at: user.created_at,
          created_by: user.created_by
        },
        token
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('REGISTER ERROR:', error.message);
    console.error('REGISTER STACK:', error.stack);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Internal server error',
      errors: {
        field: 'server'
      },
      timestamp: new Date().toISOString()
    });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password, platform } = req.body;

    if (!email || !password || !platform) {
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'Email, password and platform are required',
        errors: {
          field: 'validation'
        },
        timestamp: new Date().toISOString()
      });
    }

    const result = await pool.query('SELECT id, full_name, email, mobile_number, password_hash, mobile_number, role FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: false,
        statusCode: 401,
        message: 'Invalid email or password',
        errors: {
          field: 'credentials'
        },
        timestamp: new Date().toISOString()
      });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(200).json({
        success: false,
        statusCode: 401,
        message: 'Invalid email or password',
        errors: {
          field: 'credentials'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check platform access for agent role
    if (platform === 'web' && user.role === 'agent') {
      return res.status(200).json({
        success: false,
        statusCode: 403,
        message: 'You are not allowed to login on web platform',
        errors: {
          field: 'platform_access'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Check platform access for mobile - only agents allowed
    if (platform === 'android' && user.role !== 'agent') {
      return res.status(200).json({
        success: false,
        statusCode: 403,
        message: 'You are not allowed to login on mobile platform',
        errors: {
          field: 'platform_access'
        },
        timestamp: new Date().toISOString()
      });
    }

    const token = jwt.sign({ id: user.id }, 'your-secret-key', { expiresIn: '30d' });

    res.json({
      success: true,
      statusCode: 200,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.full_name,
          email: user.email,
          mobile_number: user.mobile_number,
          role: user.role,
          isActive: true
        },
        token: {
          accessToken: token,
          expiresIn: 2592000  // 30 days in seconds
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Internal server error',
      errors: {
        field: 'server'
      },
      timestamp: new Date().toISOString()
    });
  }
};

const getAllUserList = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, 
        full_name, 
        email, 
        mobile_number, 
        role,
        village,
        address,
        COALESCE(status, 'Active') as status,
        created_at
      FROM users 
      WHERE deleted_by IS NULL
      ORDER BY id ASC
    `);
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Users fetched successfully',
      data: {
        users: result.rows
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Internal server error',
      errors: {
        field: 'server'
      },
      timestamp: new Date().toISOString()
    });
  }
};

const getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, full_name, username, dob, gender_id, address, email, is_email_verified, phone, alternate_phone, is_phone_verified, role_id, department_id, status_id, profile_image, is_active, account_locked FROM users WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(200).json({
        success: false,
        statusCode: 404,
        message: 'User not found',
        errors: {
          field: 'user_id'
        },
        timestamp: new Date().toISOString()
      });
    }
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'User details fetched successfully',
      data: {
        user: result.rows[0]
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Internal server error',
      errors: {
        field: 'server'
      },
      timestamp: new Date().toISOString()
    });
  }
};

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    res.json({
      message: 'File uploaded successfully',
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      folder: req.body.folder || 'general'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAllDropdowns = async (req, res) => {
  try {
    const rolesQuery = pool.query('SELECT id, name, is_active FROM roles ORDER BY name');
    const departmentsQuery = pool.query('SELECT id, name, is_active FROM departments ORDER BY name');
    const statusQuery = pool.query('SELECT id, name, is_active FROM status ORDER BY name');

    const [roles, departments, status] = await Promise.all([
      rolesQuery,
      departmentsQuery,
      statusQuery
    ]);

    res.json({
      roles: roles.rows,
      departments: departments.rows,
      status: status.rows
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedBy = req.user?.id || req.body.deleted_by;

    if (!deletedBy) {
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'deleted_by is required',
        errors: {
          field: 'validation'
        },
        timestamp: new Date().toISOString()
      });
    }

    const result = await pool.query(
      'UPDATE users SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1 WHERE id = $2 AND deleted_by IS NULL RETURNING id',
      [deletedBy, id]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: false,
        statusCode: 404,
        message: 'User not found or already deleted',
        errors: {
          field: 'user_id'
        },
        timestamp: new Date().toISOString()
      });
    }

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'User deleted successfully',
      data: {
        id: result.rows[0].id
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Internal server error',
      errors: {
        field: 'server'
      },
      timestamp: new Date().toISOString()
    });
  }
};

const logoutUser = async (req, res) => {
  try {
    res.json({ message: 'Logout successful' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, mobile_number, role, email, status, village, address } = req.body;
    
    // Validation
    if (!full_name || !mobile_number || !role || !email) {
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'Full name, mobile number, role and email are required',
        errors: {
          field: 'validation'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Update user
    const result = await pool.query(
      `UPDATE users SET 
        full_name = $1, 
        mobile_number = $2, 
        role = $3, 
        email = $4, 
        status = $5, 
        village = $6, 
        address = $7, 
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND deleted_by IS NULL 
      RETURNING id, full_name, mobile_number, role, email, status, village, address`,
      [full_name, mobile_number, role, email, status || 'active', village, address, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(200).json({
        success: false,
        statusCode: 404,
        message: 'User not found',
        errors: {
          field: 'user_id'
        },
        timestamp: new Date().toISOString()
      });
    }

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'User updated successfully',
      data: {
        user: result.rows[0]
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('UPDATE USER ERROR:', error);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to update user',
      errors: {
        field: 'server'
      },
      timestamp: new Date().toISOString()
    });
  }
};

const getVillageList = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        full_name as user_name,
        village
      FROM users 
      WHERE deleted_by IS NULL AND village IS NOT NULL
      ORDER BY village ASC, full_name ASC
    `);
    
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Village list fetched successfully',
      data: {
        users: result.rows
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('GET VILLAGE LIST ERROR:', error.message);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch village list',
      errors: {
        field: 'server'
      },
      timestamp: new Date().toISOString()
    });
  }
};

export { registerUser, loginUser, logoutUser, getAllUserList, getUserDetails, uploadFile, upload, getAllDropdowns, deleteUser, updateUser, getVillageList };