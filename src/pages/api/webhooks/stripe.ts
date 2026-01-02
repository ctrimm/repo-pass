import type { APIRoute } from 'astro';
import { db, purchases, accessLogs, repositories } from '../../../db';
import { eq } from 'drizzle-orm';
import { verifyWebhookSignature } from '../../../lib/stripe';
import { env } from '../../../lib/env';
import { addCollaborator, removeCollaborator, checkUserExists } from '../../../lib/github';
import { sendEmail, emailTemplates } from '../../../lib/email';

// Helper to add collaborator with retry logic
async function addCollaboratorWithRetry(
  owner: string,
  repo: string,
  username: string,
  maxRetries = 3
): Promise<{ success: boolean; error?: string }> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await addCollaborator({ owner, repo, username });
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
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return new Response('Missing signature', { status: 400 });
    }

    // Verify webhook signature
    const event = verifyWebhookSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);

    console.log(`Received webhook: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const { repositoryId, githubUsername } = session.metadata;

        // Find purchase
        const [purchase] = await db
          .select()
          .from(purchases)
          .where(eq(purchases.githubUsername, githubUsername))
          .orderBy(purchases.createdAt)
          .limit(1);

        if (!purchase) {
          console.error('Purchase not found for session:', session.id);
          return new Response('Purchase not found', { status: 404 });
        }

        // Get repository details
        const repository = await db.query.repositories.findFirst({
          where: eq(repositories.id, purchase.repositoryId),
        });

        if (!repository) {
          console.error('Repository not found:', purchase.repositoryId);
          return new Response('Repository not found', { status: 404 });
        }

        // Update purchase with Stripe IDs
        await db
          .update(purchases)
          .set({
            stripePaymentIntentId: session.payment_intent,
            stripeSubscriptionId: session.subscription || null,
            stripeCustomerId: session.customer,
            status: 'completed',
          })
          .where(eq(purchases.id, purchase.id));

        // Check if GitHub username exists
        const userExists = await checkUserExists(githubUsername);

        if (!userExists) {
          // Log error
          await db.insert(accessLogs).values({
            purchaseId: purchase.id,
            action: 'collaborator_added',
            status: 'failed',
            errorMessage: `GitHub user '${githubUsername}' does not exist`,
          });

          // Send alert email to admin
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
              </ul>
              <p>Please contact the customer to get a valid GitHub username.</p>
            `,
          });

          return new Response('Invalid GitHub username', { status: 200 });
        }

        // Add as collaborator
        const result = await addCollaboratorWithRetry(
          repository.githubOwner,
          repository.githubRepoName,
          githubUsername
        );

        if (result.success) {
          // Update purchase status
          await db
            .update(purchases)
            .set({
              accessStatus: 'active',
              accessGrantedAt: new Date(),
            })
            .where(eq(purchases.id, purchase.id));

          // Log success
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

            // Log email sent
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
          // Log failure
          await db.insert(accessLogs).values({
            purchaseId: purchase.id,
            action: 'collaborator_added',
            status: 'failed',
            errorMessage: result.error,
          });

          // Update purchase status
          await db
            .update(purchases)
            .set({
              status: 'failed',
            })
            .where(eq(purchases.id, purchase.id));

          // Send alert to admin
          await sendEmail({
            to: env.ADMIN_EMAIL,
            subject: `⚠️ Failed to Grant Access - ${repository.displayName}`,
            html: `
              <h1>Failed to Add Collaborator</h1>
              <p>Failed to add collaborator after ${3} retries:</p>
              <ul>
                <li><strong>Username:</strong> ${githubUsername}</li>
                <li><strong>Email:</strong> ${purchase.email}</li>
                <li><strong>Repository:</strong> ${repository.displayName}</li>
                <li><strong>Error:</strong> ${result.error}</li>
              </ul>
              <p>Please manually add this user to the repository.</p>
            `,
          });
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;

        // Find purchase by subscription ID
        const [purchase] = await db
          .select()
          .from(purchases)
          .where(eq(purchases.stripeSubscriptionId, subscription.id));

        if (!purchase) {
          console.error('Purchase not found for subscription:', subscription.id);
          return new Response('Purchase not found', { status: 404 });
        }

        // Get repository details
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
            owner: repository.githubOwner,
            repo: repository.githubRepoName,
            username: purchase.githubUsername,
          });

          // Update purchase
          await db
            .update(purchases)
            .set({
              status: 'canceled',
              accessStatus: 'revoked',
              revocationReason: 'subscription_canceled',
              revokedAt: new Date(),
            })
            .where(eq(purchases.id, purchase.id));

          // Log revocation
          await db.insert(accessLogs).values({
            purchaseId: purchase.id,
            action: 'collaborator_removed',
            status: 'success',
          });

          // Send revocation email
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

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;

        // If this is a renewal (not first payment)
        if (invoice.billing_reason === 'subscription_cycle') {
          const [purchase] = await db
            .select()
            .from(purchases)
            .where(eq(purchases.stripeSubscriptionId, invoice.subscription));

          if (purchase) {
            const repository = await db.query.repositories.findFirst({
              where: eq(repositories.id, purchase.repositoryId),
            });

            if (repository) {
              // Send renewal email
              const template = emailTemplates.subscriptionRenewed({
                repositoryName: repository.displayName,
                nextBillingDate: new Date(
                  invoice.lines.data[0].period.end * 1000
                ).toLocaleDateString(),
                amountCents: invoice.amount_paid,
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
        }

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;

        const [purchase] = await db
          .select()
          .from(purchases)
          .where(eq(purchases.stripeSubscriptionId, invoice.subscription));

        if (purchase) {
          // Log failed payment
          await db.insert(accessLogs).values({
            purchaseId: purchase.id,
            action: 'payment_failed',
            status: 'failed',
            errorMessage: 'Payment failed',
          });

          // Send alert to admin
          await sendEmail({
            to: env.ADMIN_EMAIL,
            subject: `⚠️ Payment Failed`,
            html: `
              <h1>Payment Failed</h1>
              <p>A subscription payment has failed:</p>
              <ul>
                <li><strong>Email:</strong> ${purchase.email}</li>
                <li><strong>GitHub Username:</strong> ${purchase.githubUsername}</li>
                <li><strong>Amount:</strong> $${(invoice.amount_due / 100).toFixed(2)}</li>
              </ul>
            `,
          });
        }

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
};
