import { Resend } from 'resend';
import { env } from './env';

const resend = new Resend(env.RESEND_API_KEY);

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions) {
  try {
    const { data, error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
    });

    if (error) {
      console.error('Email send error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Email service error:', error);
    throw error;
  }
}

// Email templates
export const emailTemplates = {
  purchaseConfirmation: (data: {
    repositoryName: string;
    githubUsername: string;
    amountCents: number;
  }) => ({
    subject: `Purchase Confirmation - ${data.repositoryName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Purchase Confirmed! 🎉</h1>
        <p>Thank you for your purchase of <strong>${data.repositoryName}</strong>.</p>

        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>GitHub Username:</strong> ${data.githubUsername}</p>
          <p><strong>Amount:</strong> $${(data.amountCents / 100).toFixed(2)}</p>
        </div>

        <p>We're processing your access now. You'll receive another email within 5 minutes with instructions to access the repository.</p>

        <p>If you have any questions, just reply to this email.</p>

        <p>Thanks,<br>The RepoPass Team</p>
      </div>
    `,
  }),

  accessGranted: (data: {
    repositoryName: string;
    githubOwner: string;
    githubRepoName: string;
    githubUsername: string;
  }) => ({
    subject: `Access Granted - ${data.repositoryName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Access Granted! ✅</h1>
        <p>Your access to <strong>${data.repositoryName}</strong> has been granted.</p>

        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Repository:</strong> ${data.githubOwner}/${data.githubRepoName}</p>
          <p><strong>Your GitHub Username:</strong> ${data.githubUsername}</p>
        </div>

        <h2>How to Access</h2>
        <ol>
          <li>Go to <a href="https://github.com/${data.githubOwner}/${data.githubRepoName}">github.com/${data.githubOwner}/${data.githubRepoName}</a></li>
          <li>You should now see the repository (it was previously private)</li>
          <li>Clone it: <code>git clone https://github.com/${data.githubOwner}/${data.githubRepoName}.git</code></li>
          <li>Or fork it to your own account</li>
        </ol>

        <h2>Access Terms</h2>
        <ul>
          <li>✅ You have lifetime read access to this repository</li>
          <li>❌ Please don't share access with others</li>
          <li>⚠️ Access may be revoked if terms are violated</li>
        </ul>

        <p>Enjoy your new repository! If you have any issues accessing it, please reply to this email.</p>

        <p>Thanks,<br>The RepoPass Team</p>
      </div>
    `,
  }),

  accessRevoked: (data: {
    repositoryName: string;
    reason?: string;
  }) => ({
    subject: `Access Revoked - ${data.repositoryName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Access Revoked</h1>
        <p>Your access to <strong>${data.repositoryName}</strong> has been revoked.</p>

        ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ''}

        <p>If you believe this was done in error, please reply to this email.</p>

        <p>Thanks,<br>The RepoPass Team</p>
      </div>
    `,
  }),

  subscriptionRenewed: (data: {
    repositoryName: string;
    nextBillingDate: string;
    amountCents: number;
  }) => ({
    subject: `Subscription Renewed - ${data.repositoryName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Subscription Renewed ✅</h1>
        <p>Your subscription to <strong>${data.repositoryName}</strong> has been renewed.</p>

        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Amount Charged:</strong> $${(data.amountCents / 100).toFixed(2)}</p>
          <p><strong>Next Billing Date:</strong> ${data.nextBillingDate}</p>
        </div>

        <p>Your access continues uninterrupted. Thank you for your continued support!</p>

        <p>Thanks,<br>The RepoPass Team</p>
      </div>
    `,
  }),
};
