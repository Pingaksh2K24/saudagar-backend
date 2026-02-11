import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import APP_SETTINGS from '../config/appSettings.js';

class AuthService {
  static async findUserByEmail(email) {
    const result = await pool.query(
      'SELECT id, full_name, email, mobile_number, password_hash, role, status FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  static async validatePassword(password, passwordHash) {
    return await bcrypt.compare(password, passwordHash);
  }

  static generateToken(userId) {
    return jwt.sign({ id: userId }, APP_SETTINGS.JWT_SECRET, { 
      expiresIn: APP_SETTINGS.JWT_EXPIRES_IN 
    });
  }

  static async saveRefreshToken(userId, token) {
    await pool.query(
      `INSERT INTO refresh_tokens 
      (user_id, token, expires_at, is_revoked, created_at) 
      VALUES ($1, $2, NOW() + INTERVAL '30 days', false, CURRENT_TIMESTAMP)`,
      [userId, token]
    );
  }

  static validatePlatformAccess(userRole, platform) {
    if (platform === 'web' && userRole === 'agent') {
      return { valid: false, reason: 'Web platform not allowed for agent' };
    }
    if (platform === 'android' && userRole !== 'agent') {
      return { valid: false, reason: 'Mobile platform not allowed for non-agent' };
    }
    return { valid: true };
  }

  static extractRequestInfo(req) {
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || 
                      req.headers['x-real-ip'] || 
                      req.connection.remoteAddress || 
                      req.ip;
    
    const deviceInfo = req.body.device_info || req.headers['user-agent'] || 'Unknown';
    const latitude = req.body.location?.latitude || null;
    const longitude = req.body.location?.longitude || null;

    return { ipAddress, deviceInfo, latitude, longitude };
  }
}

export default AuthService;
