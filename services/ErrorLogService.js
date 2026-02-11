import pool from '../config/db.js';

class ErrorLogService {
  static async logError(error, req, userId = null) {
    try {
      const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || 
                        req.headers['x-real-ip'] || 
                        req.connection?.remoteAddress || 
                        req.ip || 'Unknown';

      await pool.query(
        `INSERT INTO error_logs 
        (user_id, error_message, error_stack, request_url, request_method, request_body, 
         ip_address, user_agent, created_at) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
        [
          userId,
          (error.message || 'Unknown error').substring(0, 500),
          (error.stack || '').substring(0, 2000),
          (req.url || req.originalUrl || '').substring(0, 255),
          (req.method || '').substring(0, 10),
          JSON.stringify(req.body || {}).substring(0, 1000),
          ipAddress.substring(0, 45),
          (req.headers['user-agent'] || 'Unknown').substring(0, 255)
        ]
      );
    } catch (logError) {
      console.error('Error logging failed:', logError.message);
    }
  }
}

export default ErrorLogService;
