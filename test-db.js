import pool from './config/db.js';
import dotenv from 'dotenv';
dotenv.config();

const testConnection = async () => {
  try {
    console.log('🔍 Testing database connection...');
    
    // Show connection config
    console.log('🔧 Connection Config:');
    console.log('Host:', process.env.DB_HOST);
    console.log('Port:', process.env.DB_PORT);
    console.log('Database:', process.env.DB_NAME);
    console.log('Username:', process.env.DB_USER);
    console.log('Database URL:', process.env.DATABASE_URL || 'Not set');
    console.log('');
    
    const result = await pool.query(`
      SELECT 
        current_database() as database_name,
        current_user as username,
        inet_server_addr() as host,
        inet_server_port() as port,
        version() as postgres_version,
        now() as current_time
    `);
    
    console.log('✅ Database Connection Successful!');
    console.log('📊 Actual Connection Details:');
    console.log('Database:', result.rows[0].database_name);
    console.log('Username:', result.rows[0].username);
    console.log('Host:', result.rows[0].host || 'localhost');
    console.log('Port:', result.rows[0].port || '5432');
    console.log('Time:', result.rows[0].current_time);
    console.log('Version:', result.rows[0].postgres_version.split(' ')[0] + ' ' + result.rows[0].postgres_version.split(' ')[1]);
    
    // Test tables
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('\n📋 Available Tables:');
    tables.rows.forEach(table => {
      console.log('- ' + table.table_name);
    });
    
    // Test game_results count
    console.log('\n🎮 Game Results Count:');
    const countResult = await pool.query('SELECT COUNT(*) as total_count FROM game_results');
    console.log(`Total records in game_results: ${countResult.rows[0].total_count}`);
    
    // Test game_results query
    console.log('\n📋 Latest Game Results:');
    const gameResults = await pool.query('SELECT * FROM game_results ORDER BY created_at DESC LIMIT 5');
    
    if (gameResults.rows.length > 0) {
      console.log(`Showing latest ${gameResults.rows.length} records:`);
      gameResults.rows.forEach((row, index) => {
        console.log(`${index + 1}. ID: ${row.id}, Game ID: ${row.game_id}, Date: ${row.result_date}`);
      });
    } else {
      console.log('No records found in game_results table');
    }
    
  } catch (error) {
    console.log('❌ Database Connection Failed!');
    console.log('Error:', error.message);
    console.log('Code:', error.code);
  }
  
  process.exit();
};

testConnection();