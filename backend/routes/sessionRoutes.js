const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { recordLogin, heartbeat, updateDialingTime, getUserSessionStats } = require('../controllers/sessionController');

router.post('/login', protect, recordLogin);
router.post('/heartbeat', protect, heartbeat);
router.post('/dialing-time', protect, updateDialingTime);
router.get('/stats/:userId?', protect, getUserSessionStats);

module.exports = router;
