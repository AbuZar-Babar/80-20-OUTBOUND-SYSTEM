const { EmailTemplateStore, LeadStore, ActivityLogStore } = require('../config/store');
const { isMongoConnected } = require('../config/db');
const EmailTemplate = require('../models/EmailTemplate');
const ActivityLog = require('../models/ActivityLog');

const MERGE_FIELD_REGEX = /\{\{(\w+)\}\}/g;

function applyMergeFields(template, lead) {
  return template.replace(MERGE_FIELD_REGEX, (match, field) => {
    const key = field.toLowerCase();
    if (key === 'name' || key === 'contact_name') return lead.contact?.name || '';
    if (key === 'first_name') return (lead.contact?.name || '').split(' ')[0];
    if (key === 'phone') return lead.contact?.phone || '';
    if (key === 'email') return lead.contact?.email || '';
    if (key === 'position' || key === 'title') return lead.contact?.position || '';
    if (key === 'company' || key === 'company_name') return lead.company?.name || '';
    if (key === 'website' || key === 'company_website') return lead.company?.website || '';
    if (key === 'niche' || key === 'industry') return lead.company?.niche || '';
    if (key === 'city') return lead.geography?.city || '';
    if (key === 'country') return lead.geography?.country || '';
    return '';
  });
}

const getTemplates = async (req, res, next) => {
  try {
    const templates = await EmailTemplateStore.findAll();
    res.status(200).json({ success: true, data: templates });
  } catch (err) { next(err); }
};

const createTemplate = async (req, res, next) => {
  try {
    const { name, subject, body, category } = req.body;
    if (!name || !subject || !body) {
      return res.status(400).json({ success: false, message: 'name, subject, and body are required.' });
    }
    const mergeFields = [];
    let match;
    while ((match = MERGE_FIELD_REGEX.exec(body)) !== null) {
      if (!mergeFields.includes(match[1])) mergeFields.push(match[1]);
    }
    while ((match = MERGE_FIELD_REGEX.exec(subject)) !== null) {
      if (!mergeFields.includes(match[1])) mergeFields.push(match[1]);
    }

    const template = await EmailTemplateStore.create({
      name, subject, body, category: category || 'general', mergeFields, createdBy: req.user._id
    });
    res.status(201).json({ success: true, data: template });
  } catch (err) { next(err); }
};

const updateTemplate = async (req, res, next) => {
  try {
    const template = await EmailTemplateStore.update(req.params.id, req.body);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });
    res.status(200).json({ success: true, data: template });
  } catch (err) { next(err); }
};

const deleteTemplate = async (req, res, next) => {
  try {
    const deleted = await EmailTemplateStore.delete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Template not found.' });
    res.status(200).json({ success: true, message: 'Template deleted.' });
  } catch (err) { next(err); }
};

const sendTemplateEmail = async (req, res, next) => {
  try {
    const { leadId, templateId } = req.body;
    if (!leadId || !templateId) {
      return res.status(400).json({ success: false, message: 'leadId and templateId are required.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let emailsToday = 0;
    if (isMongoConnected()) {
      emailsToday = await ActivityLog.countDocuments({ userId: req.user._id, action: 'email', timestamp: { $gte: today } });
    }
    const limit = req.user.dailyEmailLimit || 50;
    if (emailsToday >= limit) {
      return res.status(429).json({ success: false, message: `Daily email limit reached (${limit}). Try again tomorrow.` });
    }

    const lead = await LeadStore.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    if (!lead.contact.email) return res.status(400).json({ success: false, message: 'Lead has no email.' });
    if (lead.suppression?.email) return res.status(400).json({ success: false, message: 'Email suppressed.' });

    const template = await EmailTemplateStore.findById(templateId);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });

    const subject = applyMergeFields(template.subject, lead);
    const body = applyMergeFields(template.body, lead);

    let emailSent = false;
    if (process.env.SENDGRID_API_KEY) {
      try {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        await sgMail.send({ to: lead.contact.email, from: process.env.EMAIL_FROM || process.env.ADMIN_EMAIL, subject, html: body });
        emailSent = true;
      } catch (e) { /* log error */ }
    } else {
      emailSent = true;
    }

    if (emailSent) {
      await LeadStore.update(leadId, {
        lastAction: `Template email sent: ${template.name}`,
        lastActionDate: new Date(),
        'emailSequence.lastSentDate': new Date(),
        'emailSequence.emailsSent': (lead.emailSequence?.emailsSent || 0) + 1
      });
      await ActivityLogStore.create({
        leadId, userId: req.user._id, action: 'email', channel: 'email', direction: 'outbound',
        notes: `Template: ${template.name} — Subject: ${subject}`
      });
      res.status(200).json({ success: true, message: 'Email sent from template.' });
    } else {
      res.status(500).json({ success: false, message: 'Email send failed.' });
    }
  } catch (err) { next(err); }
};

module.exports = { getTemplates, createTemplate, updateTemplate, deleteTemplate, sendTemplateEmail, applyMergeFields };
