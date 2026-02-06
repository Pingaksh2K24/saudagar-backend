import express from 'express';
import { placeBids, getMyBids, getBidTypes, getAllBids, fetchBids, fetchBidsWithVillage, getUserBidsForMobile, getBidRatesByGame, getDailyProfitLoss, getGameWiseEarning, getUserPerformance, getAgentPerformance, getHighRiskBids, updateGameRate, generateReceipt, getAllReceipts, getReceiptByAgentId, getReceiptDetails, generateDahaghari, getAgentList } from '../controllers/bidController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Bid Routes
router.post('/place', protect, placeBids);
router.post('/fetch', protect, fetchBids);
router.post('/fetch-admin-bids', protect, fetchBidsWithVillage);
router.get('/user/:user_id/mobile',protect, getUserBidsForMobile);
router.get('/rates/game/:game_id', protect, getBidRatesByGame);
router.put('/update-game-rate', protect, updateGameRate);
router.get('/daily-profit-loss', protect, getDailyProfitLoss);
router.get('/game-wise-earning', protect, getGameWiseEarning);
router.post('/high-risk-bids', protect, getHighRiskBids);
router.get('/user-performance/:user_id', protect, getUserPerformance);
router.post('/agent-performance', protect, getAgentPerformance);
router.get('/my-bids', protect, getMyBids);
router.get('/all-bids', protect, getAllBids);
router.get('/types', protect,getBidTypes);
router.get('/generate-receipt/:bid_id', protect, generateReceipt);
router.post('/get-all-receipts', protect, getAllReceipts);
router.get('/get-receipt-by-agent/:agent_id', protect, getReceiptByAgentId);
router.get('/receipt-details/:receipt_id', protect, getReceiptDetails);
router.get('/agent-list', protect, getAgentList);
router.post('/generate-dahaghari', protect, generateDahaghari);

export default router;