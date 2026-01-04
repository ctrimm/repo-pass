import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { db, users } from '../../../../db';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    const session = await requireAuth(cookies);

    const formData = await request.formData();
    const provider = formData.get('provider') as string;

    if (!provider) {
      return new Response('Provider is required', { status: 400 });
    }

    // Build update object based on provider
    const updateData: any = {
      paymentProvider: provider,
      updatedAt: new Date(),
    };

    // Clear all provider fields first
    updateData.stripeSecretKey = null;
    updateData.stripePublishableKey = null;
    updateData.lemonSqueezyApiKey = null;
    updateData.lemonSqueezyStoreId = null;
    updateData.gumroadAccessToken = null;
    updateData.paddleVendorId = null;
    updateData.paddleApiKey = null;

    // Set fields for selected provider
    if (provider === 'stripe') {
      updateData.stripeSecretKey = formData.get('stripe_secret_key') as string;
      updateData.stripePublishableKey = formData.get('stripe_publishable_key') as string;

      if (!updateData.stripeSecretKey || !updateData.stripePublishableKey) {
        return new Response('Stripe keys are required', { status: 400 });
      }
    } else if (provider === 'lemon_squeezy') {
      updateData.lemonSqueezyApiKey = formData.get('lemon_squeezy_api_key') as string;
      updateData.lemonSqueezyStoreId = formData.get('lemon_squeezy_store_id') as string;

      if (!updateData.lemonSqueezyApiKey || !updateData.lemonSqueezyStoreId) {
        return new Response('Lemon Squeezy API key and Store ID are required', { status: 400 });
      }
    } else if (provider === 'gumroad') {
      updateData.gumroadAccessToken = formData.get('gumroad_access_token') as string;

      if (!updateData.gumroadAccessToken) {
        return new Response('Gumroad access token is required', { status: 400 });
      }
    } else if (provider === 'paddle') {
      updateData.paddleVendorId = formData.get('paddle_vendor_id') as string;
      updateData.paddleApiKey = formData.get('paddle_api_key') as string;

      if (!updateData.paddleVendorId || !updateData.paddleApiKey) {
        return new Response('Paddle Vendor ID and API key are required', { status: 400 });
      }
    } else {
      return new Response('Invalid provider', { status: 400 });
    }

    // Update user in database
    await db.update(users).set(updateData).where(eq(users.id, session.userId));

    return redirect('/dashboard/settings?success=payment-provider');
  } catch (error) {
    console.error('Error saving payment provider:', error);
    return new Response('Internal server error', { status: 500 });
  }
};
