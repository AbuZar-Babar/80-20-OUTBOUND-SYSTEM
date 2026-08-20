const { LeadStore, EmailTemplateStore, EmailSequenceStore, ActivityLogStore, SendingInboxStore } = require('../config/store');
const { applyMergeFields } = require('./emailTemplateController');
const Lead = require('../models/Lead');

const processDripEmails = async (req, res, next) => {
  try {
    const cronKey = req.headers['x-cron-key'] || req.query.key;
    if (cronKey && cronKey !== (process.env.CRON_SECRET || 'dialer-cron-2026')) {
      return res.status(401).json({ success: false, message: 'Unauthorized cron key.' });
    }

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    if (!require('../config/db').isMongoConnected()) {
      return res.status(200).json({ success: true, message: 'Drip processing requires MongoDB.', data: { processed, failed, skipped } });
    }

    const now = new Date();
    const pendingLeads = await Lead.find({
      'emailSequence.status': 'active',
      'emailSequence.sequenceId': { $ne: null },
      'emailSequence.nextSendAt': { $lte: now }
    }).limit(50).lean();

    for (const lead of pendingLeads) {
      try {
        const seq = await EmailSequenceStore.findById(lead.emailSequence.sequenceId);
        if (!seq || !seq.active || !seq.steps || seq.steps.length === 0) {
          await LeadStore.update(lead._id, {
            'emailSequence.status': 'stopped',
            'emailSequence.stopReason': 'sequence-completed-or-inactive'
          });
          skipped++;
          continue;
        }

        const stepIdx = lead.emailSequence.currentStep || 0;
        if (stepIdx >= seq.steps.length) {
          await LeadStore.update(lead._id, {
            'emailSequence.status': 'stopped',
            'emailSequence.stopReason': 'sequence-completed'
          });
          skipped++;
          continue;
        }

        const step = seq.steps[stepIdx];
        const template = await EmailTemplateStore.findById(step.templateId);
        if (!template) {
          skipped++;
          const nextStep = stepIdx + 1;
          const nextDelay = seq.steps[nextStep] || { delayDays: 1, delayHours: 0 };
          const nextSendAt = new Date(Date.now() + ((nextDelay.delayDays || 0) * 86400000) + ((nextDelay.delayHours || 0) * 3600000));
          await LeadStore.update(lead._id, {
            'emailSequence.currentStep': nextStep,
            'emailSequence.nextSendAt': nextSendAt
          });
          continue;
        }

        if (!lead.contact?.email || lead.suppression?.email) {
          await LeadStore.update(lead._id, {
            'emailSequence.status': 'stopped',
            'emailSequence.stopReason': 'no-email-or-suppressed'
          });
          skipped++;
          continue;
        }

        const subject = applyMergeFields(template.subject, lead);
        const body = applyMergeFields(template.body, lead);

        let emailSent = false;
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
            console.error(`[Drip] Send failed for lead ${lead._id}:`, e.message);
          }
        } else {
          emailSent = true;
        }

        if (emailSent) {
          const nextStep = stepIdx + 1;
          let nextSendAt = null;
          if (nextStep < seq.steps.length) {
            const nextDelay = seq.steps[nextStep];
            nextSendAt = new Date(Date.now() + ((nextDelay.delayDays || 0) * 86400000) + ((nextDelay.delayHours || 0) * 3600000));
          }

          await LeadStore.update(lead._id, {
            lastAction: `Drip email [${seq.name}] step ${stepIdx + 1}: ${subject}`,
            lastActionDate: new Date(),
            'emailSequence.lastSentDate': new Date(),
            'emailSequence.emailsSent': (lead.emailSequence?.emailsSent || 0) + 1,
            'emailSequence.currentStep': nextStep,
            'emailSequence.nextSendAt': nextSendAt
          });

          await SendingInboxStore.incrementEmail(lead.userId || 'system');

          await ActivityLogStore.create({
            leadId: lead._id,
            userId: lead.userId || 'system',
            action: 'email',
            channel: 'email',
            direction: 'outbound',
            notes: `Drip [${seq.name}] step ${stepIdx + 1}: ${subject}`
          });

          processed++;
        } else {
          failed++;
        }
      } catch (e) {
        console.error(`[Drip] Error processing lead ${lead._id}:`, e.message);
        failed++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Drip processing complete. ${processed} sent, ${failed} failed, ${skipped} skipped.`,
      data: { processed, failed, skipped }
    });
  } catch (err) {
    next(err);
  }
};

const enrollLead = async (req, res, next) => {
  try {
    const { leadId, sequenceId } = req.body;
    if (!leadId || !sequenceId) {
      return res.status(400).json({ success: false, message: 'leadId and sequenceId are required.' });
    }

    const lead = await LeadStore.findById(leadId);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

    const seq = await EmailSequenceStore.findById(sequenceId);
    if (!seq) return res.status(404).json({ success: false, message: 'Sequence not found.' });

    if (seq.steps.length === 0) {
      return res.status(400).json({ success: false, message: 'Sequence has no steps.' });
    }

    const firstStep = seq.steps[0];
    const nextSendAt = new Date(Date.now() + ((firstStep.delayDays || 0) * 86400000) + ((firstStep.delayHours || 0) * 3600000));

    await LeadStore.update(leadId, {
      'emailSequence.status': 'active',
      'emailSequence.sequenceId': sequenceId,
      'emailSequence.currentStep': 0,
      'emailSequence.nextSendAt': nextSendAt,
      'emailSequence.stopReason': ''
    });

    await ActivityLogStore.create({
      leadId,
      userId: req.user._id,
      action: 'status-change',
      notes: `Enrolled in drip sequence: ${seq.name}`
    });

    res.status(200).json({ success: true, message: `Lead enrolled in "${seq.name}".` });
  } catch (err) { next(err); }
};

module.exports = { processDripEmails, enrollLead };
