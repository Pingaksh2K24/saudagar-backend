import pool from '../config/db.js';

class DatabaseService {
  async executeQuery(query, params = []) {
    try {
      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Database Query Error:', error.message);
      throw error;
    }
  }
  
  async executeTransaction(queries) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      
      for (const { query, params } of queries) {
        const result = await client.query(query, params);
        results.push(result.rows);
      }
      
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transaction Error:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  async executeWithClient(callback) {
    const client = await pool.connect();
    try {
      return await callback(client);
    } finally {
      client.release();
    }
  }
}

export default new DatabaseService();