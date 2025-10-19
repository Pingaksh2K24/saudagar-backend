import express from 'express';
import { addGame, getAllGames, updateGame, deleteGame, getGameById } from '../controllers/gameController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/add', protect, addGame);
router.get('/all', getAllGames);
router.get('/:id', getGameById);
router.put('/update/:id', protect, updateGame);
router.delete('/delete/:id', protect, deleteGame);

export default router;