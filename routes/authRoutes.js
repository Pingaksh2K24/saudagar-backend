import express from 'express';
import { registerUser, loginUser, logoutUser, getAllUserList, getUserDetails, uploadFile, upload, getAllDropdowns, deleteUser, updateUser, getAgentList, updateUserStatus, getUserActivityLog } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.get('/getAllUserList',protect, getAllUserList);
router.get('/users/:id', protect, getUserDetails);
router.put('/users/:id', protect, protect, updateUser);
router.post('/update-user-status', protect, updateUserStatus);
router.post('/get-user-activity-log', protect, getUserActivityLog);
router.post('/upload', upload.single('file'), uploadFile);
router.get('/getAllDropdowns', getAllDropdowns);
router.delete('/users/:id', protect, deleteUser);
router.get('/get-agent-list', getAgentList);

export default router;