import express from 'express';
import { 
  declareResult, 
  getGameResults, 
  getGamesWithResults, 
  getGameResultHistory,
  getTodayResults,
  getTodayGameResults,
  getAllResults 
} from '../controllers/resultController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Admin Panel Routes
router.post('/declare', protect, declareResult);
router.get('/admin/:gameId', protect, getGameResults);

// App Routes (Mobile & Web)
router.get('/games-with-results', getGamesWithResults);
router.get('/:gameId/history', getGameResultHistory);
router.get('/today-results', getTodayResults);
router.get('/today-game-results', getTodayGameResults);
router.post('/all-results', getAllResults);

export default router;