import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import AuthService from '../services/AuthService.js';
import ActivityLogService from '../services/ActivityLogService.js';
import EmailNotificationService from '../services/EmailNotificationService.js';
import ErrorLogService from '../services/ErrorLogService.js';
import ResponseFormatter from '../utils/responseFormatter.js';
import APP_SETTINGS from '../config/appSettings.js';

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

    // Validation
    if (!email || !password || !platform) {
      return ResponseFormatter.error(res, 400, 'Email, password and platform are required', 'validation');
    }

    // Extract request info
    const { ipAddress, deviceInfo, latitude, longitude } = AuthService.extractRequestInfo(req);
    const logData = { ipAddress, deviceInfo, latitude, longitude, platform };

    // Find user
    const user = await AuthService.findUserByEmail(email);
    
    if (!user) {
      await ActivityLogService.logActivity({
        ...logData,
        userId: null,
        activityType: 'LOGIN_FAILED',
        description: `Login failed: Invalid email ${email}`
      });
      
      await EmailNotificationService.sendLoginNotification('failed', {
        email,
        reason: 'Invalid email',
        ...logData
      });
      
      return ResponseFormatter.error(res, 401, APP_SETTINGS.MESSAGES.LOGIN_FAILED, 'credentials');
    }

    // Log login attempt
    await ActivityLogService.logActivity({
      ...logData,
      userId: user.id,
      activityType: 'LOGIN',
      description: 'Login attempt'
    });

    // Check user status
    if (user.status && user.status.toLowerCase() === 'inactive') {
      await ActivityLogService.logActivity({
        ...logData,
        userId: user.id,
        activityType: 'LOGIN_FAILED',
        description: 'Login failed: Account inactive'
      });
      
      await EmailNotificationService.sendLoginNotification('failed', {
        userName: user.full_name,
        email,
        reason: 'Account inactive',
        ...logData
      });
      
      return ResponseFormatter.error(res, 403, APP_SETTINGS.MESSAGES.ACCOUNT_INACTIVE, 'account_status');
    }

    // Validate password
    const isValidPassword = await AuthService.validatePassword(password, user.password_hash);
    
    if (!isValidPassword) {
      await ActivityLogService.logActivity({
        ...logData,
        userId: user.id,
        activityType: 'LOGIN_FAILED',
        description: 'Login failed: Invalid password'
      });
      
      await EmailNotificationService.sendLoginNotification('failed', {
        userName: user.full_name,
        email,
        reason: 'Invalid password',
        ...logData
      });
      
      return ResponseFormatter.error(res, 401, APP_SETTINGS.MESSAGES.LOGIN_FAILED, 'credentials');
    }

    // Validate platform access
    const platformValidation = AuthService.validatePlatformAccess(user.role, platform);
    
    if (!platformValidation.valid) {
      await ActivityLogService.logActivity({
        ...logData,
        userId: user.id,
        activityType: 'LOGIN_FAILED',
        description: `Login failed: ${platformValidation.reason}`
      });
      
      await EmailNotificationService.sendLoginNotification('failed', {
        userName: user.full_name,
        email,
        reason: platformValidation.reason,
        ...logData
      });
      
      return ResponseFormatter.error(res, 403, `You are not allowed to login on ${platform} platform`, 'platform_access');
    }

    // Generate token
    const token = AuthService.generateToken(user.id);

    // Log success
    await ActivityLogService.logActivity({
      ...logData,
      userId: user.id,
      activityType: 'LOGIN_SUCCESS',
      description: 'User logged in successfully'
    });

    // Save refresh token
    await AuthService.saveRefreshToken(user.id, token);

    // Send success notification
    await EmailNotificationService.sendLoginNotification('success', {
      userName: user.full_name,
      email,
      role: user.role,
      ...logData
    });

    // Return response
    return ResponseFormatter.success(res, 200, APP_SETTINGS.MESSAGES.LOGIN_SUCCESS, {
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
        expiresIn: APP_SETTINGS.JWT_EXPIRES_IN_SECONDS
      }
    });
  } catch (error) {
    console.error('LOGIN ERROR:', error);
    await ErrorLogService.logError(error, req);
    return ResponseFormatter.error(res, 500, APP_SETTINGS.MESSAGES.INTERNAL_ERROR, 'server');
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
        commission_rate,
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
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return ResponseFormatter.error(res, 400, 'Token not provided', 'validation');
    }

    // Revoke token in refresh_tokens table
    const result = await pool.query(
      'UPDATE refresh_tokens SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP, revoked_reason = $1 WHERE token = $2 RETURNING user_id',
      ['User logged out', token]
    );
    console.log('Logout token revocation result:', result);

    if (result.rows.length > 0) {
      // Log logout activity
      const { ipAddress, deviceInfo, latitude, longitude } = AuthService.extractRequestInfo(req);
      const platform = req.body.platform || 'unknown';
      
      await ActivityLogService.logActivity({
        userId: result.rows[0].user_id,
        activityType: 'LOGOUT',
        description: 'User logged out successfully',
        ipAddress,
        deviceInfo,
        latitude,
        longitude,
        platform
      });
    }

    return ResponseFormatter.success(res, 200, APP_SETTINGS.MESSAGES.LOGOUT_SUCCESS);
  } catch (error) {
    console.error('LOGOUT ERROR:', error);
    await ErrorLogService.logError(error, req);
    return ResponseFormatter.error(res, 500, APP_SETTINGS.MESSAGES.INTERNAL_ERROR, 'server');
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, mobile_number, role, email, status, village, address, commission_rate } = req.body;
    
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
        commission_rate = $8,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9 AND deleted_by IS NULL 
      RETURNING id, full_name, mobile_number, role, email, status, village, address, commission_rate`,
      [full_name, mobile_number, role, email, status || 'active', village, address, commission_rate, id]
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

const updateUserStatus = async (req, res) => {
  try {
    const { user_id, status } = req.body;

    if (!user_id || !status) {
      return ResponseFormatter.error(res, 400, 'User ID and status are required', 'validation');
    }

    if (!['active', 'inactive'].includes(status.toLowerCase())) {
      return ResponseFormatter.error(res, 400, 'Status must be active or inactive', 'validation');
    }

    const result = await pool.query(
      'UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND deleted_by IS NULL RETURNING id, full_name, email, status',
      [status.toLowerCase(), user_id]
    );

    if (result.rows.length === 0) {
      return ResponseFormatter.error(res, 404, 'User not found', 'user_id');
    }

    // If user is being set to inactive, revoke all active tokens
    if (status.toLowerCase() === 'inactive') {
      await pool.query(
        'UPDATE refresh_tokens SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP, revoked_reason = $1 WHERE user_id = $2 AND is_revoked = false',
        ['Account deactivated', user_id]
      );
    }

    // Log activity
    const { ipAddress, deviceInfo, latitude, longitude } = AuthService.extractRequestInfo(req);
    await ActivityLogService.logActivity({
      userId: req.user.id,
      activityType: 'USER_STATUS_UPDATE',
      description: `User status updated to ${status} for user ID: ${user_id}`,
      ipAddress,
      deviceInfo,
      latitude,
      longitude,
      platform: 'web'
    });

    return ResponseFormatter.success(res, 200, 'User status updated successfully', {
      user: result.rows[0]
    });
  } catch (error) {
    console.error('UPDATE USER STATUS ERROR:', error);
    await ErrorLogService.logError(error, req, req.user?.id);
    return ResponseFormatter.error(res, 500, APP_SETTINGS.MESSAGES.INTERNAL_ERROR, 'server');
  }
};

const getUserActivityLog = async (req, res) => {
  try {
    const { pagination = {}, filters = {} } = req.body;
    const { page = 1, limit = 20 } = pagination;
    const { activity_type_id, date } = filters;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT COUNT(*) as total FROM user_activity_logs ual LEFT JOIN activity_types at ON ual.activity_type = at.display_name WHERE 1=1';
    let params = [];
    let paramCount = 0;
    
    // Add filters to count query
    if (activity_type_id) {
      paramCount++;
      query += ` AND ual.activity_type = $${paramCount}`;
      params.push(activity_type_id);
    }
    
    if (date) {
      paramCount++;
      query += ` AND DATE(ual.created_at) = $${paramCount}`;
      params.push(date);
    }
    
    const countResult = await pool.query(query, params);
    const total = parseInt(countResult.rows[0].total);
    
    // Build main query - get color_code from activity_types table
    let mainQuery = `SELECT 
      ual.id, ual.user_id, ual.activity_type, ual.activity_description, 
      ual.ip_address, ual.device_info, ual.platform, 
      ual.created_at, ual.created_by,
      at.display_name as display_name,
      COALESCE(at.color_code, '#6c757d') as color_code
    FROM user_activity_logs ual
    LEFT JOIN activity_types at ON ual.activity_type = at.name
    WHERE 1=1`;
    
    let mainParams = [];
    let mainParamCount = 0;
    
    // Add same filters to main query
    if (activity_type_id) {
      mainParamCount++;
      mainQuery += ` AND ual.activity_type = $${mainParamCount}`;
      mainParams.push(activity_type_id);
    }
    
    if (date) {
      mainParamCount++;
      mainQuery += ` AND DATE(ual.created_at) = $${mainParamCount}`;
      mainParams.push(date);
    }
    
    // Add pagination
    mainParamCount++;
    mainQuery += ` ORDER BY ual.created_at DESC LIMIT $${mainParamCount}`;
    mainParams.push(limit);
    
    mainParamCount++;
    mainQuery += ` OFFSET $${mainParamCount}`;
    mainParams.push(offset);
    
    const result = await pool.query(mainQuery, mainParams);
    
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'User activity logs fetched successfully',
      data: {
        logs: result.rows,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total: total,
          total_pages: Math.ceil(total / limit),
          has_next: page * limit < total,
          has_prev: page > 1
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('GET USER ACTIVITY LOG ERROR:', error.message);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch user activity logs',
      errors: { field: 'server' },
      timestamp: new Date().toISOString()
    });
  }
};

export { registerUser, loginUser, logoutUser, getAllUserList, getUserDetails, uploadFile, upload, getAllDropdowns, deleteUser, updateUser, getVillageList, updateUserStatus, getUserActivityLog };