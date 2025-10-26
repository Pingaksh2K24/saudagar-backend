import express from 'express';
import { placeBids, getMyBids, getBidTypes, getAllBids, fetchBids } from '../controllers/bidController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Bid Routes
router.post('/place', protect, placeBids);
router.post('/fetch', protect, fetchBids);
router.get('/my-bids', protect, getMyBids);
router.get('/all-bids', protect, getAllBids);
router.get('/types', getBidTypes);

export default router;