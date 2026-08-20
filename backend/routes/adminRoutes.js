const express = require('express');
const router = express.Router();
const { getPendingUsers, getAllUsers, approveUser, rejectUser, updateUserRole } = require('../controllers/adminController');
const { getOnlineUsers } = require('../controllers/sessionController');
const { protect } = require('../middleware/authMiddleware');

router.get('/users', protect, getAllUsers);
router.get('/users/pending', protect, getPendingUsers);
router.post('/users/:id/approve', protect, approveUser);
router.post('/users/:id/role', protect, updateUserRole);
router.delete('/users/:id/reject', protect, rejectUser);
router.get('/online-users', protect, getOnlineUsers);

module.exports = router;
