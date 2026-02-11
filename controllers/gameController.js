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

const getAgentKhatabookDetails = async (req, res) => {
  try {
    const { date, game_id } = req.body;
    console.log('=== GET AGENT KHATABOOK DETAILS API CALLED ===');
    console.log('Request body:', req.body);
    // Validation
    if (!date || !game_id) {
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'date and game_id are required',
        errors: {
          field: 'validation',
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Get all agents
    const agentsQuery = `
      SELECT 
        id as agent_id,
        full_name,
        commission_rate
      FROM users 
      WHERE role = 'agent' AND deleted_by IS NULL AND status = 'active'
      ORDER BY full_name ASC
    `;
    
    const agentsResult = await pool.query(agentsQuery);
    
    if (agentsResult.rows.length === 0) {
      return res.status(200).json({
        success: false,
        statusCode: 404,
        message: 'No active agents found',
        errors: {
          field: 'agents',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const agentDetails = [];

    // Process each agent
    for (const agent of agentsResult.rows) {
      // Get collection details for the specific date and game
      const collectionQuery = `
        SELECT 
          COALESCE(SUM(CASE WHEN b.session_type = 'Open' THEN b.amount ELSE 0 END), 0) as open_collection,
          COALESCE(SUM(CASE WHEN b.session_type = 'Close' THEN b.amount ELSE 0 END), 0) as close_collection,
          COALESCE(SUM(b.amount), 0) as total_collection,
          COALESCE(SUM(CASE WHEN b.status = 'won' THEN b.total_payout ELSE 0 END), 0) as total_winning_amount
        FROM bids b
        JOIN receipts r ON b.receipt_id = r.id
        WHERE b.bid_date = $1 
          AND b.game_id = $2 
          AND r.agent_id = $3
      `;

      const collectionResult = await pool.query(collectionQuery, [date, game_id, agent.agent_id]);
      const collection = collectionResult.rows[0];

      // Get agent khatabook details for requested date
      const khatabookQuery = `
        SELECT 
          COALESCE(debit, 0) as debit,
          COALESCE(credit, 0) as credit
        FROM agent_khatabook 
        WHERE agent_id = $1 AND date = $2 AND game_id = $3
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const khatabookResult = await pool.query(khatabookQuery, [agent.agent_id, date, game_id]);
      const khatabook = khatabookResult.rows[0] || { debit: 0, credit: 0 };

      // Get previous date current_balance
      const previousBalanceQuery = `
        SELECT 
          COALESCE(current_balance, 0) as current_balance
        FROM agent_khatabook 
        WHERE agent_id = $1 AND date < $2 AND game_id = $3
        ORDER BY date DESC, created_at DESC
        LIMIT 1
      `;

      const previousBalanceResult = await pool.query(previousBalanceQuery, [agent.agent_id, date, game_id]);
      const previousBalance = previousBalanceResult.rows[0] || { current_balance: 0 };

      // Calculate commission and final amounts
      const openCollection = parseFloat(collection.open_collection);
      const closeCollection = parseFloat(collection.close_collection);
      const totalCollection = parseFloat(collection.total_collection);
      const totalWinningAmount = parseFloat(collection.total_winning_amount);
      const commissionRate = parseFloat(agent.commission_rate) || 0;
      
      const agentCommission = Math.round((totalCollection * commissionRate) / 100);
      const netAmount = totalCollection - totalWinningAmount - agentCommission;
      
      let toGive = 0;
      let toTake = 0;
      let outstandingAmount = 0;
      const prevBalance = parseFloat(previousBalance.current_balance);
      const creditAmount = parseFloat(khatabook.credit);
      
      if (netAmount >= 0) {
        toTake = netAmount;
        outstandingAmount = prevBalance + toTake - creditAmount;
      } else {
        toGive = Math.abs(netAmount);
        outstandingAmount = prevBalance - toGive - creditAmount;
      }

      agentDetails.push({
        agent_id: parseInt(agent.agent_id),
        full_name: agent.full_name,
        commission_rate: commissionRate,
        open_collection: openCollection,
        close_collection: closeCollection,
        total_collection: totalCollection,
        agent_commission: agentCommission,
        total_winning_amount: totalWinningAmount,
        to_give: parseFloat(toGive.toFixed(2)),
        to_take: parseFloat(toTake.toFixed(2)),
        debit: parseFloat(khatabook.debit),
        credit: creditAmount,
        current_balance: prevBalance,
        outstanding_amount: parseFloat(outstandingAmount.toFixed(2)),
      });
    }

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Agent khatabook details fetched successfully',
      data: {
        date: date,
        game_id: parseInt(game_id),
        total_agents: agentDetails.length,
        agents: agentDetails,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('=== GET AGENT KHATABOOK DETAILS ERROR ===');
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch agent khatabook details',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const agentDailyKhataSettlement = async (req, res) => {
  try {
    const { agent_id, game_id, date, debit, credit, settled_amount, current_balance, user_id } = req.body;

    // Validation
    if (!agent_id || !game_id || !date || !user_id) {
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'agent_id, game_id, date, and user_id are required',
        errors: {
          field: 'validation',
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Insert into agent_khatabook table
    const insertQuery = `
      INSERT INTO agent_khatabook (
        agent_id, game_id, date, debit, credit, settled_amount, 
        current_balance, is_locked, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      agent_id,
      game_id,
      date,
      debit || 0,
      credit || 0,
      settled_amount || 0,
      current_balance || 0,
      true, // is_locked = true
      user_id
    ]);

    res.status(200).json({
      success: true,
      statusCode: 201,
      message: 'Agent daily khata settlement recorded successfully',
      data: {
        settlement: result.rows[0]
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('=== AGENT DAILY KHATA SETTLEMENT ERROR ===');
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to record agent daily khata settlement',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const updateBiddingStatus = async (req, res) => {
  try {
    const { game_result_id, status } = req.body;
    
    if (!game_result_id || typeof status !== 'boolean') {
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'game_result_id and status (boolean) are required',
        errors: { field: 'validation' },
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await pool.query(
      'UPDATE game_results SET is_bidding_enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, game_result_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(200).json({
        success: false,
        statusCode: 404,
        message: 'Game result not found',
        errors: { field: 'game_result_id' },
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: `Bidding ${status ? 'enabled' : 'disabled'} successfully`,
      data: { game_result: result.rows[0] },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('UPDATE BIDDING STATUS ERROR:', error.message);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to update bidding status',
      errors: { field: 'server' },
      timestamp: new Date().toISOString()
    });
  }
};

const getGameStatus = async (req, res) => {
  try {
    const currentTime = new Date();
    const currentTimeString = currentTime.toTimeString().slice(0, 8); // HH:MM:SS format
    
    const result = await pool.query(`
      SELECT 
        g.id,
        g.game_name,
        TO_CHAR(g.open_time, 'HH24:MI:SS') as open_time,
        TO_CHAR(g.close_time, 'HH24:MI:SS') as close_time,
        g.status as game_status,
        CASE 
          WHEN $1 < TO_CHAR(g.open_time, 'HH24:MI:SS') THEN 'Open'
          WHEN $1 >= TO_CHAR(g.open_time, 'HH24:MI:SS') AND $1 < TO_CHAR(g.close_time, 'HH24:MI:SS') THEN 'Bidding for Close'
          WHEN $1 >= TO_CHAR(g.close_time, 'HH24:MI:SS') THEN 'Close'
        END as current_status
      FROM games g
      WHERE g.deleted_by IS NULL AND g.status = 'active'
      ORDER BY g.open_time ASC
    `, [currentTimeString]);
    
    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Game status fetched successfully',
      data: {
        current_server_time: currentTimeString,
        games: result.rows
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('GET GAME STATUS ERROR:', error.message);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch game status',
      errors: { field: 'server' },
      timestamp: new Date().toISOString()
    });
  }
};

export { addGame, getAllGames, updateGame, deleteGame, getGameById, getAgentKhatabookDetails, agentDailyKhataSettlement, updateBiddingStatus, getGameStatus };