import DatabaseService from './DatabaseService.js';
import SimpleCache from '../utils/simpleCache.js';
import QueryOptimizer from '../utils/queryOptimizer.js';
import PerformanceMonitor from '../utils/performanceMonitor.js';
import DataValidator from '../utils/dataValidator.js';

class OptimizedBidService {
  async fetchBidsOptimized(filters = {}, pagination = {}) {
    const timer = PerformanceMonitor.startTimer('fetchBidsOptimized');
    
    try {
      const { page, limit } = DataValidator.validatePagination(pagination.page, pagination.limit);
      const offset = (page - 1) * limit;

      // Build optimized query
      const baseQuery = `
        SELECT 
          b.id, b.user_id, b.game_id, b.game_result_id, b.bid_type,
          bt.display_name as bid_type_name, b.bid_number, b.amount,
          b.rate, b.session_type, TO_CHAR(b.bid_date, 'YYYY-MM-DD') as bid_date,
          b.status, b.is_winner, b.winning_amount, g.game_name, u.full_name,
          gr.open_result, gr.close_result
        FROM bids b
        JOIN games g ON b.game_id = g.id
        JOIN users u ON b.user_id = u.id
        JOIN bid_types bt ON b.bid_type::integer = bt.id
        LEFT JOIN game_results gr ON b.game_result_id = gr.id
      `;

      const { whereClause, params, nextParamIndex } = QueryOptimizer.buildWhereClause({
        'b.bid_date': filters.date,
        'b.game_id': filters.game_id,
        'b.session_type': filters.session_type,
        'b.status': filters.status,
        'b.bid_type': filters.bid_type,
        'b.user_id': filters.user_id
      });

      // Get count and data in parallel
      const countQuery = QueryOptimizer.countQuery(baseQuery + ' ' + whereClause);
      const dataQuery = `${baseQuery} ${whereClause} ORDER BY b.created_at DESC LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}`;

      const [countResult, dataResult] = await Promise.all([
        DatabaseService.executeQuery(countQuery, params),
        DatabaseService.executeQuery(dataQuery, [...params, limit, offset])
      ]);

      const total = parseInt(countResult[0].total);
      
      PerformanceMonitor.endTimer(timer);
      
      return {
        bids: dataResult,
        pagination: {
          current_page: page,
          per_page: limit,
          total,
          total_pages: Math.ceil(total / limit),
          has_next: page * limit < total,
          has_prev: page > 1,
        }
      };
    } catch (error) {
      PerformanceMonitor.endTimer(timer);
      throw error;
    }
  }

  async getBulkBidData(gameIds) {
    const cacheKey = `bulk_bid_data_${gameIds.join('_')}`;
    let data = SimpleCache.get(cacheKey);
    
    if (!data) {
      const placeholders = gameIds.map((_, index) => `$${index + 1}`).join(',');
      const query = `
        SELECT game_id, COUNT(*) as total_bids, SUM(amount) as total_amount
        FROM bids 
        WHERE game_id IN (${placeholders}) AND bid_date = CURRENT_DATE
        GROUP BY game_id
      `;
      
      data = await DatabaseService.executeQuery(query, gameIds);
      SimpleCache.set(cacheKey, data, 2 * 60 * 1000); // 2 minutes cache
    }
    
    return data;
  }

  async getGameStats(gameId) {
    const cacheKey = `game_stats_${gameId}_${new Date().toDateString()}`;
    let stats = SimpleCache.get(cacheKey);
    
    if (!stats) {
      const query = `
        SELECT 
          COUNT(*) as total_bids,
          COUNT(CASE WHEN status = 'won' THEN 1 END) as won_bids,
          COUNT(CASE WHEN status = 'lost' THEN 1 END) as lost_bids,
          COUNT(CASE WHEN status = 'submitted' THEN 1 END) as pending_bids,
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(SUM(CASE WHEN status = 'won' THEN winning_amount ELSE 0 END), 0) as total_winnings
        FROM bids 
        WHERE game_id = $1 AND bid_date = CURRENT_DATE
      `;
      
      const result = await DatabaseService.executeQuery(query, [gameId]);
      stats = result[0];
      SimpleCache.set(cacheKey, stats, 5 * 60 * 1000); // 5 minutes cache
    }
    
    return stats;
  }
}

export default new OptimizedBidService();