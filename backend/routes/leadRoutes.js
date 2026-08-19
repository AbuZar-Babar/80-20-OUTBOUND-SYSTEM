const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { upload, uploadLeads, getLeads, getLeadById, updateLead, deleteLead, getDailyQueue, workLead, assignLeads, bulkAssign, addNote, bookLead, suppressLead } = require('../controllers/leadController');

router.post('/upload', protect, upload.single('csv'), uploadLeads);
router.get('/', protect, getLeads);
router.get('/queue', protect, getDailyQueue);
router.get('/:id', protect, getLeadById);
router.put('/:id', protect, updateLead);
router.delete('/:id', protect, deleteLead);
router.post('/work', protect, workLead);
router.post('/assign', protect, assignLeads);
router.post('/bulk-assign', protect, bulkAssign);
router.post('/note', protect, addNote);
router.post('/book', protect, bookLead);
router.post('/suppress', protect, suppressLead);

module.exports = router;
