const express = require('express');
const router = express.Router();
const { makeCall, getCalls, handleTwiml, handleStatusWebhook } = require('../controllers/callController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, makeCall);
router.get('/', protect, getCalls);
router.post('/twiml', handleTwiml);
router.post('/status', handleStatusWebhook);

module.exports = router;
