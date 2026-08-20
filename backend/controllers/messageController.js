const { MessageStore, LeadStore, ActivityLogStore, SendingInboxStore, WhatsAppTemplateStore } = require('../config/store');
const { validatePhoneNumber } = require('../utils/phoneValidator');
const { sendSmsMessage, sendWhatsAppMessage } = require('../services/twilioService');

// @desc    Send an SMS message
// @route   POST /api/messages
// @access  Private
const sendMessage = async (req, res, next) => {
  try {
    const { to, body, leadId } = req.body;

    // 1. Validate phone number
    const validation = validatePhoneNumber(to);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    // 2. Validate message text body
    if (!body || typeof body !== 'string' || body.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message body cannot be empty.'
      });
    }

    const recipientPhone = validation.formattedPhone;
    const smsContent = body.trim();

    // 3. Build status callback URL
    const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const statusCallback = `${baseUrl}/api/messages/webhook/status`;

    // 4. Send SMS via Twilio Service
    const smsResult = await sendSmsMessage(recipientPhone, smsContent, statusCallback);

    // 5. Save record to store
    const messageRecord = await MessageStore.create({
      userId: req.user._id,
      leadId: leadId || null,
      messageSid: smsResult.messageSid,
      from: smsResult.from,
      to: smsResult.to,
      body: smsResult.body,
      status: smsResult.status,
      channel: 'sms',
      direction: 'outbound'
    });

    await SendingInboxStore.incrementSms(req.user._id);

    console.log(`[SMS Controller] SMS sent - SID: ${messageRecord.messageSid}, To: ${messageRecord.to}`);

    res.status(201).json({
      success: true,
      message: 'SMS sent successfully.',
      data: messageRecord
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get sent SMS messages for the logged-in user
// @route   GET /api/messages
// @access  Private
const getMessages = async (req, res, next) => {
  try {
    const messages = await MessageStore.findByUserId(req.user._id);

    res.status(200).json({
      success: true,
      message: 'Message records fetched successfully.',
      count: messages.length,
      data: messages
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Handle Twilio SMS status webhook (delivery/failure)
// @route   POST /api/messages/webhook/status
// @access  Public (Twilio callback)
const handleSmsStatusWebhook = async (req, res, next) => {
  try {
    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage, To } = req.body;

    if (!MessageSid) return res.status(200).send('OK');

    const updateData = { status: MessageStatus };
    if (ErrorCode) updateData.errorCode = String(ErrorCode);
    if (ErrorMessage) updateData.errorMessage = ErrorMessage;

    await MessageStore.findOneAndUpdate({ messageSid: MessageSid }, updateData);

    if (MessageStatus === 'failed' || MessageStatus === 'undelivered') {
      const leads = await LeadStore.findPendingByPhone(To);
      if (leads.length > 0) {
        const lead = leads[0];
        await ActivityLogStore.create({
          leadId: lead._id,
          userId: lead.userId || 'system',
          action: 'sms',
          channel: 'sms',
          direction: 'outbound',
          outcome: MessageStatus,
          notes: `SMS ${MessageStatus}: ${ErrorMessage || ErrorCode || 'unknown error'}`,
          messageSid: MessageSid
        });
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    res.status(200).send('OK');
  }
};

// @desc    Handle inbound SMS (Twilio webhook)
// @route   POST /api/messages/webhook/inbound
// @access  Public (Twilio callback)
const handleInboundSms = async (req, res, next) => {
  try {
    const { From, Body, MessageSid, To } = req.body;

    if (!From || !Body) {
      return res.type('text/xml').send('<Response></Response>');
    }

    const senderPhone = From;
    const messageBody = Body.trim();

    // Save inbound message
    await MessageStore.create({
      userId: 'system',
      messageSid: MessageSid || `inbound-${Date.now()}`,
      from: senderPhone,
      to: To || '',
      body: messageBody,
      status: 'received',
      channel: 'sms',
      direction: 'inbound'
    });

    // Match to a lead by phone
    const leads = await LeadStore.findPendingByPhone(senderPhone);
    if (leads.length > 0) {
      const lead = leads[0];
      await LeadStore.update(lead._id, {
        lastAction: `Inbound SMS: ${messageBody.substring(0, 100)}`,
        lastActionDate: new Date(),
        'emailSequence.status': 'stopped',
        'emailSequence.stopReason': 'inbound-sms'
      });
      await ActivityLogStore.create({
        leadId: lead._id,
        userId: lead.userId || 'system',
        action: 'sms',
        channel: 'sms',
        direction: 'inbound',
        outcome: 'inbound-reply',
        notes: messageBody.substring(0, 200),
        messageSid: MessageSid || ''
      });
    }

    res.type('text/xml').send('<Response></Response>');
  } catch (err) {
    res.type('text/xml').send('<Response></Response>');
  }
};

// @desc    Send a WhatsApp message
// @route   POST /api/messages/whatsapp
// @access  Private
const sendWhatsApp = async (req, res, next) => {
  try {
    const { to, body, leadId, templateId } = req.body;

    const validation = validatePhoneNumber(to);
    if (!validation.isValid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    let messageBody = (body || '').trim();
    let lead = null;
    let templateName = '';

    if (leadId) {
      lead = await LeadStore.findById(leadId);
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
      if (lead.suppression?.whatsapp) {
        return res.status(400).json({ success: false, message: 'WhatsApp is suppressed for this lead.' });
      }
    }

    if (templateId && !messageBody) {
      const template = await WhatsAppTemplateStore.findById(templateId);
      if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });
      templateName = template.name;
      const { applyMergeFields } = require('./whatsappTemplateController');
      messageBody = lead ? applyMergeFields(template.body, lead) : template.body;
    }

    if (!messageBody) {
      return res.status(400).json({ success: false, message: 'Message body is required (or provide templateId).' });
    }

    const recipientPhone = validation.formattedPhone;
    const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const statusCallback = `${baseUrl}/api/messages/webhook/status`;

    const result = await sendWhatsAppMessage(recipientPhone, messageBody, statusCallback);

    const messageRecord = await MessageStore.create({
      userId: req.user._id,
      leadId: leadId || null,
      messageSid: result.messageSid,
      from: result.from,
      to: result.to,
      body: result.body,
      status: result.status,
      channel: 'whatsapp',
      direction: 'outbound'
    });

    if (leadId) {
      await LeadStore.update(leadId, {
        lastAction: `WhatsApp sent${templateName ? ` (${templateName})` : ''}: ${messageBody.substring(0, 80)}`,
        lastActionDate: new Date()
      });
      await ActivityLogStore.create({
        leadId,
        userId: req.user._id,
        action: 'sms',
        channel: 'whatsapp',
        direction: 'outbound',
        notes: templateName ? `Template: ${templateName}` : messageBody.substring(0, 200),
        messageSid: result.messageSid
      });
    }

    res.status(201).json({ success: true, message: 'WhatsApp sent.', data: messageRecord });
  } catch (error) { next(error); }
};

// @desc    Handle inbound WhatsApp (Twilio webhook)
// @route   POST /api/messages/webhook/whatsapp/inbound
// @access  Public (Twilio callback)
const handleInboundWhatsApp = async (req, res, next) => {
  try {
    const { From, Body, MessageSid, To } = req.body;

    if (!From || !Body) {
      return res.type('text/xml').send('<Response></Response>');
    }

    const senderPhone = From.replace('whatsapp:', '');
    const messageBody = Body.trim();

    await MessageStore.create({
      userId: 'system',
      messageSid: MessageSid || `wa-inbound-${Date.now()}`,
      from: senderPhone,
      to: (To || '').replace('whatsapp:', ''),
      body: messageBody,
      status: 'received',
      channel: 'whatsapp',
      direction: 'inbound'
    });

    const leads = await LeadStore.findPendingByPhone(senderPhone);
    if (leads.length > 0) {
      const lead = leads[0];
      await LeadStore.update(lead._id, {
        lastAction: `Inbound WhatsApp: ${messageBody.substring(0, 100)}`,
        lastActionDate: new Date(),
        'emailSequence.status': 'stopped',
        'emailSequence.stopReason': 'inbound-whatsapp'
      });
      await ActivityLogStore.create({
        leadId: lead._id,
        userId: lead.userId || 'system',
        action: 'sms',
        channel: 'whatsapp',
        direction: 'inbound',
        outcome: 'inbound-reply',
        notes: messageBody.substring(0, 200),
        messageSid: MessageSid || ''
      });
    }

    res.type('text/xml').send('<Response></Response>');
  } catch (err) {
    res.type('text/xml').send('<Response></Response>');
  }
};

module.exports = {
  sendMessage,
  getMessages,
  handleSmsStatusWebhook,
  handleInboundSms,
  sendWhatsApp,
  handleInboundWhatsApp
};
