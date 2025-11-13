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
      status, 
      min_bet_amount, 
      max_bet_amount, 
    } = req.body;
    const createdBy = req.user?.id;
    
    console.log('Extracted fields:', {
      game_name, open_time, close_time, createdBy, description,status, min_bet_amount, max_bet_amount
    });
    
    if (!game_name || !open_time || !close_time) {
      console.log('Validation failed - missing required fields');
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'game_name, open_time and close_time are required',
        errors: {
          field: 'validation'
        },
        timestamp: new Date().toISOString()
      });
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
    console.log('Starting database insert...');
    const result = await pool.query(
      `INSERT INTO games (
        game_name, description, open_time, close_time, 
        status, min_bet_amount, max_bet_amount, 
        created_by
      ) VALUES ($1, $2, $3::TIMESTAMP, $4::TIMESTAMP, $5, $6, $7, $8) RETURNING *`,
      [
        game_name, description, convertedOpenTime, convertedCloseTime,
        status || 'active', min_bet_amount || 10, 
        max_bet_amount || 1000, createdBy
      ]
    );
    
    console.log('Database insert successful:', result.rows[0]);
    res.status(200).json({
      success: true,
      statusCode: 201,
      message: 'Game added successfully',
      data: {
        game: result.rows[0]
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('=== ADD GAME ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to add game',
      errors: {
        field: 'server'
      },
      timestamp: new Date().toISOString()
    });
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
        status,
        min_bet_amount,
        max_bet_amount,
        created_at,
        created_by
      FROM games 
      WHERE deleted_by IS NULL 
      ORDER BY created_at ASC
    `);
    console.log('Games fetched count:', result.rows.length);
    
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Games fetched successfully',
      data: {
        games: result.rows,
        total_count: result.rows.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('=== GET ALL GAMES ERROR ===');
    console.error('Error message:', error.message);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch games',
      errors: {
        field: 'server'
      },
      timestamp: new Date().toISOString()
    });
  }
};

const updateGame = async (req, res) => {
  try {
    console.log('=== UPDATE GAME API CALLED ===');
    console.log('Game ID:', req.params.id);
    console.log('Request body:', req.body);
    console.log('User from token:', req.user);
    
    const { id } = req.params;
    const { 
      game_name, 
      description, 
      open_time, 
      close_time, 
      status, 
      min_bet_amount, 
      max_bet_amount 
    } = req.body;
    const updatedBy = req.user?.id;
    
    if (!game_name || !open_time || !close_time) {
      console.log('Validation failed - missing required fields');
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'game_name, open_time and close_time are required',
        errors: {
          field: 'validation'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // Convert time to timestamp format
    let convertedOpenTime = null;
    let convertedCloseTime = null;
    
    if (open_time) {
      const today = new Date().toISOString().split('T')[0];
      const timeWithSeconds = open_time.length === 5 ? open_time + ':00' : open_time;
      convertedOpenTime = `${today} ${timeWithSeconds}`;
    }
    
    if (close_time) {
      const today = new Date().toISOString().split('T')[0];
      const timeWithSeconds = close_time.length === 5 ? close_time + ':00' : close_time;
      convertedCloseTime = `${today} ${timeWithSeconds}`;
    }
    
    console.log('Starting database update...');
    const result = await pool.query(
      `UPDATE games SET 
        game_name = $1, 
        description = $2, 
        open_time = $3::TIMESTAMP, 
        close_time = $4::TIMESTAMP, 
        status = $5, 
        min_bet_amount = $6, 
        max_bet_amount = $7, 
        updated_at = CURRENT_TIMESTAMP, 
        updated_by = $8 
      WHERE id = $9 AND deleted_by IS NULL 
      RETURNING *`,
      [
        game_name, description, convertedOpenTime, convertedCloseTime,
        status || 'active', min_bet_amount || 10, max_bet_amount || 1000, 
        updatedBy, id
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(200).json({
        success: false,
        statusCode: 404,
        message: 'Game not found or already deleted',
        errors: {
          field: 'game_id'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('Database update successful:', result.rows[0]);
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Game updated successfully',
      data: {
        game: result.rows[0]
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('=== UPDATE GAME ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to update game',
      errors: {
        field: 'server'
      },
      timestamp: new Date().toISOString()
    });
  }
};

const deleteGame = async (req, res) => {
  try {
    console.log('=== DELETE GAME API CALLED ===');
    console.log('Game ID:', req.params.id);
    console.log('User from token:', req.user);
    
    const { id } = req.params;
    const deletedBy = req.user?.id;
    
    if (!deletedBy) {
      return res.status(200).json({
        success: false,
        statusCode: 401,
        message: 'Authentication required',
        errors: {
          field: 'authentication'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('Starting database delete...');
    const result = await pool.query(
      'UPDATE games SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1 WHERE id = $2 AND deleted_by IS NULL RETURNING id', 
      [deletedBy, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(200).json({
        success: false,
        statusCode: 404,
        message: 'Game not found or already deleted',
        errors: {
          field: 'game_id'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('Game deleted successfully:', result.rows[0].id);
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Game deleted successfully',
      data: {
        deleted_game_id: result.rows[0].id
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('=== DELETE GAME ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to delete game',
      errors: {
        field: 'server'
      },
      timestamp: new Date().toISOString()
    });
  }
};

const getGameById = async (req, res) => {
  try {
    console.log('=== GET GAME BY ID API CALLED ===');
    console.log('Game ID:', req.params.id);
    
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        id,
        game_name,
        description,
        open_time,
        close_time,
        status,
        min_bet_amount,
        max_bet_amount
      FROM games 
      WHERE id = $1 AND deleted_by IS NULL
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(200).json({
        success: false,
        statusCode: 404,
        message: 'Game not found',
        errors: {
          field: 'game_id'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('Game details fetched:', result.rows[0]);
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Game details fetched successfully',
      data: {
        game: result.rows[0]
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('=== GET GAME BY ID ERROR ===');
    console.error('Error message:', error.message);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch game details',
      errors: {
        field: 'server'
      },
      timestamp: new Date().toISOString()
    });
  }
};

export { addGame, getAllGames, updateGame, deleteGame, getGameById };