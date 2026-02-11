import express from 'express';
import { addGame, getAllGames, updateGame, deleteGame, getGameById, getAgentKhatabookDetails, agentDailyKhataSettlement, updateBiddingStatus, getGameStatus } from '../controllers/gameController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/add', protect, addGame);
router.get('/all', getAllGames);
router.get('/status', getGameStatus);
router.post('/get-agent-khatabook-details', protect, getAgentKhatabookDetails);
router.post('/agent-daily-khata-settlement', protect, agentDailyKhataSettlement);
router.post('/bidding-status', protect, updateBiddingStatus);
router.get('/:id', getGameById);
router.put('/update/:id', protect, updateGame);
router.delete('/delete/:id', protect, deleteGame);

export default router;