import { Resend } from 'resend';

// Only initialize Resend if API key is present and looks valid
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY && RESEND_API_KEY.startsWith('re_') ? new Resend(RESEND_API_KEY) : null;
const NOTIFICATION_EMAILS = (process.env.NOTIFICATION_EMAILS || '').split(',').filter(Boolean);

export async function sendTimerExpiredNotification(params: {
  leadName: string;
  agentName: string;
  agentEmail: string;
  assignedAt: Date;
}) {
  const { leadName, agentName, agentEmail, assignedAt } = params;
  
  const subject = `⚠️ Lead Accountability Alert: No call made for ${leadName}`;
  const html = `
    <h2>Lead Accountability Alert</h2>
    <p><strong>Agent:</strong> ${agentName} (${agentEmail})</p>
    <p><strong>Lead:</strong> ${leadName}</p>
    <p><strong>Assigned at:</strong> ${assignedAt.toLocaleString()}</p>
    <p><strong>Status:</strong> No call detected within 30 minutes</p>
    <p>The lead has been automatically returned to the Money Time Pond.</p>
  `;

  if (!resend) {
    console.log('Resend not configured (missing or invalid RESEND_API_KEY), skipping email');
    return;
  }

  if (NOTIFICATION_EMAILS.length === 0) {
    console.log('No notification emails configured, skipping email');
    return;
  }

  try {
    await resend.emails.send({
      from: 'Lead Accountability <alerts@spyglassrealty.com>',
      to: NOTIFICATION_EMAILS,
      subject,
      html,
    });
    console.log(`Sent notification email to ${NOTIFICATION_EMAILS.join(', ')}`);
  } catch (error) {
    console.error('Failed to send email:', error);
  }
}
