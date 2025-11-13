import pool from '../config/db.js';
import SimpleCache from './simpleCache.js';
import ConnectionPool from './connectionPool.js';

class HealthCheck {
  static async checkDatabase() {
    try {
      const result = await pool.query('SELECT 1 as health');
      return { status: 'healthy', response_time: Date.now() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  static checkCache() {
    try {
      const testKey = 'health_check_test';
      SimpleCache.set(testKey, 'test_value');
      const value = SimpleCache.get(testKey);
      SimpleCache.delete(testKey);
      
      return { 
        status: value === 'test_value' ? 'healthy' : 'unhealthy',
        cache_size: SimpleCache.size()
      };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  static getSystemHealth() {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    return {
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
      },
      database_pool: ConnectionPool.getPoolStats()
    };
  }

  static async getFullHealthReport() {
    const [dbHealth, cacheHealth] = await Promise.all([
      this.checkDatabase(),
      Promise.resolve(this.checkCache())
    ]);

    return {
      timestamp: new Date().toISOString(),
      overall_status: dbHealth.status === 'healthy' && cacheHealth.status === 'healthy' ? 'healthy' : 'degraded',
      services: {
        database: dbHealth,
        cache: cacheHealth,
        system: this.getSystemHealth()
      }
    };
  }
}

export default HealthCheck;