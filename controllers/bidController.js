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
      'SELECT id, display_name FROM bid_types ORDER BY id'
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
      message: 'All bids fetched successfully',
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
    console.error('FETCH BIDS ERROR:', error.message);
    res.status(500).json({ message: error.message });
  }
};

export { placeBids, getMyBids, getBidTypes, getAllBids, fetchBids };