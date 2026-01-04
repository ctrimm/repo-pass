import type { APIRoute } from 'astro';
import { db, purchases, accessLogs, repositories } from '../../../db';
import { eq, and, desc } from 'drizzle-orm';
import { addCollaborator, removeCollaborator, checkUserExists } from '../../../lib/github';
import { sendEmail, emailTemplates } from '../../../lib/email';
import { env } from '../../../lib/env';

// Helper to add collaborator with retry logic
async function addCollaboratorWithRetry(
  userId: string,
  owner: string,
  repo: string,
  username: string,
  maxRetries = 3
): Promise<{ success: boolean; error?: string }> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await addCollaborator({ userId, owner, repo, username });
      return { success: true };
    } catch (error: any) {
      console.error(`Attempt ${i + 1} failed:`, error);

      if (i === maxRetries - 1) {
        return { success: false, error: error.message };
      }

      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    // Gumroad sends webhook data as form-urlencoded
    const formData = await request.formData();

    // Extract common fields
    const saleId = formData.get('sale_id') as string;
    const email = formData.get('email') as string;
    const isCancelled = formData.get('cancelled') === 'true';
    const isRefunded = formData.get('refunded') === 'true';
    const isRecurring = formData.get('is_recurring_charge') === 'true';

    // Extract custom fields (Gumroad allows custom fields in checkout)
    const githubUsername = formData.get('github_username') as string;
    const repositoryId = formData.get('repository_id') as string;

    console.log(`Received Gumroad webhook for sale: ${saleId}`);

    if (!repositoryId || !githubUsername) {
      console.error('Missing required custom fields in Gumroad webhook');
      return new Response('Missing required metadata', { status: 400 });
    }

    // Find repository
    const repository = await db.query.repositories.findFirst({
      where: eq(repositories.id, repositoryId),
    });

    if (!repository) {
      console.error('Repository not found:', repositoryId);
      return new Response('Repository not found', { status: 404 });
    }

    // Handle cancellation/refund
    if (isCancelled || isRefunded) {
      // Find purchase by sale ID or email + repo
      const [purchase] = await db
        .select()
        .from(purchases)
        .where(
          and(
            eq(purchases.repositoryId, repositoryId),
            eq(purchases.email, email),
            eq(purchases.githubUsername, githubUsername)
          )
        )
        .orderBy(desc(purchases.createdAt))
        .limit(1);

      if (!purchase) {
        console.error('Purchase not found for cancellation');
        return new Response('Purchase not found', { status: 404 });
      }

      try {
        await removeCollaborator({
          userId: repository.ownerId,
          owner: repository.githubOwner,
          repo: repository.githubRepoName,
          username: githubUsername,
        });

        await db
          .update(purchases)
          .set({
            status: isRefunded ? 'canceled' : 'canceled',
            accessStatus: 'revoked',
            revocationReason: isRefunded ? 'refunded' : 'subscription_canceled',
            revokedAt: new Date(),
          })
          .where(eq(purchases.id, purchase.id));

        await db.insert(accessLogs).values({
          purchaseId: purchase.id,
          action: 'collaborator_removed',
          status: 'success',
        });

        const template = emailTemplates.accessRevoked({
          repositoryName: repository.displayName,
          reason: isRefunded ? 'Your purchase was refunded.' : 'Your subscription was canceled.',
        });

        await sendEmail({
          to: email,
          subject: template.subject,
          html: template.html,
        });

        await db.insert(accessLogs).values({
          purchaseId: purchase.id,
          action: 'email_sent_revocation',
          status: 'success',
        });
      } catch (error) {
        console.error('Failed to remove collaborator:', error);
        await db.insert(accessLogs).values({
          purchaseId: purchase.id,
          action: 'collaborator_removed',
          status: 'failed',
          errorMessage: (error as Error).message,
        });
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle successful purchase
    // Find the most recent pending purchase for this repo and username
    const [purchase] = await db
      .select()
      .from(purchases)
      .where(
        and(
          eq(purchases.repositoryId, repositoryId),
          eq(purchases.githubUsername, githubUsername),
          eq(purchases.status, 'pending')
        )
      )
      .orderBy(desc(purchases.createdAt))
      .limit(1);

    if (!purchase) {
      console.error('Purchase not found for sale:', saleId);
      return new Response('Purchase not found', { status: 404 });
    }

    // Update purchase with Gumroad data
    const price = parseFloat(formData.get('price') as string) || 0;
    await db
      .update(purchases)
      .set({
        stripeCustomerId: formData.get('purchaser_id') as string,
        stripePaymentIntentId: saleId,
        status: 'completed',
      })
      .where(eq(purchases.id, purchase.id));

    // Check if GitHub username exists
    const userExists = await checkUserExists(repository.ownerId, githubUsername);

    if (!userExists) {
      await db.insert(accessLogs).values({
        purchaseId: purchase.id,
        action: 'collaborator_added',
        status: 'failed',
        errorMessage: `GitHub user '${githubUsername}' does not exist`,
      });

      await sendEmail({
        to: env.ADMIN_EMAIL,
        subject: `⚠️ Invalid GitHub Username - ${repository.displayName}`,
        html: `
          <h1>Invalid GitHub Username</h1>
          <p>A customer provided an invalid GitHub username:</p>
          <ul>
            <li><strong>Username:</strong> ${githubUsername}</li>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Repository:</strong> ${repository.displayName}</li>
            <li><strong>Provider:</strong> Gumroad</li>
          </ul>
          <p>Please contact the customer to get a valid GitHub username.</p>
        `,
      });

      return new Response('Invalid GitHub username', { status: 200 });
    }

    // Add as collaborator
    const result = await addCollaboratorWithRetry(
      repository.ownerId,
      repository.githubOwner,
      repository.githubRepoName,
      githubUsername
    );

    if (result.success) {
      await db
        .update(purchases)
        .set({
          accessStatus: 'active',
          accessGrantedAt: new Date(),
        })
        .where(eq(purchases.id, purchase.id));

      await db.insert(accessLogs).values({
        purchaseId: purchase.id,
        action: 'collaborator_added',
        status: 'success',
      });

      // Send access granted email
      try {
        const template = emailTemplates.accessGranted({
          repositoryName: repository.displayName,
          githubOwner: repository.githubOwner,
          githubRepoName: repository.githubRepoName,
          githubUsername,
        });

        await sendEmail({
          to: email,
          subject: template.subject,
          html: template.html,
        });

        await db.insert(accessLogs).values({
          purchaseId: purchase.id,
          action: 'email_sent_access_granted',
          status: 'success',
        });
      } catch (error) {
        console.error('Failed to send access granted email:', error);
        await db.insert(accessLogs).values({
          purchaseId: purchase.id,
          action: 'email_sent_access_granted',
          status: 'failed',
          errorMessage: (error as Error).message,
        });
      }
    } else {
      await db.insert(accessLogs).values({
        purchaseId: purchase.id,
        action: 'collaborator_added',
        status: 'failed',
        errorMessage: result.error,
      });

      await db
        .update(purchases)
        .set({
          status: 'failed',
        })
        .where(eq(purchases.id, purchase.id));

      await sendEmail({
        to: env.ADMIN_EMAIL,
        subject: `⚠️ Failed to Grant Access - ${repository.displayName}`,
        html: `
          <h1>Failed to Add Collaborator</h1>
          <p>Failed to add collaborator after 3 retries:</p>
          <ul>
            <li><strong>Username:</strong> ${githubUsername}</li>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Repository:</strong> ${repository.displayName}</li>
            <li><strong>Provider:</strong> Gumroad</li>
            <li><strong>Error:</strong> ${result.error}</li>
          </ul>
          <p>Please manually add this user to the repository.</p>
        `,
      });
    }

    // Handle recurring charge notification
    if (isRecurring) {
      const template = emailTemplates.subscriptionRenewed({
        repositoryName: repository.displayName,
        nextBillingDate: 'Next billing cycle',
        amountCents: Math.round(price * 100),
      });

      await sendEmail({
        to: email,
        subject: template.subject,
        html: template.html,
      });

      await db.insert(accessLogs).values({
        purchaseId: purchase.id,
        action: 'email_sent_renewal',
        status: 'success',
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Gumroad webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
};
