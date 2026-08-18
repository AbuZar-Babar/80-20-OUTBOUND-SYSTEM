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
 * @param {string} twimlUrl Full URL to the TwiML webhook endpoint
 * @param {string} statusUrl Full URL to the call status callback endpoint
 */
const makeOutboundCall = async (to, twimlUrl, statusUrl) => {
  const { client, fromNumber } = getTwilioClient();

  const call = await client.calls.create({
    url: twimlUrl,
    to: to,
    from: fromNumber,
    statusCallback: statusUrl,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
  });

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
 */
const sendSmsMessage = async (to, body) => {
  const { client, fromNumber } = getTwilioClient();

  const message = await client.messages.create({
    body: body,
    to: to,
    from: fromNumber
  });

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
  sendSmsMessage
};
