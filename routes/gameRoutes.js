import express from 'express';
import { addGame, getAllGames } from '../controllers/gameController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/add', protect, addGame);
router.get('/all', getAllGames);

export default router;