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
    const { full_name, mobile_number, role, email, password, created_by } = req.body;
    
    if (!full_name || !mobile_number || !role || !email || !password || !created_by) {
      return res.status(400).json({ message: 'Full name, mobile number, role, email, password and created_by are required' });
    }
    
    const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const result = await pool.query(
      'INSERT INTO users (full_name, mobile_number, role, email, password_hash, created_at, created_by) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6) RETURNING id, full_name, mobile_number, role, email, created_at, created_by',
      [full_name, mobile_number, role, email, hashedPassword, created_by]
    );
    
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id }, 'your-secret-key', { expiresIn: '30d' });
    
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        full_name: user.full_name,
        mobile_number: user.mobile_number,
        role: user.role,
        email: user.email,
        created_at: user.created_at,
        created_by: user.created_by
      },
      token
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    const result = await pool.query('SELECT id, full_name, email, password_hash, mobile_number, role FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    const token = jwt.sign({ id: user.id }, 'your-secret-key', { expiresIn: '30d' });
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        mobile_number: user.mobile_number,
        role: user.role
      },
      token
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
        COALESCE(status, 'Active') as status,
        created_at
      FROM users 
      WHERE deleted_by IS NULL
      ORDER BY id ASC
    `);
    res.json({
      message: 'Users fetched successfully',
      users: result.rows
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      return res.status(400).json({ message: 'deleted_by is required' });
    }
    
    const result = await pool.query(
      'UPDATE users SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1 WHERE id = $2 AND deleted_by IS NULL RETURNING id', 
      [deletedBy, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found or already deleted' });
    }
    
    res.json({ message: 'User deleted successfully', id: result.rows[0].id });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: error.message });
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
    const { full_name, mobile_number, role, email, status } = req.body;
    
    if (!full_name || !mobile_number || !role || !email || !status) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    const result = await pool.query(
      'UPDATE users SET full_name = $1, mobile_number = $2, role = $3, email = $4, status = $5, updated_at = CURRENT_TIMESTAMP, updated_by = $6 WHERE id = $7 RETURNING id, full_name, mobile_number, role, email, status, updated_at, updated_by',
      [full_name, mobile_number, role, email, status, req.user.id, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      message: 'User updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { registerUser, loginUser, logoutUser, getAllUserList, getUserDetails, uploadFile, upload, getAllDropdowns, deleteUser, updateUser };