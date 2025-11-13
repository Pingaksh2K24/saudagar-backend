import express from 'express';
import { 
  fetchBidsOptimized, 
  getBidTypesOptimized, 
  getAgentListOptimized,
  getBidRatesByGameOptimized,
  getBulkGameStats,
  getGameDashboard
} from '../controllers/OptimizedBidController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Optimized routes with better performance
router.post('/fetch-optimized', protect, fetchBidsOptimized);
router.get('/types-optimized', protect, getBidTypesOptimized);
router.get('/agent-list-optimized', protect, getAgentListOptimized);
router.get('/rates-optimized/:game_id', protect, getBidRatesByGameOptimized);
router.post('/bulk-stats', protect, getBulkGameStats);
router.get('/dashboard/:game_id', protect, getGameDashboard);

export default router;