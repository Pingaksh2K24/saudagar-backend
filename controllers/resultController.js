import pool from '../config/db.js';
import { getPannaType } from '../utils/helper.js';

// Process bids after result declaration
const processBidsAfterResult = async (gameResult) => {
  try {
    console.log('=== INSIDE processBidsAfterResult ===');
    console.log('Game Result:', gameResult);
    const { game_id, id: game_result_id, open_result, close_result, winning_number } = gameResult;
    console.log('Game ID:', game_id, 'Result ID:', game_result_id);
    console.log('Open Result:', open_result, 'Close Result:', close_result, 'Winning Number:', winning_number);

    // Process Open Session
    if (winning_number.toString() &&
      winning_number.toString() !== '' &&
      winning_number.toString() !== null &&
      winning_number.toString().length === 1
    ) {
      console.log('Processing OPEN session with result:', winning_number.toString());
      await updateBidsForSession(game_id, game_result_id, winning_number.toString(), 'Open');
    }
    // Process Open Session Panna
    if (open_result.toString() &&
      open_result.toString() !== '' &&
      open_result.toString() !== null &&
      open_result.toString().length === 3
    ) {
      console.log('Processing OPEN session with result:', open_result.toString());
      await updateBidsForSession(game_id, game_result_id, open_result.toString(), 'Open');
    }

    // Process Close Session  
    if (winning_number.toString() &&
      winning_number.toString() !== '' &&
      winning_number.toString() !== null &&
      winning_number.toString().length === 2) {
      console.log('Processing CLOSE session with result:', winning_number.toString());
      await updateBidsForSession(game_id, game_result_id, winning_number.toString(), 'Close');
    }
    // Process Open Session Panna
    if (close_result.toString() &&
      close_result.toString() !== '' &&
      close_result.toString() !== null &&
      close_result.toString().length === 2) {
      console.log('Processing CLOSE session with result:', close_result.toString());
      await updateBidsForSession(game_id, game_result_id, close_result.toString(), 'Close');
    }

  } catch (error) {
    console.error('PROCESS BIDS ERROR:', error.message);
  }
};

const updateBidsForSession = async (gameId, gameResultId, winningNumber, sessionType) => {
  try {
    console.log('=== INSIDE updateBidsForSession ===');
    console.log('Params:', { gameId, gameResultId, winningNumber, sessionType });

    // Process different bid types based on session
    if (sessionType === 'Open') {
      // Single digit for open session
      if (winningNumber.length === 1) {
        await processBidType(gameId, gameResultId, 'single_digit', winningNumber, sessionType);
      }
      // Panna types for open session (3-digit numbers)
      else if (winningNumber.length === 3) {
        let pannaType = getPannaType(winningNumber);
        console.log('Determined Panna Type:', pannaType);
        await processBidType(gameId, gameResultId, pannaType,winningNumber, sessionType);
      }
    } else if (sessionType === 'Close') {
      // Single digit for close session (last digit)
      if (winningNumber.length === 2) {
        const closeDigit = winningNumber.charAt(1); // Last digit (4 from 34)
        await processBidType(gameId, gameResultId, 'single_digit', closeDigit, sessionType);

        // Jodi digit processing (full 2-digit number) - jodi bids placed in Open session
        await processBidType(gameId, gameResultId, 'jodi_digit', winningNumber, 'Open');
      }
      // Panna types for close session (3-digit numbers)
      else if (winningNumber.length === 3) {
        let pannaType = getPannaType(winningNumber);
        console.log('Determined Panna Type:', pannaType);
        await processBidType(gameId, gameResultId, pannaType, resultNumber, sessionType);
      }
    }

  } catch (error) {
    console.error('UPDATE BIDS ERROR:', error.message);
  }
};

const processBidType = async (gameId, gameResultId, bidTypeName, actualWinningNumber, sessionType) => {
  try {
    console.log('Processing bid type:', { bidTypeName, actualWinningNumber, sessionType });
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
        AND status = 'submitted'`,
      [gameId, gameResultId, bidTypeId, actualWinningNumber, sessionType]
    );

    // Update losing bids
    const loseResult = await pool.query(
      `UPDATE bids SET 
        status = 'lost',
        result_declared_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE game_id = $1 
        AND game_result_id = $2 
        AND bid_type = $3 
        AND session_type = $4 
        AND bid_number != $5 
        AND status = 'submitted'`,
      [gameId, gameResultId, bidTypeId, sessionType, actualWinningNumber]
    );

    console.log(`Updated ${updateResult.rowCount} winning bids and ${loseResult.rowCount} losing bids for ${bidTypeName} in ${sessionType} session`);

  }
  catch (error) {
    console.error('UPDATE BIDS ERROR:', error.message);
  }
};

// const processPannaBids = async (gameId, gameResultId, winningNumber, sessionType) => {
//   try {
//     console.log('Processing panna bids:', { winningNumber, sessionType });

//     // Determine panna type based on digit repetition
//     const digits = winningNumber.split('');
//     const uniqueDigits = [...new Set(digits)];

//     let pannaType;
//     if (uniqueDigits.length === 1) {
//       pannaType = 'triple_panna'; // All same digits (111, 222)
//     } else if (uniqueDigits.length === 2) {
//       pannaType = 'double_panna'; // Two same digits (112, 223)
//     } else {
//       pannaType = 'single_panna'; // All different digits (123, 456)
//     }

//     console.log('Panna type detected:', pannaType);
//     await processBidType(gameId, gameResultId, pannaType, winningNumber, sessionType);

//   } catch (error) {
//     console.error('PROCESS PANNA BIDS ERROR:', error.message);
//   }
// };

// Admin Panel APIs

const declareResult = async (req, res) => {
  try {
    console.log('=== DECLARE RESULT API CALLED ===');
    const { game_id, open_result, close_result, winning_number } = req.body;
    const createdBy = req.user?.id;
    const result_date = new Date().toISOString().split('T')[0]; // Auto set today's date

    if (!game_id) {
      return res.status(400).json({ message: 'game_id is required' });
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
          open_result = COALESCE($1, open_result),
          close_result = COALESCE($2, close_result), 
          winning_number = COALESCE($3, winning_number),
          open_status = CASE WHEN $1 IS NOT NULL AND $1 != '' THEN 'declared' ELSE open_status END,
          close_status = CASE WHEN $2 IS NOT NULL AND $2 != '' THEN 'declared' ELSE close_status END,
          open_declared_at = CASE WHEN $1 IS NOT NULL AND $1 != '' THEN CURRENT_TIMESTAMP ELSE open_declared_at END,
          close_declared_at = CASE WHEN $2 IS NOT NULL AND $2 != '' THEN CURRENT_TIMESTAMP ELSE close_declared_at END,
          updated_by = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE game_id = $5 AND result_date = $6 
        RETURNING *`,
        [open_result, close_result, winning_number, createdBy, game_id, result_date]
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
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [
          game_id, result_date, open_result, close_result, winning_number,
          open_result && open_result !== '' ? 'declared' : 'pending',
          close_result && close_result !== '' ? 'declared' : 'pending',
          open_result && open_result !== '' ? 'CURRENT_TIMESTAMP' : null,
          close_result && close_result !== '' ? 'CURRENT_TIMESTAMP' : null,
          createdBy
        ]
      );
    }

    // Process bids after result declaration
    console.log('=== PROCESSING BIDS AFTER RESULT ===');
    console.log('Game Result:', result.rows[0]);
    await processBidsAfterResult(result.rows[0]);

    res.status(201).json({
      message: 'Result declared successfully',
      result: result.rows[0]
    });
  } catch (error) {
    console.error('DECLARE RESULT ERROR:', error.message);
    res.status(500).json({ message: error.message });
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
      results: result.rows
    });
  } catch (error) {
    console.error('GET GAME RESULTS ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};



// Mobile App APIs

const getGamesWithResults = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const result = await pool.query(`
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
    `, [today]);

    res.json({
      message: 'Games with results fetched successfully',
      games: result.rows
    });
  } catch (error) {
    console.error('GET GAMES WITH RESULTS ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const getGameResultHistory = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { limit = 30 } = req.query;

    const result = await pool.query(`
      SELECT 
        gr.*,
        g.game_name
      FROM game_results gr
      JOIN games g ON gr.game_id = g.id
      WHERE gr.game_id = $1
      ORDER BY gr.result_date DESC
      LIMIT $2
    `, [gameId, limit]);

    res.json({
      message: 'Game result history fetched successfully',
      results: result.rows
    });
  } catch (error) {
    console.error('GET GAME RESULT HISTORY ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const getTodayResults = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const result = await pool.query(`
      SELECT 
        g.id as game_id,
        g.game_name,
        g.open_time,
        g.close_time,
        TO_CHAR(gr.result_date, 'YYYY-MM-DD') as result_date,
        gr.id as result_id,
        gr.open_result,
        gr.close_result,
        gr.winning_number
      FROM games g
      LEFT JOIN game_results gr ON g.id = gr.game_id AND gr.result_date = $1
      WHERE g.deleted_by IS NULL AND g.status = 'active'
      ORDER BY g.open_time
    `, [today]);

    res.json({
      message: 'Today results fetched successfully',
      date: today,
      results: result.rows
    });
  } catch (error) {
    console.error('GET TODAY RESULTS ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const getTodayGameResults = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const result = await pool.query(`
      SELECT 
        gr.id,
        gr.game_id,
        TO_CHAR(gr.result_date, 'YYYY-MM-DD') as result_date,
        g.game_name
      FROM game_results gr
      JOIN games g ON gr.game_id = g.id
      WHERE gr.result_date = $1
      ORDER BY g.open_time ASC
    `, [today]);

    res.json({
      message: 'Today game results fetched successfully',
      date: today,
      results: result.rows
    });
  } catch (error) {
    console.error('GET TODAY GAME RESULTS ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

export {
  declareResult,
  getGameResults,
  getGamesWithResults,
  getGameResultHistory,
  getTodayResults,
  getTodayGameResults
};