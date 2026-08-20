const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { LeadStore, CampaignStore, ActivityLogStore, UserStore } = require('../config/store');
const { isMongoConnected } = require('../config/db');
const Lead = require('../models/Lead');

const upload = multer({ storage: multer.memoryStorage() });

const LEAD_STATUSES = ['new', 'no-answer', 'busy', 'voicemail', 'callback', 'send-info', 'interested', 'meeting-booked', 'not-interested', 'wrong-number', 'dnc', 'opted-out'];

const AUTO_RETRY_DELAYS = {
  'no-answer': 60 * 60 * 1000,
  'busy': 30 * 60 * 1000,
  'voicemail': 2 * 60 * 60 * 1000
};

function isWithinContactHours(timezone) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      hour: 'numeric',
      hour12: false
    });
    const hour = parseInt(formatter.format(now));
    return hour >= 8 && hour < 18;
  } catch {
    return true;
  }
}

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

    await new Promise((resolve, reject) => {
      const stream = Readable.from(req.file.buffer.toString());
      let headers = [];
      stream
        .pipe(csv())
        .on('headers', (h) => { headers = h; })
        .on('data', (row) => { results.push(row); })
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

    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
    if (isMongoConnected()) {
      await Lead.updateMany({ userId, currentlyBeingWorked: true, currentlyBeingWorkedAt: { $lt: staleThreshold } }, { currentlyBeingWorked: false, currentlyBeingWorkedBy: null, currentlyBeingWorkedAt: null });
    }

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

    if (lead.currentlyBeingWorked && lead.currentlyBeingWorkedBy && lead.currentlyBeingWorkedBy.toString() !== req.user._id.toString()) {
      return res.status(423).json({ success: false, message: 'This lead is currently being worked by another salesperson. Please wait.' });
    }

    await LeadStore.update(leadId, { currentlyBeingWorked: true, currentlyBeingWorkedBy: req.user._id, currentlyBeingWorkedAt: new Date() });

    const previousStatus = lead.status;

    const updateData = {
      status: outcome,
      lastAction: notes || `Call - ${outcome}`,
      lastActionDate: new Date(),
      hasUnansweredReply: false
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
        updateData.callbackDate = new Date(Date.now() + (AUTO_RETRY_DELAYS[outcome] || 60 * 60 * 1000));
        updateData.callbackNote = `Auto-retry scheduled: ${outcome}`;
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
        updateData['emailSequence.status'] = 'stopped';
        updateData['emailSequence.stopReason'] = 'meeting-booked';
        break;
      case 'not-interested':
      case 'wrong-number':
      case 'dnc':
      case 'opted-out':
        updateData.coldOutreachStopped = true;
        updateData.nextAction = 'none';
        updateData['emailSequence.status'] = 'stopped';
        updateData['emailSequence.stopReason'] = outcome;
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

    await LeadStore.update(leadId, { ...updateData, currentlyBeingWorked: false, currentlyBeingWorkedBy: null, currentlyBeingWorkedAt: null });

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
      booking: { booked: true, meetingDate: meetingDate ? new Date(meetingDate) : null, meetingTimezone, closer, meetingLink },
      'emailSequence.status': 'stopped',
      'emailSequence.stopReason': 'meeting-booked'
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

const reassignLead = async (req, res, next) => {
  try {
    const { leadId, userId } = req.body;
    if (!leadId || !userId) return res.status(400).json({ success: false, message: 'leadId and userId are required.' });

    const lead = await LeadStore.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

    const user = await UserStore.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const previousUserId = lead.userId;
    await LeadStore.update(leadId, { userId, 'assignment.dateAssigned': new Date() });

    await ActivityLogStore.create({
      leadId,
      userId: req.user._id,
      action: 'reassign',
      notes: `Reassigned from ${previousUserId || 'unassigned'} to ${user.name}`
    });

    res.status(200).json({ success: true, message: `Lead reassigned to ${user.name}.` });
  } catch (error) {
    next(error);
  }
};

const checkContactHours = async (req, res, next) => {
  try {
    const { leadId } = req.query;
    if (!leadId) return res.status(400).json({ success: false, message: 'leadId required.' });

    const lead = await LeadStore.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

    const tz = lead.geography?.timezone || 'UTC';
    const withinHours = isWithinContactHours(tz);
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
    const localTime = formatter.format(now);

    res.status(200).json({
      success: true,
      data: {
        withinHours,
        timezone: tz,
        localTime,
        message: withinHours ? `OK to contact (${localTime} ${tz})` : `Outside contact hours (${localTime} ${tz}). Allowed: 8:00 AM - 6:00 PM`
      }
    });
  } catch (error) {
    next(error);
  }
};

const exportBookedLeads = async (req, res, next) => {
  try {
    const { format = 'json' } = req.query;
    let leads;

    if (isMongoConnected()) {
      const query = { status: 'meeting-booked' };
      if (req.user.role === 'salesperson') query.userId = req.user._id;
      leads = await Lead.find(query).sort({ 'booking.meetingDate': -1 }).lean();
    } else {
      const allLeads = await LeadStore.findByUser(req.user._id);
      leads = allLeads.filter(l => l.status === 'meeting-booked');
    }

    const exportData = leads.map(l => ({
      name: l.contact?.name || '',
      email: l.contact?.email || '',
      phone: l.contact?.phone || '',
      company: l.company?.name || '',
      meetingDate: l.booking?.meetingDate || '',
      meetingTimezone: l.booking?.meetingTimezone || '',
      closer: l.booking?.closer || '',
      meetingLink: l.booking?.meetingLink || '',
      lastAction: l.lastAction || '',
      lastActionDate: l.lastActionDate || ''
    }));

    if (format === 'csv') {
      if (exportData.length === 0) {
        return res.status(200).send('name,email,phone,company,meetingDate,meetingTimezone,closer,meetingLink\n');
      }
      const headers = Object.keys(exportData[0]).join(',');
      const rows = exportData.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      const csv = [headers, ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="booked-leads.csv"');
      return res.status(200).send(csv);
    }

    res.status(200).json({ success: true, count: exportData.length, data: exportData });
  } catch (err) { next(err); }
};

const crmHandoff = async (req, res, next) => {
  try {
    const { leadIds } = req.body;
    const webhookUrl = req.user.crmWebhookUrl;

    if (!webhookUrl) {
      return res.status(400).json({ success: false, message: 'No CRM webhook URL configured on your profile.' });
    }

    const ids = leadIds && Array.isArray(leadIds) ? leadIds : [];
    let leads;
    if (ids.length > 0) {
      leads = [];
      for (const id of ids) {
        const lead = await LeadStore.findById(id);
        if (lead) leads.push(lead);
      }
    } else {
      if (isMongoConnected()) {
        const query = { status: 'meeting-booked' };
        if (req.user.role === 'salesperson') query.userId = req.user._id;
        leads = await Lead.find(query).lean();
      } else {
        const allLeads = await LeadStore.findByUser(req.user._id);
        leads = allLeads.filter(l => l.status === 'meeting-booked');
      }
    }

    const payload = leads.map(l => ({
      name: l.contact?.name || '',
      email: l.contact?.email || '',
      phone: l.contact?.phone || '',
      company: l.company?.name || '',
      position: l.contact?.position || '',
      meetingDate: l.booking?.meetingDate || '',
      meetingTimezone: l.booking?.meetingTimezone || '',
      closer: l.booking?.closer || '',
      meetingLink: l.booking?.meetingLink || '',
      lastAction: l.lastAction || '',
      lastActionDate: l.lastActionDate || ''
    }));

    try {
      const fetch = globalThis.fetch || require('node-fetch');
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: payload, exportedBy: req.user.name, exportedAt: new Date().toISOString() })
      });
    } catch (e) {
      return res.status(500).json({ success: false, message: `Webhook delivery failed: ${e.message}` });
    }

    res.status(200).json({ success: true, message: `${payload.length} leads sent to CRM webhook.`, data: { sent: payload.length } });
  } catch (err) { next(err); }
};

module.exports = { upload, uploadLeads, getLeads, getLeadById, updateLead, deleteLead, getDailyQueue, workLead, assignLeads, bulkAssign, addNote, bookLead, suppressLead, reassignLead, checkContactHours, exportBookedLeads, crmHandoff };
