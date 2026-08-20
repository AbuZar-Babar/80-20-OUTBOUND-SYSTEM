const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe, updateProfile, getClosers } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.get('/closers', protect, getClosers);

module.exports = router;
