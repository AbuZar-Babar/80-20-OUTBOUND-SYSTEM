const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { CampaignStore, LeadStore } = require('../config/store');
const Lead = require('../models/Lead');
const { isMongoConnected } = require('../config/db');

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

const toggleCampaign = async (req, res, next) => {
  try {
    const campaign = await CampaignStore.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found.' });
    const newStatus = campaign.status === 'active' ? 'paused' : 'active';
    const updated = await CampaignStore.update(req.params.id, { status: newStatus });
    res.status(200).json({ success: true, data: updated });
  } catch (error) { next(error); }
};

const exportCampaignLeads = async (req, res, next) => {
  try {
    const { id } = req.params;
    let leads;
    if (isMongoConnected()) {
      leads = await Lead.find({ campaignId: id }).lean();
    } else {
      leads = await LeadStore.findByCampaign(id);
    }
    const csv = ['Name,Phone,Email,Position,Company,Status,Last Action,Assigned To'];
    for (const l of leads) {
      csv.push(`"${(l.contact?.name || '').replace(/"/g, '""')}","${l.contact?.phone || ''}","${l.contact?.email || ''}","${l.contact?.position || ''}","${(l.company?.name || '').replace(/"/g, '""')}","${l.status || ''}","${(l.lastAction || '').replace(/"/g, '""')}","${l.userId || ''}"`);
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=campaign-${id}-leads.csv`);
    res.status(200).send(csv.join('\n'));
  } catch (error) { next(error); }
};

router.get('/', protect, getCampaigns);
router.post('/', protect, createCampaign);
router.post('/:id/toggle', protect, toggleCampaign);
router.get('/:id/export', protect, exportCampaignLeads);
router.delete('/:id', protect, deleteCampaign);

module.exports = router;
