const express = require('express');
const router = express.Router();
const { sendMessage, getMessages, handleSmsStatusWebhook, handleInboundSms, sendWhatsApp, handleInboundWhatsApp } = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, sendMessage);
router.get('/', protect, getMessages);
router.post('/whatsapp', protect, sendWhatsApp);
router.post('/webhook/status', handleSmsStatusWebhook);
router.post('/webhook/inbound', handleInboundSms);
router.post('/webhook/whatsapp/inbound', handleInboundWhatsApp);

module.exports = router;
