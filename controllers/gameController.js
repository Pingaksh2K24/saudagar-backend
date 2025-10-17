import pool from '../config/db.js';

const addGame = async (req, res) => {
  try {
    console.log('=== ADD GAME API CALLED ===');
    console.log('Request body:', req.body);
    console.log('User from token:', req.user);
    
    const { 
      game_name, 
      description, 
      open_time, 
      close_time, 
      open_number, 
      close_number, 
      winning_number, 
      result_number, 
      status, 
      min_bet_amount, 
      max_bet_amount, 
      result_declared_at 
    } = req.body;
    const createdBy = req.user?.id;
    
    console.log('Extracted fields:', {
      game_name, open_time, close_time, createdBy
    });
    
    if (!game_name || !open_time || !close_time) {
      console.log('Validation failed - missing required fields');
      return res.status(400).json({ message: 'game_name, open_time and close_time are required' });
    }
    
    // Convert time to timestamp format (database expects TIMESTAMP)
    let convertedOpenTime = null;
    let convertedCloseTime = null;
    
    if (open_time) {
      // Convert time to today's timestamp: 09:00 -> 2024-01-01 09:00:00
      const today = new Date().toISOString().split('T')[0]; // Get today's date
      const timeWithSeconds = open_time.length === 5 ? open_time + ':00' : open_time;
      convertedOpenTime = `${today} ${timeWithSeconds}`;
    }
    
    if (close_time) {
      const today = new Date().toISOString().split('T')[0];
      const timeWithSeconds = close_time.length === 5 ? close_time + ':00' : close_time;
      convertedCloseTime = `${today} ${timeWithSeconds}`;
    }
    
    console.log('Original times:', { open_time, close_time });
    console.log('Converted times:', { convertedOpenTime, convertedCloseTime });
    
    // Convert timestamp if provided
    let convertedTimestamp = null;
    if (result_declared_at) {
      convertedTimestamp = new Date(result_declared_at).toISOString();
      console.log('Original timestamp:', result_declared_at);
      console.log('Converted timestamp:', convertedTimestamp);
    }
    
    console.log('Starting database insert...');
    const result = await pool.query(
      `INSERT INTO games (
        game_name, description, open_time, close_time, open_number, close_number, 
        winning_number, result_number, status, min_bet_amount, max_bet_amount, 
        result_declared_at, created_at, created_by
      ) VALUES ($1, $2, $3::TIMESTAMP, $4::TIMESTAMP, $5, $6, $7, $8, $9, $10, $11, $12::TIMESTAMP, CURRENT_TIMESTAMP, $13) RETURNING *`,
      [
        game_name, description, convertedOpenTime, convertedCloseTime, open_number, close_number,
        winning_number, result_number, status || 'Active', min_bet_amount || 10, 
        max_bet_amount || 1000, convertedTimestamp, createdBy
      ]
    );
    
    console.log('Database insert successful:', result.rows[0]);
    res.status(201).json({
      message: 'Game added successfully',
      game: result.rows[0]
    });
  } catch (error) {
    console.error('=== ADD GAME ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: error.message });
  }
};

const getAllGames = async (req, res) => {
  try {
    console.log('=== GET ALL GAMES API CALLED ===');
    const result = await pool.query(`
      SELECT 
        id,
        game_name,
        description,
        open_time,
        close_time,
        open_number,
        close_number,
        winning_number,
        result_number,
        status,
        min_bet_amount,
        max_bet_amount,
        result_declared_at,
        created_at,
        created_by
      FROM games 
      WHERE deleted_by IS NULL 
      ORDER BY created_at DESC
    `);
    console.log('Games fetched count:', result.rows.length);
    res.json({
      message: 'Games fetched successfully',
      games: result.rows
    });
  } catch (error) {
    console.error('=== GET ALL GAMES ERROR ===');
    console.error('Error message:', error.message);
    res.status(500).json({ message: error.message });
  }
};

export { addGame, getAllGames };