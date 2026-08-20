const twilio = require('twilio');
const { CallStore } = require('../config/store');
const { validatePhoneNumber } = require('../utils/phoneValidator');
const { makeOutboundCall } = require('../services/twilioService');

// @desc    Initiate an outbound phone call
// @route   POST /api/calls
// @access  Private
const makeCall = async (req, res, next) => {
  try {
    const { to } = req.body;

    // 1. Phone number validation
    const validation = validatePhoneNumber(to);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    const recipientPhone = validation.formattedPhone;

    // 2. Build full webhook URLs
    const hostUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const speechUrl = 'https://webhooks.twilio.com/v1/Voice/Template/voice_speech_recognition';
    const statusUrl = `${hostUrl}/api/calls/status`;

    // 3. Trigger Twilio Voice API
    const callResult = await makeOutboundCall(recipientPhone, speechUrl, statusUrl);

    // 4. Save record to store
    const callRecord = await CallStore.create({
      userId: req.user._id,
      callSid: callResult.callSid,
      from: callResult.from,
      to: callResult.to,
      status: callResult.status,
      startTime: new Date()
    });

    console.log(`[Call Controller] Call initiated - SID: ${callRecord.callSid}, To: ${callRecord.to}`);

    res.status(201).json({
      success: true,
      message: 'Call initiated successfully.',
      data: callRecord
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get call logs for the logged-in user
// @route   GET /api/calls
// @access  Private
const getCalls = async (req, res, next) => {
  try {
    const calls = await CallStore.findByUserId(req.user._id);

    res.status(200).json({
      success: true,
      message: 'Call records fetched successfully.',
      count: calls.length,
      data: calls
    });
  } catch (error) {
    next(error);
  }
};

// @desc    TwiML Webhook instruction generator for Twilio Voice
// @route   POST /api/calls/twiml
// @access  Public (Twilio Webhook)
const handleTwiml = async (req, res) => {
  try {
    const response = new twilio.twiml.VoiceResponse();
    const to = req.query.to || req.body.To;
    const callerId = process.env.TWILIO_PHONE_NUMBER;

    console.log(`[Twilio Webhook] TwiML requested for call destination: ${to}`);

    response.say('Connecting your outbound call. Please stand by.');

    if (to) {
      const dial = response.dial({ callerId: callerId });
      dial.number(to);
    } else {
      response.say('No destination phone number provided. Ending call.');
    }

    res.type('text/xml');
    res.send(response.toString());
  } catch (error) {
    console.error('[Twilio Webhook] TwiML error:', error.message);
    const response = new twilio.twiml.VoiceResponse();
    response.say('An error occurred while placing your call.');
    res.type('text/xml');
    res.send(response.toString());
  }
};

// @desc    Call status update callback endpoint for Twilio
// @route   POST /api/calls/status
// @access  Public (Twilio Webhook)
const handleStatusWebhook = async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration, RecordingSid, RecordingUrl, RecordingDuration, RecordingStatus } = req.body;

    if (RecordingSid && RecordingStatus === 'completed') {
      console.log(`[Twilio Webhook] Recording completed - SID: ${RecordingSid}, Call SID: ${CallSid}`);
      await CallStore.findOneAndUpdate({ callSid: CallSid }, {
        recordingUrl: RecordingUrl,
        recordingSid: RecordingSid,
        recordingDuration: parseInt(RecordingDuration, 10) || 0
      });
    }

    if (CallSid && CallStatus) {
      console.log(`[Twilio Webhook] Call Status update - SID: ${CallSid}, Status: ${CallStatus}, Duration: ${CallDuration}s`);
      const updateData = { status: CallStatus };

      if (CallDuration) {
        updateData.duration = parseInt(CallDuration, 10);
      }

      if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(CallStatus)) {
        updateData.endTime = new Date();
      }

      await CallStore.findOneAndUpdate({ callSid: CallSid }, updateData);
    }

    res.status(200).send('Status received');
  } catch (error) {
    console.error('[Twilio Webhook] Status update error:', error.message);
    res.status(500).send('Webhook processing error');
  }
};

module.exports = {
  makeCall,
  getCalls,
  handleTwiml,
  handleStatusWebhook
};
