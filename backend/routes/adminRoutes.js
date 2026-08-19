const express = require('express');
const router = express.Router();
const { getPendingUsers, getAllUsers, approveUser, rejectUser } = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');

router.get('/users', protect, getAllUsers);
router.get('/users/pending', protect, getPendingUsers);
router.post('/users/:id/approve', protect, approveUser);
router.delete('/users/:id/reject', protect, rejectUser);

module.exports = router;
