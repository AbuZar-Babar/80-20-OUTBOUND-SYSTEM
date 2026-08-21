import sgMail from '@sendgrid/mail';

export async function sendEmail({ to, fromEmail, fromName, subject, html }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  
  if (!apiKey) {
    console.log(`[SendGrid MOCK] Sending email:
      To: ${to}
      From: ${fromName ? `"${fromName}" ` : ''}<${fromEmail}>
      Subject: ${subject}
      Body (HTML): ${html.substring(0, 200)}...
    `);
    return { success: true, mock: true };
  }

  try {
    sgMail.setApiKey(apiKey);
    const msg = {
      to,
      from: fromName ? { email: fromEmail, name: fromName } : fromEmail,
      subject,
      html
    };
    await sgMail.send(msg);
    return { success: true };
  } catch (err) {
    console.error('[SendGrid] Send error:', err.message);
    throw err;
  }
}
