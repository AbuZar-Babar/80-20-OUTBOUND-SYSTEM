const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { EmailTemplateStore, EmailSequenceStore } = require('../config/store');
const { processDripEmails, enrollLead } = require('../controllers/dripSequenceController');

router.get('/templates', protect, async (req, res, next) => {
  try {
    const templates = await EmailTemplateStore.findAll();
    res.status(200).json({ success: true, data: templates });
  } catch (err) { next(err); }
});

router.get('/sequences', protect, async (req, res, next) => {
  try {
    const sequences = await EmailSequenceStore.findAll();
    res.status(200).json({ success: true, data: sequences });
  } catch (err) { next(err); }
});

router.post('/sequences', protect, async (req, res, next) => {
  try {
    const { name, steps } = req.body;
    if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ success: false, message: 'name and steps array are required.' });
    }
    const seq = await EmailSequenceStore.create({ name, steps, createdBy: req.user._id, active: true });
    res.status(201).json({ success: true, data: seq });
  } catch (err) { next(err); }
});

router.put('/sequences/:id', protect, async (req, res, next) => {
  try {
    const seq = await EmailSequenceStore.update(req.params.id, req.body);
    if (!seq) return res.status(404).json({ success: false, message: 'Sequence not found.' });
    res.status(200).json({ success: true, data: seq });
  } catch (err) { next(err); }
});

router.delete('/sequences/:id', protect, async (req, res, next) => {
  try {
    const deleted = await EmailSequenceStore.delete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Sequence not found.' });
    res.status(200).json({ success: true, message: 'Sequence deleted.' });
  } catch (err) { next(err); }
});

router.post('/enroll', protect, enrollLead);
router.post('/cron/process-drip', processDripEmails);

module.exports = router;
