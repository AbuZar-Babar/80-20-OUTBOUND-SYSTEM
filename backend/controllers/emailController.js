const { LeadStore, ActivityLogStore, ActivityLogStore: ALS } = require('../config/store');
const { isMongoConnected } = require('../config/db');
const ActivityLog = require('../models/ActivityLog');

async function checkEmailDailyLimit(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (isMongoConnected()) {
    const count = await ActivityLog.countDocuments({ userId, action: 'email', timestamp: { $gte: today } });
    return count;
  }
  return 0;
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
      return res.status(429).json({ success: false, message: `Daily email limit reached (${limit}). Try again tomorrow.` });
    }

    const lead = await LeadStore.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    if (!lead.contact.email) return res.status(400).json({ success: false, message: 'Lead has no email address.' });
    if (lead.suppression?.email) return res.status(400).json({ success: false, message: 'Email channel is suppressed for this lead.' });

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
        if (!lead || !lead.contact.email || lead.suppression?.email || lead.coldOutreachStopped) {
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
    const { event, email } = req.body;

    if (event === 'bounce' || event === 'unsubscribe') {
      const lead = await LeadStore.findPendingByEmail(email);
      if (lead.length > 0) {
        await LeadStore.update(lead[0]._id, {
          suppression: { ...lead[0].suppression, email: true },
          coldOutreachStopped: true,
          status: event === 'bounce' ? 'not-interested' : 'opted-out'
        });
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    res.status(200).send('OK');
  }
};

module.exports = { sendEmail, bulkEmail, handleEmailWebhook };
