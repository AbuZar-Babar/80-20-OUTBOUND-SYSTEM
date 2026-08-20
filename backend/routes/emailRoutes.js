const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getTemplates, createTemplate, updateTemplate, deleteTemplate, sendTemplateEmail } = require('../controllers/emailTemplateController');
const {
  getInboxes,
  createInbox,
  updateInbox,
  deleteInbox,
  sendEmail,
  bulkEmail,
  handleEmailWebhook,
  getInboxHealth
} = require('../controllers/emailController');

router.get('/inboxes', protect, getInboxes);
router.post('/inboxes', protect, createInbox);
router.put('/inboxes/:id', protect, updateInbox);
router.delete('/inboxes/:id', protect, deleteInbox);

router.get('/templates', protect, getTemplates);
router.post('/templates', protect, createTemplate);
router.put('/templates/:id', protect, updateTemplate);
router.delete('/templates/:id', protect, deleteTemplate);
router.post('/send-template', protect, sendTemplateEmail);
router.post('/send', protect, sendEmail);
router.post('/bulk', protect, bulkEmail);
router.get('/inbox-health', protect, getInboxHealth);
router.post('/webhook', handleEmailWebhook);

module.exports = router;
