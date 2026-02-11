import pool from './config/db.js';

async function testActivityLog() {
  try {
    console.log('Testing activity log insert...');
    
    const result = await pool.query(
      `INSERT INTO user_activity_logs 
      (user_id, activity_type, activity_description, ip_address, device_info, platform, created_at) 
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) RETURNING *`,
      [1, 'LOGIN_FAILED', 'Test failed login', '127.0.0.1', 'Test Device', 'web']
    );
    
    console.log('✅ Activity log inserted successfully:', result.rows[0]);
    
    // Check if entry exists
    const check = await pool.query('SELECT * FROM user_activity_logs ORDER BY id DESC LIMIT 1');
    console.log('Latest entry:', check.rows[0]);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Error details:', error);
  } finally {
    process.exit();
  }
}

testActivityLog();
