import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { LeadStore, ActivityLogStore, SendingInboxStore, UserStore } from '@/lib/store';
import { sendEmail } from '@/lib/emailService';
import { applyMergeFields } from '@/lib/templateEngine';

export async function POST(req) {
  try {
    const user = await verifyAuth(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized access.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { leadId, subject, body: emailBody, inboxId } = body;

    if (!leadId || !subject || !emailBody) {
      return NextResponse.json(
        { success: false, message: 'leadId, subject, and body are required.' },
        { status: 400 }
      );
    }

    // Resolve sender identity
    let senderEmail = process.env.SYSTEM_FROM_EMAIL || 'onboarding@resend.dev';
    let senderName = '80/20 Outbound';
    
    if (inboxId) {
      const inbox = await SendingInboxStore.findInboxById(inboxId);
      if (inbox && inbox.active) {
        senderEmail = inbox.fromEmail;
        senderName = inbox.fromName;
      }
    } else {
      // Check default daily limit for user
      const today = new Date().toISOString().slice(0, 10);
      const userTodayInbox = await SendingInboxStore.getToday(user._id);
      const emailsSent = userTodayInbox.emailsSent || 0;
      const limit = user.dailyEmailLimit || 50;
      
      if (emailsSent >= limit) {
        await SendingInboxStore.setStatus(user._id, 'throttled');
        return NextResponse.json(
          { success: false, message: `Daily outbound limit reached (${limit}). Email blocked.` },
          { status: 429 }
        );
      }
    }

    const lead = await LeadStore.findById(leadId);
    if (!lead) {
      return NextResponse.json(
        { success: false, message: 'Lead not found.' },
        { status: 404 }
      );
    }
    if (!lead.contact?.email) {
      return NextResponse.json(
        { success: false, message: 'Lead email address is missing.' },
        { status: 400 }
      );
    }
    if (lead.suppression?.email) {
      return NextResponse.json(
        { success: false, message: 'Email outreach is suppressed for this lead.' },
        { status: 400 }
      );
    }

    const senderUser = await UserStore.findById(user._id);
    
    // Merge variables
    const mergedSubject = applyMergeFields(subject, lead, senderUser);
    const mergedBody = applyMergeFields(emailBody, lead, senderUser);

    await sendEmail({
      to: lead.contact.email,
      fromEmail: senderEmail,
      fromName: senderName,
      subject: mergedSubject,
      html: mergedBody
    });

    // Update lead record
    await LeadStore.update(leadId, {
      lastAction: `Email sent: ${mergedSubject}`,
      lastActionDate: new Date(),
      'emailSequence.lastSentDate': new Date(),
      'emailSequence.emailsSent': (lead.emailSequence?.emailsSent || 0) + 1
    });

    // Increment usage
    await SendingInboxStore.incrementEmail(user._id);
    if (inboxId) {
      await SendingInboxStore.incrementInboxUsage(inboxId);
    }

    // Log Activity
    await ActivityLogStore.create({
      leadId,
      userId: user._id,
      action: 'email',
      channel: 'email',
      direction: 'outbound',
      notes: `Subject: ${mergedSubject} (via ${senderEmail})`
    });

    return NextResponse.json({
      success: true,
      message: 'Email successfully sent.'
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err.message || 'Server error occurred.' },
      { status: 500 }
    );
  }
}
