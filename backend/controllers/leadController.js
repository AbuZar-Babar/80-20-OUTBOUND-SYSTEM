const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { LeadStore, CampaignStore, ActivityLogStore, UserStore } = require('../config/store');
const { isMongoConnected } = require('../config/db');
const Lead = require('../models/Lead');

const upload = multer({ dest: path.join(__dirname, '../../data/uploads/') });

const LEAD_STATUSES = ['new', 'no-answer', 'busy', 'voicemail', 'callback', 'send-info', 'interested', 'meeting-booked', 'not-interested', 'wrong-number', 'dnc', 'opted-out'];

const CSV_COLUMN_MAP = {
  name: ['name', 'full_name', 'fullname', 'contact_name', 'contactname'],
  phone: ['phone', 'phone_number', 'phonenumber', 'mobile', 'cell', 'telephone'],
  email: ['email', 'email_address', 'emailaddress', 'e-mail'],
  position: ['position', 'title', 'job_title', 'jobtitle', 'role'],
  company_name: ['company', 'company_name', 'companyname', 'organization', 'org'],
  company_website: ['website', 'company_website', 'companywebsite', 'url'],
  niche: ['niche', 'industry', 'sector', 'category'],
  country: ['country', 'country_code'],
  city: ['city', 'town'],
  region: ['region', 'state', 'province', 'area'],
  timezone: ['timezone', 'tz'],
  list: ['list', 'list_name', 'listname', 'source'],
  priority: ['priority', 'rank', 'score']
};

function mapCsvHeaders(headers) {
  const mapped = {};
  const lowerHeaders = headers.map(h => h.toLowerCase().trim().replace(/[\s-]+/g, '_'));
  for (const [field, aliases] of Object.entries(CSV_COLUMN_MAP)) {
    const idx = lowerHeaders.findIndex(h => aliases.includes(h));
    if (idx !== -1) mapped[field] = headers[idx];
  }
  return mapped;
}

const uploadLeads = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No CSV file uploaded.' });
    }

    const { campaignId, userId: assignTo } = req.body;
    const results = [];
    const duplicates = [];
    const errors = [];

    const filePath = req.file.path;

    await new Promise((resolve, reject) => {
      let headers = [];
      fs.createReadStream(filePath)
        .on('data', (row) => {
          if (headers.length === 0) {
            headers = Object.keys(row);
            return;
          }
          results.push(row);
        })
        .on('end', resolve)
        .on('error', reject);
    });

    const columnMap = mapCsvHeaders(results.length > 0 ? Object.keys(results[0]) : []);

    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      const leadData = {
        contact: {
          name: row[columnMap.name] || '',
          phone: row[columnMap.phone] || '',
          email: row[columnMap.email] || '',
          position: row[columnMap.position] || '',
          preferredChannel: ''
        },
        company: {
          name: row[columnMap.company_name] || '',
          website: row[columnMap.company_website] || '',
          niche: row[columnMap.niche] || '',
          notes: ''
        },
        geography: {
          country: row[columnMap.country] || '',
          city: row[columnMap.city] || '',
          region: row[columnMap.region] || '',
          timezone: row[columnMap.timezone] || 'UTC'
        },
        assignment: {
          list: row[columnMap.list] || '',
          priority: parseInt(row[columnMap.priority]) || 0,
          dateAssigned: new Date()
        },
        status: 'new',
        nextAction: 'call',
        userId: assignTo || null,
        campaignId: campaignId || null
      };

      if (!leadData.contact.name) {
        errors.push({ row: i + 2, reason: 'Missing name' });
        continue;
      }

      if (leadData.contact.phone) {
        const existing = await LeadStore.findPendingByPhone(leadData.contact.phone);
        if (existing.length > 0) {
          duplicates.push({ row: i + 2, phone: leadData.contact.phone });
          continue;
        }
      }

      if (leadData.contact.email) {
        const existing = await LeadStore.findPendingByEmail(leadData.contact.email);
        if (existing.length > 0) {
          duplicates.push({ row: i + 2, email: leadData.contact.email });
          continue;
        }
      }

      await LeadStore.create(leadData);
    }

    try { fs.unlinkSync(filePath); } catch (e) {}

    res.status(201).json({
      success: true,
      message: `Import complete. ${results.length - duplicates.length - errors.length} leads imported.`,
      data: { imported: results.length - duplicates.length - errors.length, duplicates: duplicates.length, errors: errors.length, errorDetails: errors.slice(0, 10) }
    });
  } catch (error) {
    next(error);
  }
};

const getLeads = async (req, res, next) => {
  try {
    const { status, campaignId, page = 1, limit = 50 } = req.query;
    const query = {};

    if (req.user.role === 'salesperson') {
      query.userId = req.user._id;
    } else if (req.query.userId) {
      query.userId = req.query.userId;
    }

    if (status) query.status = status;
    if (campaignId) query.campaignId = campaignId;

    if (isMongoConnected()) {
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const leads = await Lead.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean();
      const total = await Lead.countDocuments(query);
      return res.status(200).json({ success: true, count: leads.length, total, data: leads });
    }

    const leads = await LeadStore.findByUser(query.userId || req.user._id);
    res.status(200).json({ success: true, count: leads.length, total: leads.length, data: leads });
  } catch (error) {
    next(error);
  }
};

const getLeadById = async (req, res, next) => {
  try {
    const lead = await LeadStore.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    const timeline = await ActivityLogStore.findByLead(req.params.id);
    res.status(200).json({ success: true, data: { lead, timeline } });
  } catch (error) {
    next(error);
  }
};

const updateLead = async (req, res, next) => {
  try {
    const lead = await LeadStore.update(req.params.id, req.body);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    res.status(200).json({ success: true, data: lead });
  } catch (error) {
    next(error);
  }
};

const deleteLead = async (req, res, next) => {
  try {
    const deleted = await LeadStore.delete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Lead not found.' });
    res.status(200).json({ success: true, message: 'Lead deleted.' });
  } catch (error) {
    next(error);
  }
};

const getDailyQueue = async (req, res, next) => {
  try {
    const userId = req.user.role === 'salesperson' ? req.user._id : (req.query.userId || req.user._id);
    const queue = await LeadStore.findDailyQueue(userId);
    res.status(200).json({ success: true, data: queue });
  } catch (error) {
    next(error);
  }
};

const workLead = async (req, res, next) => {
  try {
    const { leadId, outcome, notes, callbackDate, duration, callSid } = req.body;

    if (!leadId || !outcome) {
      return res.status(400).json({ success: false, message: 'leadId and outcome are required.' });
    }

    if (!LEAD_STATUSES.includes(outcome)) {
      return res.status(400).json({ success: false, message: `Invalid outcome. Must be one of: ${LEAD_STATUSES.join(', ')}` });
    }

    const lead = await LeadStore.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

    const previousStatus = lead.status;

    const updateData = {
      status: outcome,
      lastAction: notes || `Call - ${outcome}`,
      lastActionDate: new Date()
    };

    switch (outcome) {
      case 'callback':
        if (!callbackDate) return res.status(400).json({ success: false, message: 'callbackDate is required for callback outcome.' });
        updateData.callbackDate = new Date(callbackDate);
        updateData.callbackNote = notes || '';
        updateData.nextAction = 'callback';
        break;
      case 'no-answer':
      case 'busy':
      case 'voicemail':
        updateData.nextAction = 'retry';
        break;
      case 'send-info':
        updateData.nextAction = 'send-email';
        break;
      case 'interested':
        updateData.nextAction = 'follow-up';
        break;
      case 'meeting-booked':
        updateData.coldOutreachStopped = true;
        updateData.nextAction = 'none';
        break;
      case 'not-interested':
      case 'wrong-number':
      case 'dnc':
      case 'opted-out':
        updateData.coldOutreachStopped = true;
        updateData.nextAction = 'none';
        if (outcome === 'dnc' || outcome === 'opted-out') {
          updateData.suppression = { phone: true, email: true, sms: true, whatsapp: true };
        }
        if (outcome === 'wrong-number') {
          updateData.suppression = { ...lead.suppression, phone: true };
        }
        break;
      default:
        updateData.nextAction = 'call';
    }

    await LeadStore.update(leadId, updateData);

    await ActivityLogStore.create({
      leadId,
      userId: req.user._id,
      action: 'call',
      channel: 'phone',
      direction: 'outbound',
      outcome,
      previousStatus,
      newStatus: outcome,
      notes: notes || '',
      duration: duration || 0,
      callSid: callSid || ''
    });

    const updatedLead = await LeadStore.findById(leadId);
    res.status(200).json({ success: true, message: 'Lead updated.', data: updatedLead });
  } catch (error) {
    next(error);
  }
};

const assignLeads = async (req, res, next) => {
  try {
    const { leadIds, userId } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ success: false, message: 'leadIds array is required.' });
    }

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required.' });
    }

    const user = await UserStore.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    let assigned = 0;
    for (const lid of leadIds) {
      await LeadStore.update(lid, { userId, 'assignment.dateAssigned': new Date() });
      await ActivityLogStore.create({ leadId: lid, userId: req.user._id, action: 'assign', notes: `Assigned to ${user.name}` });
      assigned++;
    }

    res.status(200).json({ success: true, message: `${assigned} leads assigned to ${user.name}.` });
  } catch (error) {
    next(error);
  }
};

const bulkAssign = async (req, res, next) => {
  try {
    const { campaignId, userId } = req.body;

    if (!userId) return res.status(400).json({ success: false, message: 'userId is required.' });

    const query = { userId: null };
    if (campaignId) query.campaignId = campaignId;

    if (isMongoConnected()) {
      const result = await Lead.updateMany(query, { userId, 'assignment.dateAssigned': new Date() });
      return res.status(200).json({ success: true, message: `${result.modifiedCount} leads assigned.` });
    }

    res.status(200).json({ success: true, message: 'Bulk assign completed.' });
  } catch (error) {
    next(error);
  }
};

const addNote = async (req, res, next) => {
  try {
    const { leadId, notes } = req.body;
    if (!leadId || !notes) return res.status(400).json({ success: false, message: 'leadId and notes are required.' });

    await LeadStore.update(leadId, { lastAction: notes, lastActionDate: new Date() });
    await ActivityLogStore.create({ leadId, userId: req.user._id, action: 'note', notes });

    res.status(200).json({ success: true, message: 'Note added.' });
  } catch (error) {
    next(error);
  }
};

const bookLead = async (req, res, next) => {
  try {
    const { leadId, meetingDate, meetingTimezone, closer, meetingLink } = req.body;
    if (!leadId) return res.status(400).json({ success: false, message: 'leadId is required.' });

    await LeadStore.update(leadId, {
      status: 'meeting-booked',
      coldOutreachStopped: true,
      nextAction: 'none',
      lastAction: 'Meeting booked',
      lastActionDate: new Date(),
      booking: { booked: true, meetingDate: meetingDate ? new Date(meetingDate) : null, meetingTimezone, closer, meetingLink }
    });

    await ActivityLogStore.create({ leadId, userId: req.user._id, action: 'booking', notes: `Booked with ${closer || 'closer'} for ${meetingDate || 'TBD'}` });

    const lead = await LeadStore.findById(leadId);
    res.status(200).json({ success: true, message: 'Lead booked.', data: lead });
  } catch (error) {
    next(error);
  }
};

const suppressLead = async (req, res, next) => {
  try {
    const { leadId, channel } = req.body;
    if (!leadId || !channel) return res.status(400).json({ success: false, message: 'leadId and channel are required.' });

    const lead = await LeadStore.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

    const suppression = { ...lead.suppression, [channel]: true };
    await LeadStore.update(leadId, { suppression });

    await ActivityLogStore.create({ leadId, userId: req.user._id, action: 'status-change', notes: `Channel suppressed: ${channel}` });

    res.status(200).json({ success: true, message: `${channel} channel suppressed.` });
  } catch (error) {
    next(error);
  }
};

module.exports = { upload, uploadLeads, getLeads, getLeadById, updateLead, deleteLead, getDailyQueue, workLead, assignLeads, bulkAssign, addNote, bookLead, suppressLead };
