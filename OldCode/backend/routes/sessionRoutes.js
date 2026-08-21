const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { recordLogin, heartbeat, toggleBreak, updateDialingTime, getUserSessionStats } = require('../controllers/sessionController');

router.post('/login', protect, recordLogin);
router.post('/heartbeat', protect, heartbeat);
router.post('/break/toggle', protect, toggleBreak);
router.post('/dialing-time', protect, updateDialingTime);
router.get('/stats/:userId?', protect, getUserSessionStats);

module.exports = router;
