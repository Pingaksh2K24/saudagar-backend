import DatabaseService from './DatabaseService.js';
import SimpleCache from '../utils/simpleCache.js';

class BidService {
  async getBidTypes() {
    const cacheKey = 'bid_types_active';
    let bidTypes = SimpleCache.get(cacheKey);
    
    if (!bidTypes) {
      bidTypes = await DatabaseService.executeQuery(
        'SELECT id, display_name, bid_code FROM bid_types WHERE is_active=true ORDER BY id'
      );
      SimpleCache.set(cacheKey, bidTypes, 10 * 60 * 1000); // Cache for 10 minutes
    }
    
    return bidTypes;
  }

  async getAgentList() {
    const cacheKey = 'agents_active';
    let agents = SimpleCache.get(cacheKey);
    
    if (!agents) {
      agents = await DatabaseService.executeQuery(`
        SELECT id, full_name, mobile_number, village, created_at
        FROM users 
        WHERE role = 'agent' AND status = 'active' AND deleted_at IS NULL
        ORDER BY full_name ASC
      `);
      SimpleCache.set(cacheKey, agents, 5 * 60 * 1000); // Cache for 5 minutes
    }
    
    return agents;
  }

  async getBidRatesByGame(gameId) {
    const cacheKey = `bid_rates_game_${gameId}`;
    let rates = SimpleCache.get(cacheKey);
    
    if (!rates) {
      rates = await DatabaseService.executeQuery(`
        SELECT 
          br.id, br.game_id, br.bid_type_id, br.rate_per_rupee,
          br.min_bid_amount, br.max_bid_amount, br.is_active,
          g.game_name, bt.display_name as bid_type_name
        FROM bid_rates br
        JOIN games g ON br.game_id = g.id
        JOIN bid_types bt ON br.bid_type_id = bt.id
        WHERE br.game_id = $1
        ORDER BY br.bid_type_id
      `, [gameId]);
      SimpleCache.set(cacheKey, rates, 10 * 60 * 1000); // Cache for 10 minutes
    }
    
    return rates;
  }

  clearCache() {
    SimpleCache.clear();
  }
}

export default new BidService();