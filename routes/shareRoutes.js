import express from 'express';
import { generateShareMessage } from '../controllers/shareController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/generate', protect, generateShareMessage);

export default router;