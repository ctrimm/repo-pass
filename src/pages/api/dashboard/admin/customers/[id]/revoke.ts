import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, purchases, accessLogs, repositories } from '../../../../../../db';
import { eq, and } from 'drizzle-orm';
import { requireAdmin } from '../../../../../../lib/auth';
import { removeCollaborator } from '../../../../../../lib/github';
import { sendEmail, emailTemplates } from '../../../../../../lib/email';
import { cancelSubscription } from '../../../../../../lib/stripe';

const revokeSchema = z.object({
  reason: z.string().optional(),
});

export const POST: APIRoute = async ({ params, request, cookies }) => {
  try {
    const session = await requireAdmin(cookies);
    const body = await request.json();
    const { reason } = revokeSchema.parse(body);

    // Get purchase
    const purchase = await db.query.purchases.findFirst({
      where: eq(purchases.id, params.id!),
    });

    if (!purchase) {
      return new Response(JSON.stringify({ error: 'Purchase not found' }), {
        status: 404,
      });
    }

    // SECURITY: Get repository and verify ownership
    const repository = await db.query.repositories.findFirst({
      where: and(eq(repositories.id, purchase.repositoryId), eq(repositories.ownerId, session.userId)),
    });

    if (!repository) {
      return new Response(JSON.stringify({ error: 'Repository not found or unauthorized' }), {
        status: 404,
      });
    }

    // Remove GitHub collaborator
    try {
      await removeCollaborator({
        owner: repository.githubOwner,
        repo: repository.githubRepoName,
        username: purchase.githubUsername,
      });

      // Log success
      await db.insert(accessLogs).values({
        purchaseId: purchase.id,
        action: 'collaborator_removed',
        status: 'success',
      });
    } catch (error: any) {
      console.error('Failed to remove collaborator:', error);
      await db.insert(accessLogs).values({
        purchaseId: purchase.id,
        action: 'collaborator_removed',
        status: 'failed',
        errorMessage: error.message,
      });
    }

    // Cancel subscription if applicable
    if (purchase.stripeSubscriptionId) {
      try {
        await cancelSubscription(purchase.stripeSubscriptionId);
      } catch (error) {
        console.error('Failed to cancel subscription:', error);
      }
    }

    // Update purchase
    await db
      .update(purchases)
      .set({
        accessStatus: 'revoked',
        revocationReason: reason || 'Manually revoked by admin',
        revokedBy: session.userId,
        revokedAt: new Date(),
      })
      .where(eq(purchases.id, purchase.id));

    // Send revocation email
    try {
      const template = emailTemplates.accessRevoked({
        repositoryName: repository.displayName,
        reason: reason,
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
      console.error('Failed to send revocation email:', error);
    }

    return new Response(
      JSON.stringify({
        message: 'Access revoked successfully',
        purchaseId: purchase.id,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Revoke access error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message.includes('Unauthorized') ? 401 : 500,
    });
  }
};
