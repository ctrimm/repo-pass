import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, repositories, purchases } from '../../db';
import { eq } from 'drizzle-orm';
import { createCheckoutSession } from '../../lib/stripe';
import { env } from '../../lib/env';
import { sendEmail, emailTemplates } from '../../lib/email';
import { checkRateLimit, getClientId } from '../../lib/rate-limit';

const checkoutSchema = z.object({
  repositoryId: z.string().uuid(),
  email: z.string().email(),
  githubUsername: z.string().min(1).max(39),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    // Rate limiting: 5 requests per minute per IP
    const clientId = getClientId(request);
    const rateLimit = checkRateLimit(`checkout:${clientId}`, 5, 60 * 1000);

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
            'X-RateLimit-Limit': String(rateLimit.limit),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
            'X-RateLimit-Reset': String(Math.floor(rateLimit.resetAt / 1000)),
          },
        }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { repositoryId, email, githubUsername } = checkoutSchema.parse(body);

    // Get repository
    const repository = await db.query.repositories.findFirst({
      where: eq(repositories.id, repositoryId),
    });

    if (!repository || !repository.active) {
      return new Response(
        JSON.stringify({ error: 'Repository not found or inactive' }),
        { status: 404 }
      );
    }

    // Create pending purchase record
    const [purchase] = await db
      .insert(purchases)
      .values({
        repositoryId: repository.id,
        email,
        githubUsername,
        purchaseType: repository.pricingType,
        amountCents: repository.priceCents,
        status: 'pending',
        accessStatus: 'pending',
      })
      .returning();

    // Create Stripe checkout session
    // Note: 'custom' cadence is handled differently, not supported in Stripe checkout
    const subscriptionCadence = repository.subscriptionCadence === 'monthly' || repository.subscriptionCadence === 'yearly'
      ? repository.subscriptionCadence
      : undefined;

    const { sessionId, sessionUrl } = await createCheckoutSession({
      repositoryId: repository.id,
      repositoryName: repository.displayName,
      priceCents: repository.priceCents,
      pricingType: repository.pricingType,
      subscriptionCadence,
      customerEmail: email,
      githubUsername,
      successUrl: `${env.SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${env.SITE_URL}/products/${repository.slug}?canceled=true`,
    });

    // Send confirmation email
    try {
      const template = emailTemplates.purchaseConfirmation({
        repositoryName: repository.displayName,
        githubUsername,
        amountCents: repository.priceCents,
      });

      await sendEmail({
        to: email,
        subject: template.subject,
        html: template.html,
      });
    } catch (error) {
      console.error('Failed to send confirmation email:', error);
      // Don't fail the checkout if email fails
    }

    return new Response(
      JSON.stringify({
        sessionId,
        sessionUrl,
        purchaseId: purchase.id,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Checkout error:', error);

    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: error.errors }),
        { status: 400 }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 }
    );
  }
};
