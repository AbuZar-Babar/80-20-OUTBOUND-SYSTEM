const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { CampaignStore } = require('../config/store');

const getCampaigns = async (req, res, next) => {
  try {
    const campaigns = await CampaignStore.findAll();
    res.status(200).json({ success: true, count: campaigns.length, data: campaigns });
  } catch (error) { next(error); }
};

const createCampaign = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Campaign name is required.' });
    const campaign = await CampaignStore.create({ name, description: description || '', createdBy: req.user._id });
    res.status(201).json({ success: true, data: campaign });
  } catch (error) { next(error); }
};

const deleteCampaign = async (req, res, next) => {
  try {
    const deleted = await CampaignStore.delete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Campaign not found.' });
    res.status(200).json({ success: true, message: 'Campaign deleted.' });
  } catch (error) { next(error); }
};

router.get('/', protect, getCampaigns);
router.post('/', protect, createCampaign);
router.delete('/:id', protect, deleteCampaign);

module.exports = router;
