import type { APIRoute } from 'astro';
import { db, purchases, accessLogs, repositories, users } from '../../../db';
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
    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('x-signature');

    // Parse webhook event
    const event = JSON.parse(body);
    const eventType = event.meta?.event_name;

    console.log(`Received Lemon Squeezy webhook: ${eventType}`);

    // TODO: Implement signature verification for production
    // Lemon Squeezy uses HMAC SHA-256 signature verification
    // if (!signature) {
    //   return new Response('Missing signature', { status: 400 });
    // }

    // Handle different event types
    switch (eventType) {
      case 'order_created': {
        const orderData = event.data;
        const customData = orderData.attributes?.first_order_item?.variant?.custom_data || {};
        const { repositoryId, githubUsername } = customData;

        if (!repositoryId || !githubUsername) {
          console.error('Missing metadata in webhook:', customData);
          return new Response('Missing required metadata', { status: 400 });
        }

        // Find purchase by repository and github username
        const repository = await db.query.repositories.findFirst({
          where: eq(repositories.id, repositoryId),
        });

        if (!repository) {
          console.error('Repository not found:', repositoryId);
          return new Response('Repository not found', { status: 404 });
        }

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
          console.error('Purchase not found for order:', orderData.id);
          return new Response('Purchase not found', { status: 404 });
        }

        // Update purchase with Lemon Squeezy IDs
        await db
          .update(purchases)
          .set({
            stripeCustomerId: orderData.attributes.customer_id?.toString(),
            stripePaymentIntentId: orderData.id,
            stripeSubscriptionId: orderData.attributes.subscription_id?.toString() || null,
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
                <li><strong>Email:</strong> ${purchase.email}</li>
                <li><strong>Repository:</strong> ${repository.displayName}</li>
                <li><strong>Provider:</strong> Lemon Squeezy</li>
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
              to: purchase.email,
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
                <li><strong>Email:</strong> ${purchase.email}</li>
                <li><strong>Repository:</strong> ${repository.displayName}</li>
                <li><strong>Provider:</strong> Lemon Squeezy</li>
                <li><strong>Error:</strong> ${result.error}</li>
              </ul>
              <p>Please manually add this user to the repository.</p>
            `,
          });
        }

        break;
      }

      case 'subscription_cancelled': {
        const subscriptionData = event.data;
        const subscriptionId = subscriptionData.id;

        // Find purchase by subscription ID
        const [purchase] = await db
          .select()
          .from(purchases)
          .where(eq(purchases.stripeSubscriptionId, subscriptionId.toString()));

        if (!purchase) {
          console.error('Purchase not found for subscription:', subscriptionId);
          return new Response('Purchase not found', { status: 404 });
        }

        const repository = await db.query.repositories.findFirst({
          where: eq(repositories.id, purchase.repositoryId),
        });

        if (!repository) {
          console.error('Repository not found:', purchase.repositoryId);
          return new Response('Repository not found', { status: 404 });
        }

        // Remove collaborator
        try {
          await removeCollaborator({
            userId: repository.ownerId,
            owner: repository.githubOwner,
            repo: repository.githubRepoName,
            username: purchase.githubUsername,
          });

          await db
            .update(purchases)
            .set({
              status: 'canceled',
              accessStatus: 'revoked',
              revocationReason: 'subscription_canceled',
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
            reason: 'Your subscription was canceled.',
          });

          await sendEmail({
            to: purchase.email,
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

        break;
      }

      case 'subscription_payment_success': {
        const subscriptionData = event.data;
        const subscriptionId = subscriptionData.id;

        const [purchase] = await db
          .select()
          .from(purchases)
          .where(eq(purchases.stripeSubscriptionId, subscriptionId.toString()));

        if (purchase) {
          const repository = await db.query.repositories.findFirst({
            where: eq(repositories.id, purchase.repositoryId),
          });

          if (repository) {
            const template = emailTemplates.subscriptionRenewed({
              repositoryName: repository.displayName,
              nextBillingDate: new Date(subscriptionData.attributes.renews_at).toLocaleDateString(),
              amountCents: Math.round(subscriptionData.attributes.total * 100),
            });

            await sendEmail({
              to: purchase.email,
              subject: template.subject,
              html: template.html,
            });

            await db.insert(accessLogs).values({
              purchaseId: purchase.id,
              action: 'email_sent_renewal',
              status: 'success',
            });
          }
        }

        break;
      }

      case 'subscription_payment_failed': {
        const subscriptionData = event.data;
        const subscriptionId = subscriptionData.id;

        const [purchase] = await db
          .select()
          .from(purchases)
          .where(eq(purchases.stripeSubscriptionId, subscriptionId.toString()));

        if (purchase) {
          await db.insert(accessLogs).values({
            purchaseId: purchase.id,
            action: 'payment_failed',
            status: 'failed',
            errorMessage: 'Payment failed',
          });

          await sendEmail({
            to: env.ADMIN_EMAIL,
            subject: `⚠️ Payment Failed - Lemon Squeezy`,
            html: `
              <h1>Payment Failed</h1>
              <p>A subscription payment has failed:</p>
              <ul>
                <li><strong>Email:</strong> ${purchase.email}</li>
                <li><strong>GitHub Username:</strong> ${purchase.githubUsername}</li>
                <li><strong>Provider:</strong> Lemon Squeezy</li>
              </ul>
            `,
          });
        }

        break;
      }

      default:
        console.log(`Unhandled Lemon Squeezy event type: ${eventType}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Lemon Squeezy webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
};
