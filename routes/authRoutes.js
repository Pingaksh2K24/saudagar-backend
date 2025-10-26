import express from 'express';
import { registerUser, loginUser, logoutUser, getAllUserList, getUserDetails, uploadFile, upload, getAllDropdowns, deleteUser, updateUser, getVillageList } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.get('/getAllUserList', getAllUserList);
router.get('/users/:id', getUserDetails);
router.put('/users/:id', protect, updateUser);
router.post('/upload', upload.single('file'), uploadFile);
router.get('/getAllDropdowns', getAllDropdowns);
router.delete('/users/:id', protect, deleteUser);
router.get('/village-list', getVillageList);

export default router;