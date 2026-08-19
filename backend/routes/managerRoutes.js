const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getDashboardMetrics, getTeamActivity, getAlerts } = require('../controllers/managerController');

router.get('/metrics', protect, getDashboardMetrics);
router.get('/activity', protect, getTeamActivity);
router.get('/alerts', protect, getAlerts);

module.exports = router;
