const { MessageStore } = require('../config/store');
const { validatePhoneNumber } = require('../utils/phoneValidator');
const { sendSmsMessage } = require('../services/twilioService');

// @desc    Send an SMS message
// @route   POST /api/messages
// @access  Private
const sendMessage = async (req, res, next) => {
  try {
    const { to, body } = req.body;

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

    // 3. Send SMS via Twilio Service
    const smsResult = await sendSmsMessage(recipientPhone, smsContent);

    // 4. Save record to store
    const messageRecord = await MessageStore.create({
      userId: req.user._id,
      messageSid: smsResult.messageSid,
      from: smsResult.from,
      to: smsResult.to,
      body: smsResult.body,
      status: smsResult.status
    });

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

module.exports = {
  sendMessage,
  getMessages
};
