const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getTemplates, createTemplate, updateTemplate, deleteTemplate } = require('../controllers/whatsappTemplateController');

router.get('/templates', protect, getTemplates);
router.post('/templates', protect, createTemplate);
router.put('/templates/:id', protect, updateTemplate);
router.delete('/templates/:id', protect, deleteTemplate);

module.exports = router;
