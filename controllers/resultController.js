import pool from '../config/db.js';
import { getPannaType } from '../utils/helper.js';

// Process bids after result declaration
const processBidsAfterResult = async (gameResult) => {
  try {
    debugger;
    console.log('=== INSIDE processBidsAfterResult ===');
    console.log('Game Result:', gameResult);
    const {
      game_id,
      id: game_result_id,
      open_result,
      close_result,
      winning_number,
    } = gameResult;
    console.log('Game ID:', game_id, 'Result ID:', game_result_id);
    console.log(
      'Open Result:',
      open_result,
      'Close Result:',
      close_result,
      'Winning Number:',
      winning_number
    );

    // Process Open Session
    if (
      winning_number &&
      winning_number.toString() &&
      winning_number.toString() !== '' &&
      winning_number.toString() !== 'null' &&
      winning_number.toString().length === 1
    ) {
      console.log(
        'Processing OPEN session with result:',
        winning_number.toString()
      );
      await updateBidsForSession(
        game_id,
        game_result_id,
        winning_number.toString(),
        'Open'
      );
    }
    // Process Open Session Panna
    if (
      open_result &&
      open_result.toString() &&
      open_result.toString() !== '' &&
      open_result.toString() !== 'null' &&
      open_result.toString().length === 3
    ) {
      console.log(
        'Processing OPEN session with result:',
        open_result.toString()
      );
      await updateBidsForSession(
        game_id,
        game_result_id,
        open_result.toString(),
        'Open'
      );
    }

    // Process Close Session
    if (
      winning_number &&
      winning_number.toString() &&
      winning_number.toString() !== '' &&
      winning_number.toString() !== 'null' &&
      winning_number.toString().length === 2
    ) {
      console.log(
        'Processing CLOSE session with result:',
        winning_number.toString()
      );
      await updateBidsForSession(
        game_id,
        game_result_id,
        winning_number.toString(),
        'Close'
      );
    }
    // Process Close Session Panna
    if (
      close_result &&
      close_result.toString() &&
      close_result.toString() !== '' &&
      close_result.toString() !== 'null' &&
      close_result.toString().length === 3
    ) {
      console.log(
        'Processing CLOSE session with result:',
        close_result.toString()
      );
      await updateBidsForSession(
        game_id,
        game_result_id,
        close_result.toString(),
        'Close'
      );
    }
  } catch (error) {
    console.error('PROCESS BIDS ERROR:', error.message);
  }
};

const updateBidsForSession = async (
  gameId,
  gameResultId,
  winningNumber,
  sessionType
) => {
  try {
    console.log('=== INSIDE updateBidsForSession ===');
    console.log('Params:', {
      gameId,
      gameResultId,
      winningNumber,
      sessionType,
    });

    // Process different bid types based on session
    if (sessionType === 'Open') {
      // Single digit for open session
      if (winningNumber.length === 1) {
        await processBidType(
          gameId,
          gameResultId,
          'single_digit',
          winningNumber,
          sessionType
        );
      }
      // Panna types for open session (3-digit numbers)
      else if (winningNumber.length === 3) {
        // let pannaType = getPannaType(winningNumber);
        // console.log('Determined Panna Type:', pannaType);
        await processBidType(
          gameId,
          gameResultId,
          'single_panna',
          winningNumber,
          sessionType
        );
        await processBidType(
          gameId,
          gameResultId,
          'double_panna',
          winningNumber,
          sessionType
        );
        await processBidType(
          gameId,
          gameResultId,
          'triple_panna',
          winningNumber,
          sessionType
        );
      }
    } else if (sessionType === 'Close') {
      // Single digit for close session (last digit)
      if (winningNumber.length === 2) {
        const closeDigit = winningNumber.charAt(1); // Last digit (4 from 34)
        await processBidType(
          gameId,
          gameResultId,
          'single_digit',
          closeDigit,
          sessionType
        );

        // Jodi digit processing (full 2-digit number) - jodi bids placed in Open session
        await processBidType(
          gameId,
          gameResultId,
          'jodi_digit',
          winningNumber,
          'Open'
        );
      }
      // Panna types for close session (3-digit numbers)
      else if (winningNumber.length === 3) {
        // let pannaType = getPannaType(winningNumber);
        // console.log('Determined Panna Type:', pannaType);
        await processBidType(
          gameId,
          gameResultId,
          'single_panna',
          winningNumber,
          sessionType
        );
        await processBidType(
          gameId,
          gameResultId,
          'double_panna',
          winningNumber,
          sessionType
        );
        await processBidType(
          gameId,
          gameResultId,
          'triple_panna',
          winningNumber,
          sessionType
        );
      }
    }
  } catch (error) {
    console.error('UPDATE BIDS ERROR:', error.message);
  }
};

const processBidType = async (
  gameId,
  gameResultId,
  bidTypeName,
  actualWinningNumber,
  sessionType
) => {
  try {
    console.log('Processing bid type:', {
      bidTypeName,
      actualWinningNumber,
      sessionType,
    });
    // Get bid_type_id from bid_types table
    const bidTypeResult = await pool.query(
      'SELECT id FROM bid_types WHERE LOWER(type_code) = $1',
      [bidTypeName]
    );

    console.log('Bid type query result:', bidTypeResult.rows);

    if (bidTypeResult.rows.length === 0) {
      console.log(`Bid type '${bidTypeName}' not found`);
      return;
    }

    const bidTypeId = bidTypeResult.rows[0].id;
    console.log('Bid type ID:', bidTypeId);

    // Update winning bids
    const updateResult = await pool.query(
      `UPDATE bids SET 
        status = 'won',
        result_declared_at = CURRENT_TIMESTAMP,
        is_winner = true,
        winning_amount = amount * rate,
        updated_at = CURRENT_TIMESTAMP
      WHERE game_id = $1 
        AND game_result_id = $2 
        AND bid_type = $3 
        AND bid_number = $4 
        AND session_type = $5 
        AND status IN ('submitted', 'won', 'lost')`,
      [gameId, gameResultId, bidTypeId, actualWinningNumber, sessionType]
    );

    // Update losing bids
    const loseResult = await pool.query(
      `UPDATE bids SET 
        status = 'lost',
        result_declared_at = CURRENT_TIMESTAMP,
        is_winner = false,
        winning_amount = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE game_id = $1 
        AND game_result_id = $2 
        AND bid_type = $3 
        AND session_type = $4 
        AND bid_number != $5 
        AND status IN ('submitted', 'won', 'lost')`,
      [gameId, gameResultId, bidTypeId, sessionType, actualWinningNumber]
    );

    console.log(
      `Updated ${updateResult.rowCount} winning bids and ${loseResult.rowCount} losing bids for ${bidTypeName} in ${sessionType} session`
    );
  } catch (error) {
    console.error('UPDATE BIDS ERROR:', error.message);
  }
};


// Admin Panel APIs

const declareResult = async (req, res) => {
  try {
    const { game_id, open_result, close_result, winning_number } = req.body;
    console.log('=== INSIDE declareResult ===', req.body);
    const createdBy = req.user?.id;
    const result_date = new Date().toISOString().split('T')[0]; // Auto set today's date

    if (!game_id) {
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'game_id is required',
        errors: {
          field: 'validation',
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Check if result already exists for this game and date
    const existingResult = await pool.query(
      'SELECT * FROM game_results WHERE game_id = $1 AND result_date = $2',
      [game_id, result_date]
    );

    let result;
    if (existingResult.rows.length > 0) {
      // Update existing result
      result = await pool.query(
        `UPDATE game_results SET 
          open_result = $1::VARCHAR,
          close_result = $2::VARCHAR, 
          winning_number = $3::INTEGER,
          open_status = CASE WHEN $1 IS NOT NULL AND $1 != '' THEN 'declared' ELSE 'pending' END,
          close_status = CASE WHEN $2 IS NOT NULL AND $2 != '' THEN 'declared' ELSE 'pending' END,
          open_declared_at = CASE WHEN $1 IS NOT NULL AND $1 != '' THEN CURRENT_TIMESTAMP ELSE NULL END,
          close_declared_at = CASE WHEN $2 IS NOT NULL AND $2 != '' THEN CURRENT_TIMESTAMP ELSE NULL END,
          updated_by = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE game_id = $5 AND result_date = $6 
        RETURNING *`,
        [
          open_result || null,
          close_result || null,
          winning_number ? parseInt(winning_number) : null,
          createdBy,
          game_id,
          result_date,
        ]
      );
    } else {
      // Create new result
      result = await pool.query(
        `INSERT INTO game_results (
          game_id, result_date, open_result, close_result, 
          winning_number, 
          open_status, close_status,
          open_declared_at, close_declared_at,
          created_by
        ) VALUES ($1, $2, $3::VARCHAR, $4::VARCHAR, $5::INTEGER, $6, $7, $8, $9, $10) RETURNING *`,
        [
          game_id,
          result_date,
          open_result || null,
          close_result || null,
          winning_number ? parseInt(winning_number) : null,
          open_result && open_result !== '' ? 'declared' : 'pending',
          close_result && close_result !== '' ? 'declared' : 'pending',
          open_result && open_result !== '' ? 'CURRENT_TIMESTAMP' : null,
          close_result && close_result !== '' ? 'CURRENT_TIMESTAMP' : null,
          createdBy,
        ]
      );
    }

    // No reset needed - processBidsAfterResult will handle all statuses

    // Process bids after result declaration
    await processBidsAfterResult(result.rows[0]);

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Result declared successfully',
      data: {
        result: result.rows[0],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('=== DECLARE RESULT ERROR ===');
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    console.error('Request Body:', req.body);
    console.error('User ID:', req.user?.id);
    console.error('Full Error Object:', error);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to declare result',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const getGameResults = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { date } = req.query;

    let query = `
      SELECT gr.*, g.game_name 
      FROM game_results gr
      JOIN games g ON gr.game_id = g.id
      WHERE gr.game_id = $1
    `;
    let params = [gameId];

    if (date) {
      query += ' AND gr.result_date = $2';
      params.push(date);
    }

    query += ' ORDER BY gr.result_date DESC LIMIT 30';

    const result = await pool.query(query, params);

    res.json({
      message: 'Results fetched successfully',
      results: result.rows,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mobile App APIs

const getGamesWithResults = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const result = await pool.query(
      `
      SELECT 
        g.id,
        g.game_name,
        g.open_time,
        g.close_time,
        g.status,
        gr.open_result,
        gr.close_result,
        gr.winning_number,
        gr.open_status,
        gr.close_status,
        gr.result_date
      FROM games g
      LEFT JOIN game_results gr ON g.id = gr.game_id AND gr.result_date = $1
      WHERE g.deleted_by IS NULL AND g.status = 'active'
      ORDER BY g.open_time
    `,
      [today]
    );

    res.json({
      message: 'Games with results fetched successfully',
      games: result.rows,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getGameResultHistory = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { limit = 30 } = req.query;

    const result = await pool.query(
      `
      SELECT 
        gr.*,
        g.game_name
      FROM game_results gr
      JOIN games g ON gr.game_id = g.id
      WHERE gr.game_id = $1
      ORDER BY gr.result_date DESC
      LIMIT $2
    `,
      [gameId, limit]
    );

    res.json({
      message: 'Game result history fetched successfully',
      results: result.rows,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTodayResults = async (req, res) => {
  try {
    // Get today's date in Indian timezone
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    });

    const result = await pool.query(
      `
      SELECT 
        g.id as game_id,
        g.game_name,
        TO_CHAR(g.open_time, 'HH24:MI') as open_time,
        TO_CHAR(g.close_time, 'HH24:MI') as close_time,
        TO_CHAR(gr.result_date, 'YYYY-MM-DD') as result_date,
        gr.id as result_id,
        gr.open_result,
        gr.close_result,
        gr.winning_number
      FROM games g
      LEFT JOIN game_results gr ON g.id = gr.game_id AND DATE(gr.result_date) = DATE($1)
      WHERE g.deleted_by IS NULL AND g.status = 'active' AND g.id= gr.game_id
      ORDER BY g.open_time
    `,
      [today]
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Today results fetched successfully',
      data: {
        date: today,
        results: result.rows,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch today results',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const getTodayGameResults = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const result = await pool.query(
      `
      SELECT 
        gr.id,
        gr.game_id,
        TO_CHAR(gr.result_date, 'YYYY-MM-DD') as result_date,
        g.game_name
      FROM game_results gr
      JOIN games g ON gr.game_id = g.id
      WHERE gr.result_date = $1
      ORDER BY g.open_time ASC
    `,
      [today]
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Today game results fetched successfully',
      data: {
        date: today,
        results: result.rows,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch today game results',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const getAllResults = async (req, res) => {
  try {
    const { pagination = {}, filters = {} } = req.body;

    const { page = 1, limit = 20 } = pagination;

    const { game_id, date, status } = filters;

    const offset = (page - 1) * limit;

    // Get last 7 days date range (including today)
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    });
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // 6 days ago + today = 7 days
    const startDate = sevenDaysAgo.toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata',
    });

    let query = `
      SELECT 
        gr.id,
        gr.game_id,
        TO_CHAR(gr.result_date, 'YYYY-MM-DD') as result_date,
        gr.open_result,
        gr.close_result,
        gr.winning_number,
        gr.open_status,
        gr.close_status,
        gr.created_at,
        g.game_name
      FROM game_results gr
      JOIN games g ON gr.game_id = g.id
      WHERE gr.result_date >= $1 AND gr.result_date <= $2
    `;

    let params = [startDate, today];
    let paramCount = 2;

    // Add filters
    if (game_id) {
      paramCount++;
      query += ` AND gr.game_id = $${paramCount}`;
      params.push(game_id);
    }

    if (date) {
      paramCount++;
      query += ` AND gr.result_date = $${paramCount}`;
      params.push(date);
    }

    if (status) {
      paramCount++;
      query += ` AND (gr.open_status = $${paramCount} OR gr.close_status = $${paramCount})`;
      params.push(status);
    }

    // Count total records
    const countQuery = query.replace(
      /SELECT[\s\S]*?FROM/,
      'SELECT COUNT(*) as total FROM'
    );
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Add pagination
    paramCount++;
    query += ` ORDER BY gr.result_date DESC, gr.created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await pool.query(query, params);

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'All results fetched successfully',
      data: {
        results: result.rows,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total: total,
          total_pages: Math.ceil(total / limit),
          has_next: page * limit < total,
          has_prev: page > 1,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch all results',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

export {
  declareResult,
  getGameResults,
  getGamesWithResults,
  getGameResultHistory,
  getTodayResults,
  getTodayGameResults,
  getAllResults,
};
