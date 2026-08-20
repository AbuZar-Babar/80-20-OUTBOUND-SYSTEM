const { LeadStore, ActivityLogStore, ActivityLogStore: ALS, SendingInboxStore } = require('../config/store');
const { isMongoConnected } = require('../config/db');
const ActivityLog = require('../models/ActivityLog');

async function checkEmailDailyLimit(userId) {
  const inbox = await SendingInboxStore.getToday(userId);
  return inbox.emailsSent || 0;
}

const sendEmail = async (req, res, next) => {
  try {
    const { leadId, subject, body, templateId } = req.body;

    if (!leadId || !subject || !body) {
      return res.status(400).json({ success: false, message: 'leadId, subject, and body are required.' });
    }

    const emailsToday = await checkEmailDailyLimit(req.user._id);
    const limit = req.user.dailyEmailLimit || 50;
    if (emailsToday >= limit) {
      await SendingInboxStore.setStatus(req.user._id, 'throttled');
      return res.status(429).json({ success: false, message: `Daily email limit reached (${limit}). Try again tomorrow.` });
    }

    const lead = await LeadStore.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    if (!lead.contact.email) return res.status(400).json({ success: false, message: 'Lead has no email address.' });
    if (lead.suppression?.email) return res.status(400).json({ success: false, message: 'Email channel is suppressed for this lead.' });
    if (lead.emailSequence?.status === 'stopped') {
      return res.status(400).json({ success: false, message: `Email sequence stopped (${lead.emailSequence.stopReason || 'reply/booking'}). Cold email halted.` });
    }

    let emailSent = false;
    let error = null;

    if (process.env.SENDGRID_API_KEY) {
      try {
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        await sgMail.send({
          to: lead.contact.email,
          from: process.env.EMAIL_FROM || process.env.ADMIN_EMAIL,
          subject,
          html: body
        });
        emailSent = true;
      } catch (e) {
        error = e.message;
      }
    } else {
      emailSent = true;
    }

    if (emailSent) {
      await LeadStore.update(leadId, {
        lastAction: `Email sent: ${subject}`,
        lastActionDate: new Date(),
        'emailSequence.lastSentDate': new Date(),
        'emailSequence.emailsSent': (lead.emailSequence?.emailsSent || 0) + 1
      });

      await SendingInboxStore.incrementEmail(req.user._id);

      await ActivityLogStore.create({
        leadId,
        userId: req.user._id,
        action: 'email',
        channel: 'email',
        direction: 'outbound',
        notes: `Subject: ${subject}`
      });

      res.status(200).json({ success: true, message: 'Email sent.' });
    } else {
      res.status(500).json({ success: false, message: 'Email failed.', error });
    }
  } catch (err) {
    next(err);
  }
};

const bulkEmail = async (req, res, next) => {
  try {
    const { leadIds, subject, body } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ success: false, message: 'leadIds array is required.' });
    }

    let sent = 0, failed = 0;

    for (const leadId of leadIds) {
      try {
        const lead = await LeadStore.findById(leadId);
        if (!lead || !lead.contact.email || lead.suppression?.email || lead.coldOutreachStopped || lead.emailSequence?.status === 'stopped') {
          failed++;
          continue;
        }

        if (process.env.SENDGRID_API_KEY) {
          const sgMail = require('@sendgrid/mail');
          sgMail.setApiKey(process.env.SENDGRID_API_KEY);
          await sgMail.send({
            to: lead.contact.email,
            from: process.env.EMAIL_FROM || process.env.ADMIN_EMAIL,
            subject,
            html: body
          });
        }

        await LeadStore.update(leadId, {
          lastAction: `Bulk email: ${subject}`,
          lastActionDate: new Date(),
          'emailSequence.lastSentDate': new Date(),
          'emailSequence.emailsSent': (lead.emailSequence?.emailsSent || 0) + 1
        });

        await SendingInboxStore.incrementEmail(req.user._id);

        await ActivityLogStore.create({
          leadId,
          userId: req.user._id,
          action: 'email',
          channel: 'email',
          direction: 'outbound',
          notes: `Bulk email: ${subject}`
        });

        sent++;
      } catch (e) {
        failed++;
      }
    }

    res.status(200).json({ success: true, message: `Bulk email complete. ${sent} sent, ${failed} failed.`, data: { sent, failed } });
  } catch (err) {
    next(err);
  }
};

const handleEmailWebhook = async (req, res, next) => {
  try {
    const { event, email, from, subject } = req.body;
    const emailAddr = (email || from || '').toLowerCase();

    if (event === 'bounce' || event === 'unsubscribe') {
      const leads = await LeadStore.findPendingByEmail(emailAddr);
      if (leads.length > 0) {
        const lead = leads[0];
        const reason = event === 'bounce' ? 'bounced' : 'unsubscribed';
        await LeadStore.update(lead._id, {
          suppression: { ...lead.suppression, email: true },
          coldOutreachStopped: true,
          status: event === 'bounce' ? 'not-interested' : 'opted-out',
          'emailSequence.status': 'stopped',
          'emailSequence.stopReason': reason
        });
        await ActivityLogStore.create({
          leadId: lead._id,
          userId: lead.userId || 'system',
          action: 'sequence-stopped',
          channel: 'email',
          direction: 'inbound',
          notes: `Email ${reason}: ${subject || ''}`
        });
      }
    }

    if (event === 'inbound-reply' || event === 'inbound') {
      const leads = await LeadStore.findPendingByEmail(emailAddr);
      if (leads.length > 0) {
        const lead = leads[0];
        await LeadStore.update(lead._id, {
          coldOutreachStopped: true,
          lastAction: `Inbound reply received: ${subject || '(no subject)'}`,
          lastActionDate: new Date(),
          'emailSequence.status': 'stopped',
          'emailSequence.stopReason': 'inbound-reply'
        });
        await ActivityLogStore.create({
          leadId: lead._id,
          userId: lead.userId || 'system',
          action: 'inbound-reply',
          channel: 'email',
          direction: 'inbound',
          notes: `Reply received: ${subject || '(no subject)'}`
        });
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    res.status(200).send('OK');
  }
};

const getInboxHealth = async (req, res, next) => {
  try {
    const inbox = await SendingInboxStore.getToday(req.user._id);
    const limit = req.user.dailyEmailLimit || 50;
    const emailsRemaining = Math.max(0, limit - (inbox.emailsSent || 0));
    res.status(200).json({
      success: true,
      data: {
        date: inbox.date,
        emailsSent: inbox.emailsSent || 0,
        emailLimit: limit,
        emailsRemaining,
        status: inbox.status || 'healthy'
      }
    });
  } catch (err) { next(err); }
};

module.exports = { sendEmail, bulkEmail, handleEmailWebhook, getInboxHealth };
