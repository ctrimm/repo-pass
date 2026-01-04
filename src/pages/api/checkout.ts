import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, repositories, purchases, users } from '../../db';
import { eq } from 'drizzle-orm';
import { sendEmail, emailTemplates } from '../../lib/email';
import { checkRateLimit, getClientId } from '../../lib/rate-limit';
import {
  PaymentProviderFactory,
  getUserPaymentCredentials,
  hasPaymentProvider,
} from '../../lib/payments/factory';
import { decrypt } from '../../lib/crypto';

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
      return new Response(JSON.stringify({ error: 'Repository not found or inactive' }), {
        status: 404,
      });
    }

    // Free repositories don't require checkout
    if (repository.pricingType === 'free') {
      return new Response(JSON.stringify({ error: 'Free repositories do not require checkout' }), {
        status: 400,
      });
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

    // Check if owner has configured a payment provider
    if (!hasPaymentProvider(owner)) {
      return new Response(
        JSON.stringify({
          error:
            'Payment provider not configured. Repository owner must configure a payment provider in settings.',
        }),
        { status: 400 }
      );
    }

    // Get owner's payment credentials and decrypt them
    const credentials = getUserPaymentCredentials(owner);
    if (!credentials) {
      return new Response(JSON.stringify({ error: 'Invalid payment provider configuration' }), {
        status: 500,
      });
    }

    // Decrypt sensitive credentials
    const decryptedCredentials = {
      ...credentials,
      credentials: {
        stripeSecretKey: credentials.credentials.stripeSecretKey
          ? decrypt(credentials.credentials.stripeSecretKey) || undefined
          : undefined,
        stripePublishableKey: credentials.credentials.stripePublishableKey,
        lemonSqueezyApiKey: credentials.credentials.lemonSqueezyApiKey
          ? decrypt(credentials.credentials.lemonSqueezyApiKey) || undefined
          : undefined,
        lemonSqueezyStoreId: credentials.credentials.lemonSqueezyStoreId,
        gumroadAccessToken: credentials.credentials.gumroadAccessToken
          ? decrypt(credentials.credentials.gumroadAccessToken) || undefined
          : undefined,
        paddleVendorId: credentials.credentials.paddleVendorId,
        paddleApiKey: credentials.credentials.paddleApiKey
          ? decrypt(credentials.credentials.paddleApiKey) || undefined
          : undefined,
      },
    };

    // Initialize payment provider
    const provider = await PaymentProviderFactory.createAndInitialize(decryptedCredentials);

    // If repository doesn't have product/price IDs, create them
    if (!repository.externalProductId || !repository.externalPriceId) {
      const interval =
        repository.pricingType === 'subscription'
          ? repository.subscriptionCadence === 'monthly'
            ? 'month'
            : repository.subscriptionCadence === 'yearly'
              ? 'year'
              : 'one-time'
          : 'one-time';

      const productResult = await provider.createProduct(
        {
          name: repository.displayName,
          description: repository.description || undefined,
          imageUrl: repository.coverImageUrl || undefined,
          repositoryId: repository.id,
          githubOwner: repository.githubOwner,
          githubRepoName: repository.githubRepoName,
        },
        {
          amountCents: repository.priceCents,
          currency: 'usd',
          interval,
        }
      );

      // Update repository with external IDs
      await db
        .update(repositories)
        .set({
          externalProductId: productResult.productId,
          externalPriceId: productResult.priceId,
          paymentProvider: credentials.provider,
          updatedAt: new Date(),
        })
        .where(eq(repositories.id, repository.id));

      repository.externalProductId = productResult.productId;
      repository.externalPriceId = productResult.priceId;
    }

    // Create pending purchase record
    const [purchase] = await db
      .insert(purchases)
      .values({
        repositoryId: repository.id,
        email,
        githubUsername,
        purchaseType: repository.pricingType as 'one-time' | 'subscription',
        amountCents: repository.priceCents,
        status: 'pending',
        accessStatus: 'pending',
      })
      .returning();

    // Create checkout URL using the payment provider
    const checkoutUrl = await provider.createCheckoutUrl(repository.externalPriceId, {
      repositoryId: repository.id,
      email,
      githubUsername,
      purchaseId: purchase.id,
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
        checkoutUrl,
        purchaseId: purchase.id,
        provider: credentials.provider,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Checkout error:', error);

    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: 'Invalid request', details: error.errors }), {
        status: 400,
      });
    }

    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
