import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth';
import { db, users } from '../../../../db';
import { eq } from 'drizzle-orm';
import { encrypt } from '../../../../lib/crypto';

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

    // Set fields for selected provider (ENCRYPT sensitive data)
    if (provider === 'stripe') {
      const secretKey = formData.get('stripe_secret_key') as string;
      const publishableKey = formData.get('stripe_publishable_key') as string;

      if (!secretKey || !publishableKey) {
        return new Response('Stripe keys are required', { status: 400 });
      }

      updateData.stripeSecretKey = encrypt(secretKey);
      updateData.stripePublishableKey = publishableKey; // Publishable key is not secret
    } else if (provider === 'lemon_squeezy') {
      const apiKey = formData.get('lemon_squeezy_api_key') as string;
      const storeId = formData.get('lemon_squeezy_store_id') as string;

      if (!apiKey || !storeId) {
        return new Response('Lemon Squeezy API key and Store ID are required', { status: 400 });
      }

      updateData.lemonSqueezyApiKey = encrypt(apiKey);
      updateData.lemonSqueezyStoreId = storeId; // Store ID is not secret
    } else if (provider === 'gumroad') {
      const accessToken = formData.get('gumroad_access_token') as string;

      if (!accessToken) {
        return new Response('Gumroad access token is required', { status: 400 });
      }

      updateData.gumroadAccessToken = encrypt(accessToken);
    } else if (provider === 'paddle') {
      const vendorId = formData.get('paddle_vendor_id') as string;
      const apiKey = formData.get('paddle_api_key') as string;

      if (!vendorId || !apiKey) {
        return new Response('Paddle Vendor ID and API key are required', { status: 400 });
      }

      updateData.paddleVendorId = vendorId; // Vendor ID is not secret
      updateData.paddleApiKey = encrypt(apiKey);
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
