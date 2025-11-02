import pool from '../config/db.js';

const placeBids = async (req, res) => {
  try {
    console.log('=== PLACE BIDS API CALLED ===');
    const { bids } = req.body;
    const createdBy = req.user?.id;
    
    if (!createdBy) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    if (!bids || !Array.isArray(bids) || bids.length === 0) {
      return res.status(400).json({ message: 'Bids array is required' });
    }
    
    // Validate each bid
    for (let i = 0; i < bids.length; i++) {
      const bid = bids[i];
      const required = ['user_id', 'game_id', 'game_result_id', 'bid_type_id', 'bid_number', 'amount', 'session_type'];
      
      for (const field of required) {
        if (!bid[field]) {
          return res.status(400).json({ 
            message: `Bid ${i + 1}: ${field} is required` 
          });
        }
      }
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const placedBids = [];
      const currentDate = new Date().toISOString().split('T')[0];
      const currentTime = new Date().toTimeString().split(' ')[0];
      
      for (const bid of bids) {
        // Fetch rate_per_rupee from bid_rates table
        const rateResult = await client.query(
          'SELECT rate_per_rupee FROM bid_rates WHERE game_id = $1 AND bid_type_id = $2',
          [bid.game_id, bid.bid_type_id]
        );
        
        if (rateResult.rows.length === 0) {
          throw new Error(`Rate not found for game_id: ${bid.game_id} and bid_type_id: ${bid.bid_type_id}`);
        }
        
        const rate = rateResult.rows[0].rate_per_rupee;
        const totalPayout = bid.amount * rate;
        
        const result = await client.query(
          `INSERT INTO bids (
            user_id, game_id, game_result_id, bid_type, bid_number, 
            amount, rate, session_type, total_payout, bid_time, 
            bid_date, status, created_at, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'), $10, $11, CURRENT_TIMESTAMP, $12) 
          RETURNING *`,
          [
            bid.user_id,
            bid.game_id,
            bid.game_result_id,
            bid.bid_type_id,
            bid.bid_number,
            bid.amount,
            rate,
            bid.session_type,
            totalPayout, // amount * rate
            currentDate, // bid_date
            'submitted', // status
            createdBy
          ]
        );
        
        placedBids.push(result.rows[0]);
      }
      
      await client.query('COMMIT');
      
      res.status(201).json({
        message: `${placedBids.length} bids placed successfully`,
        bids: placedBids
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('PLACE BIDS ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const getMyBids = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      date, 
      game_id, 
      session_type, 
      status, 
      bid_type 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        b.id,
        b.user_id,
        b.game_id,
        b.game_result_id,
        b.bid_type,
        b.bid_number,
        b.amount,
        b.rate,
        b.session_type,
        b.bid_date,
        b.status,
        g.game_name,
        u.full_name,
        gr.open_result,
        gr.close_result
      FROM bids b
      JOIN games g ON b.game_id = g.id
      JOIN users u ON b.user_id = u.id
      LEFT JOIN game_results gr ON b.game_result_id = gr.id
      WHERE 1=1
    `;
    let params = [];
    let paramCount = 0;
    
    // Add filters
    if (date) {
      paramCount++;
      query += ` AND b.bid_date = $${paramCount}`;
      params.push(date);
    }
    
    if (game_id) {
      paramCount++;
      query += ` AND b.game_id = $${paramCount}`;
      params.push(game_id);
    }
    
    if (session_type) {
      paramCount++;
      query += ` AND b.session_type = $${paramCount}`;
      params.push(session_type);
    }
    
    if (status) {
      paramCount++;
      query += ` AND b.status = $${paramCount}`;
      params.push(status);
    }
    
    if (bid_type) {
      paramCount++;
      query += ` AND b.bid_type = $${paramCount}`;
      params.push(bid_type);
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
    query += ` ORDER BY b.created_at DESC LIMIT $${paramCount}`;
    params.push(limit);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      message: 'Bids fetched successfully',
      data: {
        bids: result.rows,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total: total,
          total_pages: Math.ceil(total / limit),
          has_next: page * limit < total,
          has_prev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('GET MY BIDS ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const getBidTypes = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, display_name, bid_code FROM bid_types where is_active=true ORDER BY id'
    );
    
    res.json({
      message: 'Bid types fetched successfully',
      results: result.rows
    });
  } catch (error) {
    console.error('GET BID TYPES ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const getAllBids = async (req, res) => {
  try {
    const { 
      pagination = {}, 
      filters = {} 
    } = req.body;
    
    const { 
      page = 1, 
      limit = 10 
    } = pagination;
    
    const {
      date,
      game_id,
      session_type,
      status,
      bid_type,
      user_id
    } = filters;
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        b.id,
        b.user_id,
        b.game_id,
        b.game_result_id,
        b.bid_type,
        b.bid_number,
        b.amount,
        b.rate,
        b.session_type,
        b.bid_date,
        b.status,
        g.game_name,
        u.full_name,
        gr.open_result,
        gr.close_result
      FROM bids b
      JOIN games g ON b.game_id = g.id
      JOIN users u ON b.user_id = u.id
      LEFT JOIN game_results gr ON b.game_result_id = gr.id
      WHERE 1=1
    `;
    let params = [];
    let paramCount = 0;
    
    // Add filters
    if (date) {
      paramCount++;
      query += ` AND b.bid_date = $${paramCount}`;
      params.push(date);
    }
    
    if (game_id) {
      paramCount++;
      query += ` AND b.game_id = $${paramCount}`;
      params.push(game_id);
    }
    
    if (session_type) {
      paramCount++;
      query += ` AND b.session_type = $${paramCount}`;
      params.push(session_type);
    }
    
    if (status) {
      paramCount++;
      query += ` AND b.status = $${paramCount}`;
      params.push(status);
    }
    
    if (bid_type) {
      paramCount++;
      query += ` AND b.bid_type = $${paramCount}`;
      params.push(bid_type);
    }
    
    if (user_id) {
      paramCount++;
      query += ` AND b.user_id = $${paramCount}`;
      params.push(user_id);
    }
    
    // Count total records and status counts
    const countQuery = query.replace(
      /SELECT[\s\S]*?FROM/,
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN b.status = 'won' THEN 1 END) as total_won,
        COUNT(CASE WHEN b.status = 'lost' THEN 1 END) as total_lost,
        COUNT(CASE WHEN b.status = 'submitted' THEN 1 END) as total_submitted
      FROM`
    );
    const countResult = await pool.query(countQuery, params);
    const counts = countResult.rows[0];
    
    // Add pagination
    paramCount++;
    query += ` ORDER BY b.created_at DESC LIMIT $${paramCount}`;
    params.push(limit);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      message: 'All bids fetched successfully',
      data: {
        bids: result.rows,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total: parseInt(counts.total),
          total_pages: Math.ceil(counts.total / limit),
          total_won: parseInt(counts.total_won),
          total_lost: parseInt(counts.total_lost),
          total_submitted: parseInt(counts.total_submitted),
          has_next: page * limit < counts.total,
          has_prev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('GET ALL BIDS ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const fetchBids = async (req, res) => {
  try {
    console.log('=== FETCH BIDS API CALLED ===');
    console.log('Request Body:', req.body);
    
    const { 
      pagination = {}, 
      filters = {} 
    } = req.body;
    
    const { 
      page = 1, 
      limit = 10 
    } = pagination;
    
    const {
      date,
      game_id,
      session_type,
      status,
      bid_type,
      user_id
    } = filters;
    
    console.log('Pagination:', { page, limit });
    console.log('Filters:', filters);
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        b.id,
        b.user_id,
        b.game_id,
        b.game_result_id,
        b.bid_type,
        bt.display_name as bid_type_name,
        b.bid_number,
        b.amount,
        b.rate,
        b.session_type,
        b.bid_date,
        b.status,
        g.game_name,
        u.full_name,
        gr.open_result,
        gr.close_result
      FROM bids b
      JOIN games g ON b.game_id = g.id
      JOIN users u ON b.user_id = u.id
      JOIN bid_types bt ON b.bid_type::integer = bt.id
      LEFT JOIN game_results gr ON b.game_result_id = gr.id
      WHERE 1=1
    `;
    let params = [];
    let paramCount = 0;
    
    // Add filters
    if (date) {
      paramCount++;
      query += ` AND b.bid_date = $${paramCount}`;
      params.push(date);
    }
    
    if (game_id) {
      paramCount++;
      query += ` AND b.game_id = $${paramCount}`;
      params.push(game_id);
    }
    
    if (session_type) {
      paramCount++;
      query += ` AND b.session_type = $${paramCount}`;
      params.push(session_type);
    }
    
    if (status) {
      paramCount++;
      query += ` AND b.status = $${paramCount}`;
      params.push(status);
    }
    
    if (bid_type) {
      paramCount++;
      query += ` AND b.bid_type = $${paramCount}`;
      params.push(bid_type);
    }
    
    if (user_id) {
      paramCount++;
      query += ` AND b.user_id = $${paramCount}`;
      params.push(user_id);
    }
    
    // Count total records and status counts
    const countQuery = query.replace(
      /SELECT[\s\S]*?FROM/,
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN b.status = 'won' THEN 1 END) as total_won,
        COUNT(CASE WHEN b.status = 'lost' THEN 1 END) as total_lost,
        COUNT(CASE WHEN b.status = 'submitted' THEN 1 END) as total_submitted
      FROM`
    );
    const countResult = await pool.query(countQuery, params);
    const counts = countResult.rows[0];
    
    // Add pagination
    paramCount++;
    query += ` ORDER BY b.created_at DESC LIMIT $${paramCount}`;
    params.push(limit);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      message: 'Bids fetched successfully',
      data: {
        bids: result.rows,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total: parseInt(counts.total),
          total_pages: Math.ceil(counts.total / limit),
          total_won: parseInt(counts.total_won),
          total_lost: parseInt(counts.total_lost),
          total_submitted: parseInt(counts.total_submitted),
          has_next: page * limit < counts.total,
          has_prev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('FETCH BIDS ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const fetchBidsWithVillage = async (req, res) => {
  try {
    console.log('=== FETCH BIDS WITH VILLAGE API CALLED ===');
    console.log('Request Body:', req.body);
    
    const { 
      pagination = {}, 
      filters = {} 
    } = req.body;
    
    const { 
      page = 1, 
      limit = 10 
    } = pagination;
    
    const {
      village,
      game_result_id,
      date = new Date().toISOString().split('T')[0], // Default to today
      session_type,
      status
    } = filters;
    
    console.log('Pagination:', { page, limit });
    console.log('Filters:', filters);
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        b.id,
        b.user_id,
        b.game_id,
        b.game_result_id,
        b.bid_type,
        b.bid_number,
        b.amount,
        b.rate,
        b.session_type,
        b.bid_date,
        b.status,
        bt.display_name as bid_type_name,
        g.game_name,
        u.full_name,
        u.village,
        gr.open_result,
        gr.close_result,
        gr.winning_number
      FROM bids b
      JOIN bid_types bt ON b.bid_type::integer = bt.id
      JOIN games g ON b.game_id = g.id
      JOIN users u ON b.user_id = u.id
      LEFT JOIN game_results gr ON b.game_result_id = gr.id
      WHERE 1=1
    `;
    let params = [];
    let paramCount = 0;
    
    // Add filters
    if (village) {
      paramCount++;
      query += ` AND u.village = $${paramCount}`;
      params.push(village);
    }
    
    if (game_result_id) {
      paramCount++;
      query += ` AND b.game_result_id = $${paramCount}`;
      params.push(game_result_id);
    }
    
    if (date) {
      paramCount++;
      query += ` AND b.bid_date = $${paramCount}`;
      params.push(date);
    }
    
    if (session_type) {
      paramCount++;
      query += ` AND b.session_type = $${paramCount}`;
      params.push(session_type);
    }
    
    if (status) {
      paramCount++;
      query += ` AND b.status = $${paramCount}`;
      params.push(status);
    }
    
    // Count total records and sum amount
    const countQuery = query.replace(
      /SELECT[\s\S]*?FROM/,
      'SELECT COUNT(*) as total, COALESCE(SUM(b.amount), 0) as total_amount FROM'
    );
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);
    const totalAmount = parseFloat(countResult.rows[0].total_amount);
    
    // Add pagination
    paramCount++;
    query += ` ORDER BY b.created_at DESC LIMIT $${paramCount}`;
    params.push(limit);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);
    
    const result = await pool.query(query, params);
    
    console.log('Final Query:', query);
    console.log('Query Params:', params);
    console.log('Total Records:', total);
    console.log('Total Amount:', totalAmount);
    console.log('Fetched Records:', result.rows.length);
    
    res.json({
      message: 'Bids with village data fetched successfully',
      data: {
        bids: result.rows,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total: total,
          total_pages: Math.ceil(total / limit),
          total_amount: totalAmount,
          has_next: page * limit < total,
          has_prev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('FETCH BIDS WITH VILLAGE ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const getUserBidsForMobile = async (req, res) => {
  try {
    console.log('=== GET USER BIDS FOR MOBILE API CALLED ===');
    
    const { user_id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    console.log('User ID:', user_id, 'Page:', page, 'Limit:', limit);
    
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        b.id,
        b.user_id,
        b.game_id,
        b.game_result_id,
        b.bid_type,
        b.bid_number,
        b.amount,
        b.session_type,
        b.created_at as created_date,
        b.status,
        g.game_name,
        bt.display_name as bid_type_name
      FROM bids b
      JOIN games g ON b.game_id = g.id
      JOIN bid_types bt ON b.bid_type::integer = bt.id
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await pool.query(query, [user_id, limit, offset]);
    
    // Simple check if more records exist
    const hasMore = result.rows.length === parseInt(limit);
    
    console.log('Fetched Records:', result.rows.length);
    console.log('Has More:', hasMore);
    
    res.json({
      message: 'User bids fetched successfully',
      data: {
        bids: result.rows,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          has_more: hasMore,
          next_page: hasMore ? parseInt(page) + 1 : null
        }
      }
    });
  } catch (error) {
    console.error('GET USER BIDS FOR MOBILE ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const getBidRatesByGame = async (req, res) => {
  try {
    console.log('=== GET BID RATES BY GAME API CALLED ===');
    const { game_id } = req.params;
    
    console.log('Game ID:', game_id);
    
    if (!game_id) {
      return res.status(400).json({ message: 'Game ID is required' });
    }
    
    const query = `
      SELECT 
        br.id,
        br.game_id,
        br.bid_type_id,
        br.rate_per_rupee,
        br.min_bid_amount,
        br.max_bid_amount,
        br.is_active,
        g.game_name,
        bt.display_name as bid_type_name
      FROM bid_rates br
      JOIN games g ON br.game_id = g.id
      JOIN bid_types bt ON br.bid_type_id = bt.id
      WHERE br.game_id = $1
      ORDER BY br.bid_type_id
    `;
    
    const result = await pool.query(query, [game_id]);
    
    console.log('Fetched Rates:', result.rows.length);
    
    res.json({
      message: 'Bid rates fetched successfully',
      data: {
        game_id: parseInt(game_id),
        rates: result.rows
      }
    });
  } catch (error) {
    console.error('GET BID RATES BY GAME ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const getDailyProfitLoss = async (req, res) => {
  try {
    console.log('=== GET DAILY PROFIT LOSS API CALLED ===');
    
    // Get last 7 days including today
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }
    
    console.log('Calculating for dates:', dates);
    
    const dailyData = [];
    let totalSummary = {
      total_bids: 0,
      total_amount: 0,
      total_winning_amount: 0,
      profit_loss: 0
    };
    
    for (const date of dates) {
      // Get daily statistics
      const dailyQuery = `
        SELECT 
          COUNT(*) as total_bids,
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(SUM(CASE WHEN status = 'won' THEN total_payout ELSE 0 END), 0) as total_winning_amount
        FROM bids 
        WHERE bid_date = $1
      `;
      
      const result = await pool.query(dailyQuery, [date]);
      const dayData = result.rows[0];
      
      const totalBids = parseInt(dayData.total_bids);
      const totalAmount = parseFloat(dayData.total_amount);
      const totalWinningAmount = parseFloat(dayData.total_winning_amount);
      const profitLoss = totalAmount - totalWinningAmount;
      
      // Add to daily array
      dailyData.push({
        date: date,
        total_bids: totalBids,
        total_amount: totalAmount,
        total_winning_amount: totalWinningAmount,
        profit_loss: profitLoss
      });
      
      // Add to summary
      totalSummary.total_bids += totalBids;
      totalSummary.total_amount += totalAmount;
      totalSummary.total_winning_amount += totalWinningAmount;
      totalSummary.profit_loss += profitLoss;
    }
    
    console.log('Daily data calculated:', dailyData.length, 'days');
    console.log('Total summary:', totalSummary);
    
    res.json({
      message: 'Daily profit loss data fetched successfully',
      data: {
        summary: {
          period: '7 days',
          start_date: dates[0],
          end_date: dates[dates.length - 1],
          total_bids: totalSummary.total_bids,
          total_amount: totalSummary.total_amount,
          total_winning_amount: totalSummary.total_winning_amount,
          profit_loss: totalSummary.profit_loss
        },
        daily_data: dailyData
      }
    });
  } catch (error) {
    console.error('GET DAILY PROFIT LOSS ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const getGameWiseEarning = async (req, res) => {
  try {
    console.log('=== GET GAME WISE EARNING API CALLED ===');
    
    const { date = new Date().toISOString().split('T')[0] } = req.query;
    console.log('Calculating for date:', date);
    
    // Get game-wise statistics
    const gameWiseQuery = `
      SELECT 
        g.id as game_id,
        g.game_name,
        COUNT(b.id) as total_bids,
        COALESCE(SUM(b.amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN b.status = 'won' THEN b.total_payout ELSE 0 END), 0) as total_winning_amount,
        COUNT(CASE WHEN b.status = 'won' THEN 1 END) as total_wins
      FROM games g
      LEFT JOIN bids b ON g.id = b.game_id AND b.bid_date = $1
      WHERE g.status = 'active' AND g.deleted_by IS NULL
      GROUP BY g.id, g.game_name
      ORDER BY g.game_name
    `;
    
    const result = await pool.query(gameWiseQuery, [date]);
    
    const gameWiseData = [];
    let summary = {
      total_games: 0,
      total_bids: 0,
      total_amount: 0,
      net_profit: 0,
      total_loss: 0
    };
    
    for (const row of result.rows) {
      const totalBids = parseInt(row.total_bids);
      const totalAmount = parseFloat(row.total_amount);
      const totalWinningAmount = parseFloat(row.total_winning_amount);
      const totalWins = parseInt(row.total_wins);
      const profitLoss = totalAmount - totalWinningAmount;
      const winPercentage = totalBids > 0 ? ((totalWins / totalBids) * 100).toFixed(2) : 0;
      
      // Only include games that have bids on this date
      if (totalBids > 0) {
        gameWiseData.push({
          game_id: row.game_id,
          game_name: row.game_name,
          total_bids: totalBids,
          total_amount: totalAmount,
          total_wins: totalWins,
          total_winning_amount: totalWinningAmount,
          profit_loss: profitLoss,
          win_percentage: parseFloat(winPercentage)
        });
        
        // Add to summary
        summary.total_games += 1;
        summary.total_bids += totalBids;
        summary.total_amount += totalAmount;
        summary.net_profit += profitLoss;
        
        if (profitLoss < 0) {
          summary.total_loss += Math.abs(profitLoss);
        }
      }
    }
    
    console.log('Game-wise data calculated for', gameWiseData.length, 'games');
    console.log('Summary:', summary);
    
    res.json({
      message: 'Game-wise earning data fetched successfully',
      data: {
        date: date,
        summary: {
          total_games: summary.total_games,
          total_bids: summary.total_bids,
          total_amount: summary.total_amount,
          net_profit: summary.net_profit,
          total_loss: summary.total_loss
        },
        game_wise_data: gameWiseData
      }
    });
  } catch (error) {
    console.error('GET GAME WISE EARNING ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const getUserPerformance = async (req, res) => {
  try {
    console.log('=== GET USER PERFORMANCE API CALLED ===');
    
    const { user_id } = req.params;
    const { 
      date_from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      date_to = new Date().toISOString().split('T')[0]
    } = req.query;
    
    console.log('User ID:', user_id, 'Date Range:', date_from, 'to', date_to);
    
    // Overall performance
    const overallQuery = `
      SELECT 
        COUNT(*) as total_bids,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN status = 'won' THEN total_payout ELSE 0 END), 0) as total_winning_amount,
        COUNT(CASE WHEN status = 'won' THEN 1 END) as total_wins,
        COUNT(CASE WHEN status = 'lost' THEN 1 END) as total_losses,
        COUNT(CASE WHEN status = 'submitted' THEN 1 END) as pending_bids
      FROM bids 
      WHERE user_id = $1 AND bid_date BETWEEN $2 AND $3
    `;
    
    const overallResult = await pool.query(overallQuery, [user_id, date_from, date_to]);
    const overall = overallResult.rows[0];
    
    const totalBids = parseInt(overall.total_bids);
    const totalAmount = parseFloat(overall.total_amount);
    const totalWinningAmount = parseFloat(overall.total_winning_amount);
    const netProfitLoss = totalWinningAmount - totalAmount;
    const winRate = totalBids > 0 ? ((parseInt(overall.total_wins) / totalBids) * 100).toFixed(2) : 0;
    
    // Game-wise performance
    const gameWiseQuery = `
      SELECT 
        g.id as game_id,
        g.game_name,
        COUNT(b.id) as total_bids,
        COALESCE(SUM(b.amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN b.status = 'won' THEN b.total_payout ELSE 0 END), 0) as total_winning_amount,
        COUNT(CASE WHEN b.status = 'won' THEN 1 END) as total_wins
      FROM bids b
      JOIN games g ON b.game_id = g.id
      WHERE b.user_id = $1 AND b.bid_date BETWEEN $2 AND $3
      GROUP BY g.id, g.game_name
      ORDER BY total_amount DESC
    `;
    
    const gameWiseResult = await pool.query(gameWiseQuery, [user_id, date_from, date_to]);
    
    // Daily performance
    const dailyQuery = `
      SELECT 
        bid_date,
        COUNT(*) as total_bids,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN status = 'won' THEN total_payout ELSE 0 END), 0) as total_winning_amount,
        COUNT(CASE WHEN status = 'won' THEN 1 END) as total_wins
      FROM bids 
      WHERE user_id = $1 AND bid_date BETWEEN $2 AND $3
      GROUP BY bid_date
      ORDER BY bid_date DESC
    `;
    
    const dailyResult = await pool.query(dailyQuery, [user_id, date_from, date_to]);
    
    res.json({
      message: 'User performance fetched successfully',
      data: {
        user_id: parseInt(user_id),
        date_range: { from: date_from, to: date_to },
        overall_performance: {
          total_bids: totalBids,
          total_amount: totalAmount,
          total_winning_amount: totalWinningAmount,
          net_profit_loss: netProfitLoss,
          total_wins: parseInt(overall.total_wins),
          total_losses: parseInt(overall.total_losses),
          pending_bids: parseInt(overall.pending_bids),
          win_rate: parseFloat(winRate)
        },
        game_wise_performance: gameWiseResult.rows.map(row => ({
          game_id: row.game_id,
          game_name: row.game_name,
          total_bids: parseInt(row.total_bids),
          total_amount: parseFloat(row.total_amount),
          total_winning_amount: parseFloat(row.total_winning_amount),
          net_profit_loss: parseFloat(row.total_winning_amount) - parseFloat(row.total_amount),
          total_wins: parseInt(row.total_wins),
          win_rate: parseInt(row.total_bids) > 0 ? ((parseInt(row.total_wins) / parseInt(row.total_bids)) * 100).toFixed(2) : 0
        })),
        daily_performance: dailyResult.rows.map(row => ({
          date: row.bid_date,
          total_bids: parseInt(row.total_bids),
          total_amount: parseFloat(row.total_amount),
          total_winning_amount: parseFloat(row.total_winning_amount),
          net_profit_loss: parseFloat(row.total_winning_amount) - parseFloat(row.total_amount),
          total_wins: parseInt(row.total_wins),
          win_rate: parseInt(row.total_bids) > 0 ? ((parseInt(row.total_wins) / parseInt(row.total_bids)) * 100).toFixed(2) : 0
        }))
      }
    });
  } catch (error) {
    console.error('GET USER PERFORMANCE ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const getAgentPerformance = async (req, res) => {
  try {
    console.log('=== GET AGENT PERFORMANCE API CALLED ===');
    
    const { 
      pagination = {}, 
      filters = {} 
    } = req.body;
    
    const { 
      page = 1, 
      limit = 10 
    } = pagination;
    
    const {
      date_from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      date_to = new Date().toISOString().split('T')[0]
    } = filters;
    
    const offset = (page - 1) * limit;
    
    // Summary - Total agents and their overall performance
    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT u.id) as total_agents,
        COUNT(b.id) as total_bids,
        COALESCE(SUM(b.amount), 0) as total_bid_amount,
        COALESCE(SUM(CASE WHEN b.status = 'won' THEN b.total_payout ELSE 0 END), 0) as total_winning_amount
      FROM users u
      LEFT JOIN bids b ON u.id = b.user_id AND b.bid_date BETWEEN $1 AND $2
      WHERE u.role = 'agent'
    `;
    
    const summaryResult = await pool.query(summaryQuery, [date_from, date_to]);
    const summary = summaryResult.rows[0];
    
    // Agent-wise performance with pagination
    const agentQuery = `
      SELECT 
        u.id as user_id,
        u.full_name as agent_name,
        COUNT(b.id) as total_bids,
        COALESCE(SUM(b.amount), 0) as total_bid_amount,
        COALESCE(SUM(CASE WHEN b.status = 'won' THEN b.total_payout ELSE 0 END), 0) as total_winning_amount,
        MIN(b.bid_date) as first_bid_date,
        MAX(b.bid_date) as last_bid_date
      FROM users u
      LEFT JOIN bids b ON u.id = b.user_id AND b.bid_date BETWEEN $1 AND $2
      WHERE u.role = 'agent'
      GROUP BY u.id, u.full_name
      ORDER BY total_bid_amount DESC
      LIMIT $3 OFFSET $4
    `;
    
    const agentResult = await pool.query(agentQuery, [date_from, date_to, limit, offset]);
    
    // Count total agents for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      WHERE u.role = 'agent'
    `;
    const countResult = await pool.query(countQuery);
    const totalAgents = parseInt(countResult.rows[0].total);
    
    // Process agent data
    const agentList = agentResult.rows.map(agent => {
      const totalBidAmount = parseFloat(agent.total_bid_amount);
      const totalWinningAmount = parseFloat(agent.total_winning_amount);
      const profitLoss = totalWinningAmount - totalBidAmount;
      
      return {
        user_id: agent.user_id,
        agent_name: agent.agent_name,
        total_bids: parseInt(agent.total_bids),
        total_bid_amount: totalBidAmount,
        total_winning_amount: totalWinningAmount,
        profit_loss: profitLoss,
        first_bid_date: agent.first_bid_date,
        last_bid_date: agent.last_bid_date
      };
    });
    
    res.json({
      message: 'Agent performance fetched successfully',
      data: {
        summary: {
          total_agents: parseInt(summary.total_agents),
          total_bids: parseInt(summary.total_bids),
          total_bid_amount: parseFloat(summary.total_bid_amount),
          total_winning_amount: parseFloat(summary.total_winning_amount),
          overall_profit_loss: parseFloat(summary.total_winning_amount) - parseFloat(summary.total_bid_amount),
          date_range: { from: date_from, to: date_to }
        },
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total: totalAgents,
          total_pages: Math.ceil(totalAgents / limit),
          has_next: page * limit < totalAgents,
          has_prev: page > 1
        },
        agent_list: agentList
      }
    });
  } catch (error) {
    console.error('GET AGENT PERFORMANCE ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

export { placeBids, getMyBids, getBidTypes, getAllBids, fetchBids, fetchBidsWithVillage, getUserBidsForMobile, getBidRatesByGame, getDailyProfitLoss, getGameWiseEarning, getUserPerformance, getAgentPerformance };