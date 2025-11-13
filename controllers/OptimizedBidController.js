import OptimizedBidService from '../services/OptimizedBidService.js';
import BidService from '../services/BidService.js';
import { successResponse, errorResponse } from '../utils/responseFormatter.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import DataValidator from '../utils/dataValidator.js';

// Optimized version of fetchBids with better performance
export const fetchBidsOptimized = asyncHandler(async (req, res) => {
  const { pagination = {}, filters = {} } = req.body;
  
  const result = await OptimizedBidService.fetchBidsOptimized(filters, pagination);
  
  res.status(200).json(successResponse('Bids fetched successfully', result));
});

// Cached version of getBidTypes
export const getBidTypesOptimized = asyncHandler(async (req, res) => {
  const bidTypes = await BidService.getBidTypes();
  
  res.status(200).json(successResponse('Bid types fetched successfully', {
    results: bidTypes
  }));
});

// Cached version of getAgentList
export const getAgentListOptimized = asyncHandler(async (req, res) => {
  const agents = await BidService.getAgentList();
  
  res.status(200).json(successResponse('Agent list fetched successfully', {
    agents,
    total_agents: agents.length
  }));
});

// Optimized bid rates with caching
export const getBidRatesByGameOptimized = asyncHandler(async (req, res) => {
  const { game_id } = req.params;
  
  if (!game_id) {
    return res.status(200).json(errorResponse('Game ID is required', 400, { field: 'validation' }));
  }

  const rates = await BidService.getBidRatesByGame(game_id);
  
  res.status(200).json(successResponse('Bid rates fetched successfully', {
    game_id: parseInt(game_id),
    rates
  }));
});

// New endpoint for bulk game statistics
export const getBulkGameStats = asyncHandler(async (req, res) => {
  const { game_ids } = req.body;
  
  DataValidator.validateRequired({ game_ids }, ['game_ids']);
  
  if (!Array.isArray(game_ids)) {
    return res.status(200).json(errorResponse('game_ids must be an array', 400, { field: 'validation' }));
  }

  const stats = await OptimizedBidService.getBulkBidData(game_ids);
  
  res.status(200).json(successResponse('Bulk game stats fetched successfully', { stats }));
});

// Game performance dashboard
export const getGameDashboard = asyncHandler(async (req, res) => {
  const { game_id } = req.params;
  
  if (!game_id) {
    return res.status(200).json(errorResponse('Game ID is required', 400, { field: 'validation' }));
  }

  const stats = await OptimizedBidService.getGameStats(game_id);
  
  res.status(200).json(successResponse('Game dashboard data fetched successfully', {
    game_id: parseInt(game_id),
    stats
  }));
});