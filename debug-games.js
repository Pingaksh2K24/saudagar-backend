import pool from './config/db.js';

const debugGames = async () => {
  try {
    console.log('=== DEBUGGING GAMES TABLE ===');
    
    // Check if games table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'games'
      );
    `);
    console.log('Games table exists:', tableExists.rows[0].exists);
    
    if (tableExists.rows[0].exists) {
      // Check table structure
      const tableStructure = await pool.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'games'
        ORDER BY ordinal_position;
      `);
      console.log('Table structure:', tableStructure.rows);
      
      // Count total records
      const count = await pool.query('SELECT COUNT(*) FROM games');
      console.log('Total games count:', count.rows[0].count);
      
      // Check deleted records
      const deletedCount = await pool.query('SELECT COUNT(*) FROM games WHERE deleted_by IS NOT NULL');
      console.log('Deleted games count:', deletedCount.rows[0].count);
      
      // Get all games
      const allGames = await pool.query('SELECT * FROM games LIMIT 5');
      console.log('Sample games:', allGames.rows);
    }
    
  } catch (error) {
    console.error('Debug error:', error.message);
  } finally {
    process.exit(0);
  }
};

debugGames();