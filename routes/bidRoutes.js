import express from 'express';
import { placeBids, getMyBids, getBidTypes, getAllBids, fetchBids, fetchBidsWithVillage, getUserBidsForMobile } from '../controllers/bidController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Bid Routes
router.post('/place', protect, placeBids);
router.post('/fetch', protect, fetchBids);
router.post('/fetch-admin-bids', protect, fetchBidsWithVillage);
router.get('/user/:user_id/mobile', getUserBidsForMobile);
router.get('/my-bids', protect, getMyBids);
router.get('/all-bids', protect, getAllBids);
router.get('/types', getBidTypes);

export default router;