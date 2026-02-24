import pool from '../config/db.js';

class ActivityLogService {
  static async logActivity(data) {
    const { userId, activityType, description, ipAddress, deviceInfo, latitude, longitude, platform } = data;
    
    try {
      let displayName = activityType; // default fallback
      
      // Try to get display_name from activity_types table
      try {
        const activityTypeResult = await pool.query(
          'SELECT display_name FROM activity_types WHERE type_code = $1 OR activity_type = $1 OR name = $1',
          [activityType]
        );
        
        if (activityTypeResult.rows.length > 0) {
          displayName = activityTypeResult.rows[0].display_name;
        }
      } catch (tableError) {
        // Silently use fallback if activity_types table doesn't exist
      }
      
      // Truncate fields to prevent VARCHAR constraint errors
      const truncatedData = {
        activityType: (displayName || activityType).toString().substring(0, 29),
        description: (description || '').toString().substring(0, 254),
        ipAddress: (ipAddress || '').toString().substring(0, 44),
        deviceInfo: (deviceInfo || '').toString().substring(0, 254),
        platform: (platform || '').toString().substring(0, 29)
      };
      
      const query = userId 
        ? `INSERT INTO user_activity_logs 
           (user_id, activity_type, activity_description, ip_address, device_info, latitude, longitude, platform, created_at, created_by) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $1)`
        : `INSERT INTO user_activity_logs 
           (user_id, activity_type, activity_description, ip_address, device_info, latitude, longitude, platform, created_at) 
           VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`;
      
      const params = userId 
        ? [userId, truncatedData.activityType, truncatedData.description, truncatedData.ipAddress, truncatedData.deviceInfo, latitude, longitude, truncatedData.platform]
        : [truncatedData.activityType, truncatedData.description, truncatedData.ipAddress, truncatedData.deviceInfo, latitude, longitude, truncatedData.platform];
      
      await pool.query(query, params);
    } catch (error) {
      console.error('Activity log error:', error.message);
      // Log this error to error_logs table
      try {
        await pool.query(
          `INSERT INTO error_logs (error_message, error_stack, created_at) VALUES ($1, $2, CURRENT_TIMESTAMP)`,
          [error.message?.substring(0, 500), error.stack?.substring(0, 2000)]
        );
      } catch (logError) {
        console.error('Failed to log activity error:', logError.message);
      }
    }
  }
}

export default ActivityLogService;
