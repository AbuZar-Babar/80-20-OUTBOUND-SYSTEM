const twilio = require('twilio');

/**
 * Ensures Twilio credentials exist and initializes the Twilio client.
 * Throws clear configuration error if credentials are empty or missing.
 */
const getTwilioClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    const error = new Error('Twilio credentials are missing in system configuration. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in your environment variables (.env).');
    error.statusCode = 400;
    throw error;
  }

  const client = twilio(accountSid, authToken);
  return { client, fromNumber };
};

/**
 * Initiates an outbound phone call via Twilio Voice API.
 * @param {string} to Destination phone number (E.164)
 * @param {string} voiceUrl Full URL for the call voice webhook (e.g. speech recognition or TwiML)
 * @param {string} statusUrl Full URL to the call status callback endpoint
 */
const makeOutboundCall = async (to, voiceUrl, statusUrl) => {
  const { client, fromNumber } = getTwilioClient();

  const payload = {
    url: voiceUrl,
    to: to,
    from: fromNumber
  };

  if (process.env.TWILIO_RECORDING_ENABLED === 'true') {
    payload.record = true;
    if (statusUrl) {
      payload.statusCallback = statusUrl;
      payload.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed'];
      payload.recordingStatusCallback = statusUrl;
      payload.recordingStatusCallbackEvent = ['completed', 'absent'];
    }
  }

  const call = await client.calls.create(payload);

  return {
    callSid: call.sid,
    from: fromNumber,
    to: to,
    status: call.status || 'queued'
  };
};

/**
 * Sends an SMS message via Twilio Messaging API.
 * @param {string} to Recipient phone number (E.164)
 * @param {string} body SMS message content
 * @param {string} [statusCallback] Optional URL for delivery status webhook
 */
const sendSmsMessage = async (to, body, statusCallback) => {
  const { client, fromNumber } = getTwilioClient();

  const payload = {
    body: body,
    to: to,
    from: fromNumber
  };
  if (statusCallback) {
    payload.statusCallback = statusCallback;
  }

  const message = await client.messages.create(payload);

  return {
    messageSid: message.sid,
    from: fromNumber,
    to: to,
    body: body,
    status: message.status || 'queued'
  };
};

/**
 * Sends a WhatsApp message via Twilio Messaging API.
 * @param {string} to Recipient phone number (E.164)
 * @param {string} body WhatsApp message content
 * @param {string} [statusCallback] Optional URL for delivery status webhook
 */
const sendWhatsAppMessage = async (to, body, statusCallback) => {
  const { client, fromNumber } = getTwilioClient();

  const payload = {
    body: body,
    to: `whatsapp:${to}`,
    from: `whatsapp:${fromNumber}`
  };
  if (statusCallback) {
    payload.statusCallback = statusCallback;
  }

  const message = await client.messages.create(payload);

  return {
    messageSid: message.sid,
    from: fromNumber,
    to: to,
    body: body,
    status: message.status || 'queued'
  };
};

module.exports = {
  makeOutboundCall,
  sendSmsMessage,
  sendWhatsAppMessage
};
