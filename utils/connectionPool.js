import pool from '../config/db.js';

class ConnectionPool {
  static async getConnection() {
    const client = await pool.connect();
    const originalQuery = client.query;
    
    // Add query timing
    client.query = function(text, params) {
      const start = Date.now();
      const result = originalQuery.call(this, text, params);
      
      if (result instanceof Promise) {
        return result.then(res => {
          const duration = Date.now() - start;
          if (duration > 500) { // Log slow queries
            console.warn(`🐌 Slow Query (${duration}ms):`, text.substring(0, 100));
          }
          return res;
        });
      }
      
      return result;
    };
    
    return client;
  }

  static async executeWithRetry(queryFn, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await queryFn();
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          console.warn(`Query failed, retrying... (${i + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 100 * (i + 1))); // Exponential backoff
        }
      }
    }
    
    throw lastError;
  }

  static getPoolStats() {
    return {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    };
  }
}

export default ConnectionPool;