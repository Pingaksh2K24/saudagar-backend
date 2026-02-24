import pool from '../config/db.js';

const placeBids = async (req, res) => {
  try {
    console.log('=== PLACE BIDS API STARTED ===');
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    console.log('User Info:', req.user);
    
    const { bids, receipt } = req.body;
    const createdBy = req.user?.id;
    
    console.log('Extracted Data:');
    console.log('- Bids:', bids);
    console.log('- Receipt:', receipt);
    console.log('- Created By:', createdBy);

    if (!createdBy) {
      console.log('❌ Authentication failed - no user ID');
      return res.status(401).json({ 
        success: false,
        statusCode: 401,
        message: 'Authentication required',
        timestamp: new Date().toISOString()
      });
    }

    if (!bids || !Array.isArray(bids) || bids.length === 0) {
      console.log('❌ Bids validation failed:', { bids, isArray: Array.isArray(bids), length: bids?.length });
      return res.status(400).json({ 
        success: false,
        statusCode: 400,
        message: 'Bids array is required',
        timestamp: new Date().toISOString()
      });
    }
    console.log('✅ Bids validation passed - Count:', bids.length);

    if (
      !receipt ||
      !receipt.receipt_id ||
      !receipt.agent_id ||
      !receipt.session ||
      !receipt.receipt_date
    ) {
      console.log('❌ Receipt validation failed:', {
        hasReceipt: !!receipt,
        hasReceiptId: !!receipt?.receipt_id,
        hasAgentId: !!receipt?.agent_id,
        hasSession: !!receipt?.session,
        hasReceiptDate: !!receipt?.receipt_date
      });
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Receipt object with receipt_id, agent_id, session, and receipt_date is required',
        timestamp: new Date().toISOString()
      });
    }
    console.log('✅ Receipt validation passed');

    // Validate session value
    const validSessions = ['open', 'close'];
    console.log('Session validation:', { session: receipt.session, validSessions });
    if (!validSessions.includes(receipt.session.toLowerCase())) {
      console.log('❌ Session validation failed:', receipt.session);
      return res.status(400).json({ 
        success: false,
        statusCode: 400,
        message: 'Session must be either "open" or "close"',
        timestamp: new Date().toISOString()
      });
    }
    console.log('✅ Session validation passed');

    // Validate each bid
    console.log('Starting bid validation for', bids.length, 'bids');
    for (let i = 0; i < bids.length; i++) {
      const bid = bids[i];
      console.log(`Validating bid ${i + 1}:`, bid);     
      const required = [
        'user_id',
        'game_id',
        'game_result_id',
        'bid_type_id',
        'bid_type_label',
        'bid_number',
        'amount',
        'session_type',
      ];
      for (const field of required) {
        if (!bid[field]) {
          console.log(`❌ Bid ${i + 1} validation failed - missing ${field}:`, bid);
          return res.status(400).json({
            success: false,
            statusCode: 400,
            message: `Bid ${i + 1}: ${field} is required`,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Double Panna validation (bid_type_id = 4)
      if (bid.bid_type_id == 4 && bid.bid_number.length === 3) {
        const digits = bid.bid_number.split('');
        const digitCount = {};
        digits.forEach(d => digitCount[d] = (digitCount[d] || 0) + 1);
        
        if (!Object.values(digitCount).includes(2)) {
          console.log(`❌ Bid ${i + 1} Double Panna validation failed:`, bid.bid_number);
          return res.status(400).json({
            success: false,
            statusCode: 400,
            message: `Bid ${i + 1}: Invalid Double Panna number "${bid.bid_number}". Must have exactly one digit appearing twice (e.g., 121, 112, 223)`,
            timestamp: new Date().toISOString()
          });
        }
      }

      console.log(`✅ Bid ${i + 1} validation passed`);
    }

    console.log('🔄 Starting database transaction...');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      console.log('✅ Database transaction started');

      // Insert receipt from provided data
      console.log('📝 Inserting receipt with data:', {
        receipt_id: receipt.receipt_id,
        agent_id: receipt.agent_id,
        total_amount: receipt.total_amount,
        total_bids: receipt.total_bids,
        session: receipt.session.toLowerCase(),
        receipt_date: receipt.receipt_date,
        created_by: createdBy
      });
      
      const receiptResult = await client.query(
        `INSERT INTO receipts (
          receipt_no, agent_id, total_amount, total_bids, session, receipt_date, created_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7) 
        RETURNING id, receipt_no`,
        [
          receipt.receipt_id,
          receipt.agent_id,
          receipt.total_amount,
          receipt.total_bids,
          receipt.session.toLowerCase(),
          receipt.receipt_date,
          createdBy,
        ]
      );
      
      console.log('✅ Receipt inserted successfully:', receiptResult.rows[0]);

      const receiptTableId = receiptResult.rows[0].id; // Auto-generated ID from receipts table
      const receiptNumber = receiptResult.rows[0].receipt_no;
      
      console.log('Receipt created with ID:', receiptTableId, 'Number:', receiptNumber);

      const placedBids = [];
      const currentDate = new Date().toISOString().split('T')[0];
      console.log('Current date for bids:', currentDate);
      console.log('🔄 Starting to process', bids.length, 'bids...');

      for (let bidIndex = 0; bidIndex < bids.length; bidIndex++) {
        const bid = bids[bidIndex];
        console.log(`\n📊 Processing bid ${bidIndex + 1}/${bids.length}:`, bid);
        
        // Fetch rate_per_rupee from bid_rates table
        console.log('🔍 Fetching rate for game_id:', bid.game_id, 'bid_type_id:', bid.bid_type_id);
        const rateResult = await client.query(
          'SELECT rate_per_rupee FROM bid_rates WHERE game_id = $1 AND bid_type_id = $2',
          [bid.game_id, bid.bid_type_id]
        );
        console.log('Rate query result:', rateResult.rows);

        if (rateResult.rows.length === 0) {
          console.log('❌ Rate not found for game_id:', bid.game_id, 'bid_type_id:', bid.bid_type_id);
          throw new Error(
            `Rate not found for game_id: ${bid.game_id} and bid_type_id: ${bid.bid_type_id}`
          );
        }

        const rate = rateResult.rows[0].rate_per_rupee;
        const totalPayout = bid.amount * rate;
        console.log('💰 Calculated values:', {
          amount: bid.amount,
          rate: rate,
          totalPayout: totalPayout
        });

        console.log('📝 Inserting bid with values:', {
          user_id: parseInt(bid.user_id),
          game_id: parseInt(bid.game_id),
          game_result_id: parseInt(bid.game_result_id),
          bid_type: parseInt(bid.bid_type_id),
          bid_number: bid.bid_number,
          amount: parseFloat(bid.amount),
          rate: parseFloat(rate),
          session_type: bid.session_type,
          total_payout: parseFloat(totalPayout),
          bid_date: currentDate,
          status: 'submitted',
          receipt_id: parseInt(receiptTableId),
          created_by: parseInt(createdBy)
        });
        
        const result = await client.query(
          `INSERT INTO bids (
            user_id, game_id, game_result_id, bid_type, bid_number, 
            amount, rate, session_type, total_payout, bid_time, 
            bid_date, status, receipt_id, created_at, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'), $10, $11, $12, CURRENT_TIMESTAMP, $13) 
          RETURNING *`,
          [
            parseInt(bid.user_id),
            parseInt(bid.game_id),
            parseInt(bid.game_result_id),
            parseInt(bid.bid_type_id),
            bid.bid_number,
            parseFloat(bid.amount),
            parseFloat(rate),
            bid.session_type,
            parseFloat(totalPayout),
            currentDate,
            'submitted',
            parseInt(receiptTableId),
            parseInt(createdBy),
          ]
        );
        
        console.log('✅ Bid inserted successfully with ID:', result.rows[0].id);

        placedBids.push(result.rows[0]);
        console.log(`✅ Bid ${bidIndex + 1} processed successfully`);
      }
      
      console.log('🎉 All bids processed successfully. Total:', placedBids.length);

      console.log('💾 Committing transaction...');
      await client.query('COMMIT');
      console.log('✅ Transaction committed successfully');

      const responseData = {
        success: true,
        statusCode: 201,
        message: `${placedBids.length} bids placed successfully`,
        data: {
          receipt: {
            id: receiptTableId,
            receipt_no: receiptNumber,
            total_amount: receipt.total_amount,
            total_bids: receipt.total_bids,
            session: receipt.session,
            receipt_date: receipt.receipt_date,
          },
          bids: placedBids,
        },
        timestamp: new Date().toISOString()
      };
      
      console.log('📤 Sending success response:', responseData);
      res.status(201).json(responseData);
    } catch (error) {
      console.log('❌ Database error occurred, rolling back transaction');
      console.log('Database Error:', error.message);
      console.log('Database Error Stack:', error.stack);
      await client.query('ROLLBACK');
      throw error;
    } finally {
      console.log('🔄 Releasing database connection');
      client.release();
    }
  } catch (error) {
    console.error('=== PLACE BIDS ERROR ===');
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    console.error('Request Body:', req.body);
    console.error('User ID:', req.user?.id);
    console.error('Calculated Values - Amount:', req.body?.bids?.[0]?.amount);
    console.error('Calculated Values - Receipt Total:', req.body?.receipt?.total_amount);
    console.error('Full Error Object:', error);
    res.status(500).json({ 
      success: false,
      statusCode: 500,
      message: error.message,
      timestamp: new Date().toISOString()
    });
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
      bid_type,
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
          has_prev: page > 1,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getBidTypes = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, display_name, bid_code FROM bid_types where is_active=true ORDER BY id'
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Bid types fetched successfully',
      data: {
        results: result.rows,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch bid types',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const getAllBids = async (req, res) => {
  try {
    const { pagination = {}, filters = {} } = req.body;

    const { page = 1, limit = 10 } = pagination;

    const { date, game_id, session_type, status, bid_type, user_id } = filters;

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
          has_prev: page > 1,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const fetchBids = async (req, res) => {
  try {

    const { pagination = {}, filters = {} } = req.body;

    const { page = 1, limit = 10 } = pagination;

    const { date, game_id, session_type, status, bid_type, user_id } = filters;

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
        b.is_winner,
        b.winning_amount,
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

    res.status(200).json({
      success: true,
      statusCode: 200,
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
          has_prev: page > 1,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch bids',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const fetchBidsWithVillage = async (req, res) => {
  try {
    const { pagination = {}, filters = {} } = req.body;

    const { page = 1, limit = 10 } = pagination;

    const {
      agent_name,
      game_result_id,
      date = new Date().toISOString().split('T')[0], // Default to today
      session_type,
      status,
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
        TO_CHAR(b.bid_date, 'YYYY-MM-DD') as bid_date,
        b.status,
        b.winning_amount,
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
    if (agent_name) {
      paramCount++;
      query += ` AND LOWER(u.full_name) LIKE LOWER($${paramCount})`;
      params.push(`%${agent_name}%`);
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

    res.status(200).json({
      success: true,
      statusCode: 200,
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
          has_prev: page > 1,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch bids with village data',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const getUserBidsForMobile = async (req, res) => {
  try {

    const { user_id } = req.params;
    const { page = 1, limit = 10, status = 'all' } = req.query;

    const offset = (page - 1) * limit;

    const currentDate = new Date().toISOString().split('T')[0];

    const statusFilter = status !== 'all' ? ' AND b.status = $3' : '';
    const countParams = status !== 'all' ? [user_id, currentDate, status] : [user_id, currentDate];

    // Count total bids
    const countQuery = `
      SELECT COUNT(*) as total
      FROM bids b
      WHERE b.user_id = $1 AND b.bid_date = $2${statusFilter}
    `;
    
    const countResult = await pool.query(countQuery, countParams);
    const totalBids = parseInt(countResult.rows[0].total);

    let query = `
      SELECT 
        b.id,
        b.user_id,
        b.game_id,
        b.game_result_id,
        b.bid_type,
        b.bid_number,
        b.amount,
        b.winning_amount,
        b.session_type,
        b.created_at as created_date,
        b.status,
        g.game_name,
        bt.display_name as bid_type_name
      FROM bids b
      JOIN games g ON b.game_id = g.id
      JOIN bid_types bt ON b.bid_type::integer = bt.id
      WHERE b.user_id = $1 AND b.bid_date = $2${statusFilter}
      ORDER BY b.created_at DESC
      LIMIT $${status !== 'all' ? 4 : 3} OFFSET $${status !== 'all' ? 5 : 4}
    `;

    const queryParams = status !== 'all' 
      ? [user_id, currentDate, status, limit, offset]
      : [user_id, currentDate, limit, offset];

    const result = await pool.query(query, queryParams);

    // Simple check if more records exist
    const hasMore = result.rows.length === parseInt(limit);

    res.json({
      message: 'User bids fetched successfully',
      data: {
        bids: result.rows,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total_bids: totalBids,
          has_more: hasMore,
          next_page: hasMore ? parseInt(page) + 1 : null,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getBidRatesByGame = async (req, res) => {
  try {
    const { game_id } = req.params;

    if (!game_id) {
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'Game ID is required',
        errors: {
          field: 'validation',
        },
        timestamp: new Date().toISOString(),
      });
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


    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Bid rates fetched successfully',
      data: {
        game_id: parseInt(game_id),
        rates: result.rows,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch bid rates',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const getDailyProfitLoss = async (req, res) => {
  try {

    // Get last 7 days including today
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }

    const dailyData = [];
    let totalSummary = {
      total_bids: 0,
      total_amount: 0,
      total_winning_amount: 0,
      profit_loss: 0,
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
        profit_loss: profitLoss,
      });

      // Add to summary
      totalSummary.total_bids += totalBids;
      totalSummary.total_amount += totalAmount;
      totalSummary.total_winning_amount += totalWinningAmount;
      totalSummary.profit_loss += profitLoss;
    }

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Daily profit loss data fetched successfully',
      data: {
        summary: {
          period: '7 days',
          start_date: dates[0],
          end_date: dates[dates.length - 1],
          total_bids: totalSummary.total_bids,
          total_amount: totalSummary.total_amount,
          total_winning_amount: totalSummary.total_winning_amount,
          profit_loss: totalSummary.profit_loss,
        },
        daily_data: dailyData,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch daily profit loss data',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const getGameWiseEarning = async (req, res) => {
  try {

    const { date = new Date().toISOString().split('T')[0] } = req.query;

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
      total_loss: 0,
    };

    for (const row of result.rows) {
      const totalBids = parseInt(row.total_bids);
      const totalAmount = parseFloat(row.total_amount);
      const totalWinningAmount = parseFloat(row.total_winning_amount);
      const totalWins = parseInt(row.total_wins);
      const profitLoss = totalAmount - totalWinningAmount;
      const winPercentage =
        totalBids > 0 ? ((profitLoss / totalAmount) * 100).toFixed(2) : 0;

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
          win_percentage: parseFloat(winPercentage),
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


    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Game-wise earning data fetched successfully',
      data: {
        date: date,
        summary: {
          total_games: summary.total_games,
          total_bids: summary.total_bids,
          total_amount: summary.total_amount,
          net_profit: summary.net_profit,
          total_loss: summary.total_loss,
        },
        game_wise_data: gameWiseData,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch game-wise earning data',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const getUserPerformance = async (req, res) => {
  try {

    const { user_id } = req.params;
    const {
      date_from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      date_to = new Date().toISOString().split('T')[0],
    } = req.query;


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

    const overallResult = await pool.query(overallQuery, [
      user_id,
      date_from,
      date_to,
    ]);
    const overall = overallResult.rows[0];

    const totalBids = parseInt(overall.total_bids);
    const totalAmount = parseFloat(overall.total_amount);
    const totalWinningAmount = parseFloat(overall.total_winning_amount);
    const netProfitLoss = totalWinningAmount - totalAmount;
    const winRate =
      totalBids > 0
        ? ((parseInt(overall.total_wins) / totalBids) * 100).toFixed(2)
        : 0;

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

    const gameWiseResult = await pool.query(gameWiseQuery, [
      user_id,
      date_from,
      date_to,
    ]);

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

    const dailyResult = await pool.query(dailyQuery, [
      user_id,
      date_from,
      date_to,
    ]);

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
          win_rate: parseFloat(winRate),
        },
        game_wise_performance: gameWiseResult.rows.map((row) => ({
          game_id: row.game_id,
          game_name: row.game_name,
          total_bids: parseInt(row.total_bids),
          total_amount: parseFloat(row.total_amount),
          total_winning_amount: parseFloat(row.total_winning_amount),
          net_profit_loss:
            parseFloat(row.total_winning_amount) - parseFloat(row.total_amount),
          total_wins: parseInt(row.total_wins),
          win_rate:
            parseInt(row.total_bids) > 0
              ? (
                  (parseInt(row.total_wins) / parseInt(row.total_bids)) *
                  100
                ).toFixed(2)
              : 0,
        })),
        daily_performance: dailyResult.rows.map((row) => ({
          date: row.bid_date,
          total_bids: parseInt(row.total_bids),
          total_amount: parseFloat(row.total_amount),
          total_winning_amount: parseFloat(row.total_winning_amount),
          net_profit_loss:
            parseFloat(row.total_winning_amount) - parseFloat(row.total_amount),
          total_wins: parseInt(row.total_wins),
          win_rate:
            parseInt(row.total_bids) > 0
              ? (
                  (parseInt(row.total_wins) / parseInt(row.total_bids)) *
                  100
                ).toFixed(2)
              : 0,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAgentPerformance = async (req, res) => {
  try {

    const { pagination = {}, filters = {} } = req.body;

    const { page = 1, limit = 10 } = pagination;

    const { date = new Date().toISOString().split('T')[0] } = filters;

    const offset = (page - 1) * limit;

    // Summary - Total agents and their overall performance
    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT u.id) as total_agents,
        COUNT(b.id) as total_bids,
        COALESCE(SUM(b.amount), 0) as total_bid_amount,
        COALESCE(SUM(CASE WHEN b.status = 'won' THEN b.total_payout ELSE 0 END), 0) as total_winning_amount
      FROM users u
      LEFT JOIN bids b ON u.id = b.user_id AND b.bid_date = $1
      WHERE u.role = 'agent'
    `;

    const summaryResult = await pool.query(summaryQuery, [date]);
    const summary = summaryResult.rows[0];

    // Agent-wise performance with pagination
    const agentQuery = `
      SELECT 
        u.id as user_id,
        u.full_name as agent_name,
        COUNT(b.id) as total_bids,
        COALESCE(SUM(b.amount), 0) as total_bid_amount,
        COALESCE(SUM(CASE WHEN b.status = 'won' THEN b.total_payout ELSE 0 END), 0) as total_winning_amount
      FROM users u
      LEFT JOIN bids b ON u.id = b.user_id AND b.bid_date = $1
      WHERE u.role = 'agent' AND u.status = 'active' AND u.deleted_at IS NULL
      GROUP BY u.id, u.full_name
      ORDER BY total_bid_amount DESC
      LIMIT $2 OFFSET $3
    `;

    const agentResult = await pool.query(agentQuery, [date, limit, offset]);

    // Count total agents for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      WHERE u.role = 'agent' AND u.status = 'active' AND u.deleted_at IS NULL
    `;
    const countResult = await pool.query(countQuery);
    const totalAgents = parseInt(countResult.rows[0].total);

    // Process agent data
    const agentList = agentResult.rows.map((agent) => {
      const totalBidAmount = parseFloat(agent.total_bid_amount);
      const totalWinningAmount = parseFloat(agent.total_winning_amount);
      const profitLoss = totalBidAmount - totalWinningAmount;

      return {
        user_id: agent.user_id,
        agent_name: agent.agent_name,
        total_bids: parseInt(agent.total_bids),
        total_bid_amount: totalBidAmount,
        total_winning_amount: totalWinningAmount,
        profit_loss: profitLoss,
      };
    });

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Agent performance fetched successfully',
      data: {
        summary: {
          total_agents: parseInt(summary.total_agents),
          total_bids: parseInt(summary.total_bids),
          total_bid_amount: parseFloat(summary.total_bid_amount),
          total_winning_amount: parseFloat(summary.total_winning_amount),
          overall_profit_loss:
            parseFloat(summary.total_winning_amount) -
            parseFloat(summary.total_bid_amount),
          date: date,
        },
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total: totalAgents,
          total_pages: Math.ceil(totalAgents / limit),
          has_next: page * limit < totalAgents,
          has_prev: page > 1,
        },
        agent_list: agentList,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch agent performance data',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const getAllReceipts = async (req, res) => {
  try {

    const { pagination = {}, filters = {} } = req.body;
    const { page = 1, limit = 10 } = pagination;
    const { agent_id, date } = filters;

    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        r.id,
        r.receipt_no,
        r.agent_id,
        r.total_amount,
        r.total_bids,
        r.session,
        r.receipt_date,
        r.created_at,
        u.full_name as agent_name
      FROM receipts r
      JOIN users u ON r.agent_id = u.id
      WHERE 1=1
    `;

    let params = [];
    let paramCount = 0;

    if (agent_id) {
      paramCount++;
      query += ` AND r.agent_id = $${paramCount}`;
      params.push(agent_id);
    }

    if (date) {
      paramCount++;
      query += ` AND r.receipt_date = $${paramCount}`;
      params.push(date);
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
    query += ` ORDER BY r.created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await pool.query(query, params);

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Receipts fetched successfully',
      data: {
        receipts: result.rows,
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
      message: 'Failed to fetch receipts',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const getReceiptDetails = async (req, res) => {
  try {

    const { receipt_id } = req.params;

    if (!receipt_id) {
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'Receipt ID is required',
        errors: {
          field: 'validation',
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Get receipt details
    const receiptQuery = `
      SELECT 
        r.id,
        r.receipt_no,
        r.agent_id,
        r.total_amount,
        r.total_bids,
        r.session,
        r.receipt_date,
        r.created_at,
        u.full_name as agent_name,
        u.mobile_number as agent_mobile
      FROM receipts r
      JOIN users u ON r.agent_id = u.id
      WHERE r.id = $1
    `;

    const receiptResult = await pool.query(receiptQuery, [receipt_id]);

    if (receiptResult.rows.length === 0) {
      return res.status(200).json({
        success: false,
        statusCode: 404,
        message: 'Receipt not found',
        errors: {
          field: 'receipt_id',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const receipt = receiptResult.rows[0];

    // Get all bids for this receipt
    const bidsQuery = `
      SELECT 
        b.id as bid_id,
        b.bid_number,
        b.amount,
        b.session_type,
        b.bid_date,
        b.created_at,
        g.game_name,
        bt.display_name as bid_type_name,
        bt.bid_code,
        u.full_name as user_name
      FROM bids b
      JOIN games g ON b.game_id = g.id
      JOIN bid_types bt ON b.bid_type::integer = bt.id
      JOIN users u ON b.user_id = u.id
      WHERE b.receipt_id = $1
      ORDER BY b.created_at ASC
    `;

    const bidsResult = await pool.query(bidsQuery, [receipt_id]);

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Receipt details fetched successfully',
      data: {
        receipt_info: {
          id: receipt.id,
          receipt_no: receipt.receipt_no,
          agent_id: receipt.agent_id,
          agent_name: receipt.agent_name,
          agent_mobile: receipt.agent_mobile,
          total_amount: parseFloat(receipt.total_amount),
          total_bids: parseInt(receipt.total_bids),
          session: receipt.session,
          receipt_date: receipt.receipt_date,
          created_at: receipt.created_at,
        },
        bids: bidsResult.rows.map((bid) => ({
          bid_id: bid.bid_id,
          bid_number: bid.bid_number,
          game_name: bid.game_name,
          bid_type_name: bid.bid_type_name,
          bid_code: bid.bid_code,
          amount: parseFloat(bid.amount),
          session_type: bid.session_type,
          user_name: bid.user_name,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch receipt details',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const generateDahaghari = async (req, res) => {
  try {
    const { date, game_id, session, chart_id } = req.body;

    // Validation
    if (!date || !game_id || !session || !chart_id) {
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'date, game_id, session, and chart_id are required',
        errors: {
          field: 'validation',
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Get game name
    const gameQuery = `SELECT game_name FROM games WHERE id = $1`;
    const gameResult = await pool.query(gameQuery, [game_id]);
    
    if (gameResult.rows.length === 0) {
      return res.status(200).json({
        success: false,
        statusCode: 404,
        message: 'Game not found',
        errors: {
          field: 'game_id',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const gameName = gameResult.rows[0].game_name;

    // Get all bids for the specific date, game, and session
    // chart_id determines bid_type: 1=Single, 2=Panna, 3=Other, etc.
    let bidsQuery;

    if (chart_id == 1) {
      // Single digit - group by bid_number itself (0-9)
      bidsQuery = `
        SELECT 
          b.bid_number as grouping_key,
          b.amount
        FROM bids b
        WHERE b.bid_date = $1 
          AND b.game_id = $2 
          AND LOWER(b.session_type) = LOWER($3)
          AND b.bid_type::INTEGER = 1
          AND LENGTH(b.bid_number) = 1
          AND b.bid_number ~ '^[0-9]$'
        ORDER BY b.created_at
      `;
    } else if (chart_id == 2) {
      // Panna - group by sum of digits, then take last digit
      // Consider multiple panna bid types: Single Panna, Double Panna, Triple Panna
      bidsQuery = `
        SELECT 
          b.bid_number,
          b.amount,
          (
            (CAST(SUBSTRING(b.bid_number, 1, 1) AS INTEGER) + 
             CAST(SUBSTRING(b.bid_number, 2, 1) AS INTEGER) + 
             CAST(SUBSTRING(b.bid_number, 3, 1) AS INTEGER)) % 10
          )::TEXT as grouping_key
        FROM bids b
        WHERE b.bid_date = $1 
          AND b.game_id = $2 
          AND LOWER(b.session_type) = LOWER($3)
          AND b.bid_type::INTEGER IN (3, 4, 5)
          AND LENGTH(b.bid_number) = 3
          AND b.bid_number ~ '^[0-9]{3}$'
        ORDER BY b.created_at
      `;
    } else {
      // For other chart types, use first digit logic
      bidsQuery = `
        SELECT 
          SUBSTRING(b.bid_number, 1, 1) as grouping_key,
          b.amount
        FROM bids b
        WHERE b.bid_date = $1 
          AND b.game_id = $2 
          AND b.session_type = $3
          AND b.bid_type = $4
        ORDER BY b.created_at
      `;
    }

    const bidsResult = await pool.query(bidsQuery, 
      chart_id <= 2 ? [date, game_id, session] : [date, game_id, session, chart_id]
    );

    // Initialize dahaghari chart structure
    const dahaghari_chart = {
      number_1: [],
      number_2: [],
      number_3: [],
      number_4: [],
      number_5: [],
      number_6: [],
      number_7: [],
      number_8: [],
      number_9: [],
      number_0: [],
    };

    const number_sum = {
      number_1: 0,
      number_2: 0,
      number_3: 0,
      number_4: 0,
      number_5: 0,
      number_6: 0,
      number_7: 0,
      number_8: 0,
      number_9: 0,
      number_0: 0,
    };

    // Process bids and group by digit
    bidsResult.rows.forEach(bid => {
      const digit = bid.grouping_key;
      const amount = parseFloat(bid.amount);
      
      if (digit >= '0' && digit <= '9') {
        const key = `number_${digit}`;
        dahaghari_chart[key].push(amount);
        number_sum[key] += amount;
      }
    });

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Dahaghari chart generated successfully',
      data: {
        date: date,
        game_name: gameName,
        chart_id: parseInt(chart_id),
        session: session,
        dahaghari_chart: dahaghari_chart,
        number_sum: number_sum,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('=== GENERATE DAHAGHARI ERROR ===');
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    console.error('Request Body:', req.body);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to generate dahaghari chart',
      error_details: error.message,
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const getReceiptByAgentId = async (req, res) => {
  try {

    const { agent_id } = req.params;
    const { date, page = 1, limit = 10 } = req.query;

    if (!agent_id) {
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'Agent ID is required',
        errors: {
          field: 'validation',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const currentDate = date || new Date().toISOString().split('T')[0];
    const offset = (page - 1) * limit;

    // Count total receipts
    const countQuery = `
      SELECT COUNT(*) as total
      FROM receipts r
      WHERE r.agent_id = $1 AND r.receipt_date = $2
    `;
    
    const countResult = await pool.query(countQuery, [agent_id, currentDate]);
    const totalReceipts = parseInt(countResult.rows[0].total);

    const query = `
      SELECT 
        r.id,
        r.receipt_no,
        r.agent_id,
        r.total_amount,
        r.total_bids,
        r.session,
        r.receipt_date,
        r.created_at,
        u.full_name as agent_name
      FROM receipts r
      JOIN users u ON r.agent_id = u.id
      WHERE r.agent_id = $1 AND r.receipt_date = $2
      ORDER BY r.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const result = await pool.query(query, [agent_id, currentDate, limit, offset]);

    // Check if more records exist
    const hasMore = result.rows.length === parseInt(limit);

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Agent receipts fetched successfully',
      data: {
        agent_id: parseInt(agent_id),
        agent_name: result.rows.length > 0 ? result.rows[0].agent_name : null,
        date: currentDate,
        total_receipts_for_date: totalReceipts,
        receipts: result.rows,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total_receipts: totalReceipts,
          has_more: hasMore,
          next_page: hasMore ? parseInt(page) + 1 : null,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch agent receipts',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const generateReceipt = async (req, res) => {
  try {
    const { bid_id } = req.params;

    if (!bid_id) {
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'Bid ID is required',
        errors: {
          field: 'validation',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const receiptQuery = `
      SELECT 
        b.id as bid_id,
        b.bid_number,
        b.amount,
        b.total_payout,
        b.session_type,
        b.bid_date,
        b.status,
        b.created_at,
        g.game_name,
        bt.display_name as bid_type,
        u.full_name as user_name,
        u.mobile_number
      FROM bids b
      JOIN games g ON b.game_id = g.id
      JOIN bid_types bt ON b.bid_type::integer = bt.id
      JOIN users u ON b.user_id = u.id
      WHERE b.id = $1
    `;

    const result = await pool.query(receiptQuery, [bid_id]);

    if (result.rows.length === 0) {
      return res.status(200).json({
        success: false,
        statusCode: 404,
        message: 'Bid not found',
        errors: {
          field: 'bid_id',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const receipt = result.rows[0];

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Receipt generated successfully',
      data: {
        receipt: {
          bid_id: receipt.bid_id,
          bid_number: receipt.bid_number,
          game_name: receipt.game_name,
          bid_type: receipt.bid_type,
          session_type: receipt.session_type,
          amount: parseFloat(receipt.amount),
          total_payout: parseFloat(receipt.total_payout),
          status: receipt.status,
          bid_date: receipt.bid_date,
          created_at: receipt.created_at,
          user_details: {
            name: receipt.user_name,
            mobile: receipt.mobile_number,
          },
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to generate receipt',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const getHighRiskBids = async (req, res) => {
  try {

    const { pagination = {}, filters = {} } = req.body;

    const { page = 1, limit = 10 } = pagination;

    const {
      date = new Date().toISOString().split('T')[0],
      game_name,
      top_quantity = 25,
    } = filters;


    const offset = (page - 1) * limit;

    // Build query with filters
    let gameFilter = '';
    let params = [date, top_quantity];
    let paramCount = 2;

    if (game_name) {
      paramCount++;
      gameFilter = ` AND LOWER(g.game_name) LIKE LOWER($${paramCount})`;
      params.push(`%${game_name}%`);
    }

    // Get high risk bids with filters
    const highRiskQuery = `
      WITH ranked_bids AS (
        SELECT 
          b.id as bid_id,
          b.game_id,
          b.game_result_id as result_id,
          b.bid_number,
          b.amount,
          b.session_type,
          g.game_name,
          bt.display_name as bid_type_name,
          u.village,
          agent.full_name as agent_name,
          ROW_NUMBER() OVER (PARTITION BY b.game_id ORDER BY b.amount DESC) as rank
        FROM bids b
        JOIN games g ON b.game_id = g.id
        JOIN bid_types bt ON b.bid_type::integer = bt.id
        JOIN users u ON b.user_id = u.id
        LEFT JOIN users agent ON agent.role = 'agent' AND agent.village = u.village
        WHERE b.bid_date = $1 ${gameFilter}
      )
      SELECT 
        bid_id,
        game_id,
        result_id,
        agent_name,
        game_name,
        bid_type_name,
        bid_number,
        amount,
        village,
        session_type
      FROM ranked_bids
      WHERE rank <= $2
      ORDER BY amount DESC
    `;

    // Count total records
    const countQuery = `
      WITH ranked_bids AS (
        SELECT 
          b.id as bid_id,
          ROW_NUMBER() OVER (PARTITION BY b.game_id ORDER BY b.amount DESC) as rank
        FROM bids b
        JOIN games g ON b.game_id = g.id
        WHERE b.bid_date = $1 ${gameFilter}
      )
      SELECT COUNT(*) as total
      FROM ranked_bids
      WHERE rank <= $2
    `;

    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Add pagination
    paramCount++;
    const finalQuery =
      highRiskQuery + ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(finalQuery, params);

    // Calculate summary
    let totalHighRiskAmount = 0;
    const processedBids = result.rows.map((bid) => {
      const amount = parseFloat(bid.amount);
      totalHighRiskAmount += amount;

      return {
        bid_id: bid.bid_id,
        game_id: bid.game_id,
        result_id: bid.result_id,
        agent_name: bid.agent_name,
        game_name: bid.game_name,
        bid_type_name: bid.bid_type_name,
        bid_number: bid.bid_number,
        amount: amount,
        village: bid.village,
        session_type: bid.session_type,
      };
    });

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'High risk bids fetched successfully',
      data: {
        date: date,
        summary: {
          total_high_risk_bids: total,
          current_page_bids: result.rows.length,
          current_page_amount: totalHighRiskAmount,
          top_quantity: parseInt(top_quantity),
        },
        bids: processedBids,
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
      message: 'Failed to fetch high risk bids',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const updateGameRate = async (req, res) => {
  try {

    const { rates } = req.body;
    const updatedBy = req.user?.id;

    if (!rates || !Array.isArray(rates) || rates.length === 0) {
      return res.status(200).json({
        success: false,
        statusCode: 400,
        message: 'rates array is required',
        errors: {
          field: 'validation',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updatedRates = [];

      for (const rate of rates) {
        const {
          game_id,
          bid_type_id,
          rate_per_rupee,
          min_bid_amount,
          max_bid_amount,
          is_active,
        } = rate;

        if (!game_id || !bid_type_id) {
          throw new Error('game_id and bid_type_id are required for each rate');
        }

        const existingRate = await client.query(
          'SELECT * FROM bid_rates WHERE game_id = $1 AND bid_type_id = $2',
          [game_id, bid_type_id]
        );

        let result;

        if (existingRate.rows.length > 0) {
          result = await client.query(
            `UPDATE bid_rates SET 
              rate_per_rupee = COALESCE($1, rate_per_rupee),
              min_bid_amount = COALESCE($2, min_bid_amount),
              max_bid_amount = COALESCE($3, max_bid_amount),
              is_active = COALESCE($4, is_active),
              updated_by = $5,
              updated_at = CURRENT_TIMESTAMP
            WHERE game_id = $6 AND bid_type_id = $7
            RETURNING *`,
            [
              rate_per_rupee,
              min_bid_amount,
              max_bid_amount,
              is_active,
              updatedBy,
              game_id,
              bid_type_id,
            ]
          );
        } else {
          result = await client.query(
            `INSERT INTO bid_rates (
              game_id, bid_type_id, rate_per_rupee, min_bid_amount, 
              max_bid_amount, is_active, created_by, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
            RETURNING *`,
            [
              game_id,
              bid_type_id,
              rate_per_rupee,
              min_bid_amount,
              max_bid_amount,
              is_active,
              updatedBy,
            ]
          );
        }

        updatedRates.push(result.rows[0]);
      }

      await client.query('COMMIT');

      res.status(200).json({
        success: true,
        statusCode: 200,
        message: `${updatedRates.length} game rates updated successfully`,
        data: {
          rates: updatedRates,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to update game rates',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

const getAgentList = async (req, res) => {
  try {
    const query = `
      SELECT 
        id,
        full_name,
        mobile_number,
        village,
        created_at
      FROM users 
      WHERE role = 'agent' AND status = 'active' AND deleted_at IS NULL
      ORDER BY full_name ASC
    `;

    const result = await pool.query(query);

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Agent list fetched successfully',
      data: {
        agents: result.rows,
        total_agents: result.rows.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('=== GET AGENT LIST ERROR ===');
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    res.status(200).json({
      success: false,
      statusCode: 500,
      message: 'Failed to fetch agent list',
      errors: {
        field: 'server',
      },
      timestamp: new Date().toISOString(),
    });
  }
};

export {
  placeBids,
  getMyBids,
  getBidTypes,
  getAllBids,
  fetchBids,
  fetchBidsWithVillage,
  getUserBidsForMobile,
  getBidRatesByGame,
  getDailyProfitLoss,
  getGameWiseEarning,
  getUserPerformance,
  getAgentPerformance,
  getHighRiskBids,
  updateGameRate,
  generateReceipt,
  getAllReceipts,
  getReceiptByAgentId,
  getReceiptDetails,
  generateDahaghari,
  getAgentList,
};
