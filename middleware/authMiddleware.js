import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import APP_SETTINGS from '../config/appSettings.js';

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, APP_SETTINGS.JWT_SECRET);
      
      // Check if user exists
      const userResult = await pool.query(
        'SELECT id, full_name, email, role FROM users WHERE id = $1 AND deleted_by IS NULL', 
        [decoded.id]
      );
      
      if (userResult.rows.length === 0) {
        return res.status(401).json({ 
          success: false,
          statusCode: 401,
          message: 'User not found',
          errors: { field: 'authentication' },
          timestamp: new Date().toISOString()
        });
      }
      
      // Check if token is revoked in refresh_tokens table
      const tokenResult = await pool.query(
        'SELECT is_revoked, expires_at FROM refresh_tokens WHERE token = $1 AND user_id = $2',
        [token, decoded.id]
      );
      
      if (tokenResult.rows.length === 0) {
        return res.status(401).json({ 
          success: false,
          statusCode: 401,
          message: 'Token not found. Please login again',
          errors: { field: 'authentication' },
          requireLogin: true,
          timestamp: new Date().toISOString()
        });
      }
      
      const tokenData = tokenResult.rows[0];
      
      // Check if token is revoked
      if (tokenData.is_revoked) {
        return res.status(401).json({ 
          success: false,
          statusCode: 401,
          message: 'Token has been revoked. Please login again',
          errors: { field: 'authentication' },
          requireLogin: true,
          timestamp: new Date().toISOString()
        });
      }
      
      // Check if token is expired
      if (new Date(tokenData.expires_at) < new Date()) {
        return res.status(401).json({ 
          success: false,
          statusCode: 401,
          message: 'Token has expired. Please login again',
          errors: { field: 'authentication' },
          requireLogin: true,
          timestamp: new Date().toISOString()
        });
      }
      
      req.user = userResult.rows[0];
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false,
          statusCode: 401,
          message: 'Token has expired. Please login again',
          errors: { field: 'authentication' },
          requireLogin: true,
          timestamp: new Date().toISOString()
        });
      }
      
      return res.status(401).json({ 
        success: false,
        statusCode: 401,
        message: 'Invalid token. Please login again',
        errors: { field: 'authentication' },
        requireLogin: true,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    return res.status(401).json({ 
      success: false,
      statusCode: 401,
      message: 'No token provided. Please login',
      errors: { field: 'authentication' },
      requireLogin: true,
      timestamp: new Date().toISOString()
    });
  }
};

export { protect };