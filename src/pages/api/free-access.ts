import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, repositories, purchases, users } from '../../db';
import { eq } from 'drizzle-orm';
import { sendEmail, emailTemplates } from '../../lib/email';
import { checkRateLimit, getClientId } from '../../lib/rate-limit';
import { addCollaborator } from '../../lib/github';

const freeAccessSchema = z.object({
  repositoryId: z.string().uuid(),
  githubUsername: z.string().min(1).max(39),
  email: z.string().email().optional(),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    // Rate limiting: 5 requests per minute per IP
    const clientId = getClientId(request);
    const rateLimit = checkRateLimit(`free-access:${clientId}`, 5, 60 * 1000);

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Too many requests',
          retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { repositoryId, email, githubUsername } = freeAccessSchema.parse(body);

    // Get repository
    const repository = await db.query.repositories.findFirst({
      where: eq(repositories.id, repositoryId),
    });

    if (!repository || !repository.active) {
      return new Response(JSON.stringify({ error: 'Repository not found or inactive' }), {
        status: 404,
      });
    }

    // Verify this is a free repository
    if (repository.pricingType !== 'free') {
      return new Response(JSON.stringify({ error: 'This repository is not free' }), {
        status: 400,
      });
    }

    // Check if email is required but not provided
    if (repository.requireEmailForFree && !email) {
      return new Response(
        JSON.stringify({ error: 'Email address is required for this repository' }),
        {
          status: 400,
        }
      );
    }

    // Get repository owner
    const owner = await db.query.users.findFirst({
      where: eq(users.id, repository.ownerId),
    });

    if (!owner) {
      return new Response(JSON.stringify({ error: 'Repository owner not found' }), {
        status: 404,
      });
    }

    // Check if user has already requested access
    const existingPurchase = await db.query.purchases.findFirst({
      where: (purchases, { and, eq }) =>
        and(eq(purchases.repositoryId, repositoryId), eq(purchases.githubUsername, githubUsername)),
    });

    if (existingPurchase) {
      return new Response(
        JSON.stringify({
          error: 'You have already requested access to this repository',
          purchase: existingPurchase,
        }),
        { status: 400 }
      );
    }

    // Create purchase record for free access
    const [purchase] = await db
      .insert(purchases)
      .values({
        repositoryId,
        email: email || `${githubUsername}@github.user`,
        githubUsername,
        purchaseType: 'one-time',
        amountCents: 0,
        status: 'completed',
        accessStatus: 'pending',
      })
      .returning();

    // Add collaborator to GitHub repository
    try {
      if (!owner.githubPersonalAccessToken) {
        throw new Error('Repository owner has not configured GitHub access token');
      }

      await addCollaborator({
        userId: owner.id,
        owner: repository.githubOwner,
        repo: repository.githubRepoName,
        username: githubUsername,
      });

      // Update purchase access status
      await db
        .update(purchases)
        .set({
          accessStatus: 'active',
          accessGrantedAt: new Date(),
        })
        .where(eq(purchases.id, purchase.id));

      // Send confirmation email if email was provided
      if (email && owner.emailNotifications) {
        const emailContent = emailTemplates.accessGranted({
          githubUsername,
          repositoryName: repository.displayName,
          githubOwner: repository.githubOwner,
          githubRepoName: repository.githubRepoName,
        });

        await sendEmail({
          to: email,
          subject: emailContent.subject,
          html: emailContent.html,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Access granted! Check your GitHub notifications for the collaboration invite.',
          purchase,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error: any) {
      console.error('Error adding collaborator:', error);

      // Mark access as pending if collaborator add failed
      await db
        .update(purchases)
        .set({ accessStatus: 'pending' })
        .where(eq(purchases.id, purchase.id));

      return new Response(
        JSON.stringify({
          error: 'Failed to add you as a collaborator. The repository owner has been notified.',
          details: error.message,
        }),
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Free access error:', error);

    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Invalid request', details: error.errors }), {
        status: 400,
      });
    }

    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
    });
  }
};
