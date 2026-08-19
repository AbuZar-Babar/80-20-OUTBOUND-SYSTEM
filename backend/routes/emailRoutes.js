const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { sendEmail, bulkEmail, handleEmailWebhook } = require('../controllers/emailController');

router.post('/send', protect, sendEmail);
router.post('/bulk', protect, bulkEmail);
router.post('/webhook', handleEmailWebhook);

module.exports = router;
