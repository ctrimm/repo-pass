import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { db, users } from '../../../../db';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ cookies }) => {
  try {
    const session = await requireAuth(cookies);

    // Clear all payment provider data
    await db
      .update(users)
      .set({
        paymentProvider: null,
        stripeSecretKey: null,
        stripePublishableKey: null,
        lemonSqueezyApiKey: null,
        lemonSqueezyStoreId: null,
        gumroadAccessToken: null,
        paddleVendorId: null,
        paddleApiKey: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.userId));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error disconnecting provider:', error);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
