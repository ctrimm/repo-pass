import Stripe from 'stripe';
import { env } from './env';

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});

export interface CreateCheckoutSessionOptions {
  repositoryId: string;
  repositoryName: string;
  priceCents: number;
  pricingType: 'one-time' | 'subscription';
  subscriptionCadence?: 'monthly' | 'yearly';
  customerEmail: string;
  githubUsername: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Create a Stripe checkout session for repository purchase
 */
export async function createCheckoutSession(options: CreateCheckoutSessionOptions) {
  try {
    const {
      repositoryId,
      repositoryName,
      priceCents,
      pricingType,
      subscriptionCadence,
      customerEmail,
      githubUsername,
      successUrl,
      cancelUrl,
    } = options;

    // Create or retrieve customer
    const customers = await stripe.customers.list({
      email: customerEmail,
      limit: 1,
    });

    let customer: Stripe.Customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: customerEmail,
        metadata: {
          githubUsername,
        },
      });
    }

    // Create session based on pricing type
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customer.id,
      mode: pricingType === 'subscription' ? 'subscription' : 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        repositoryId,
        githubUsername,
        pricingType,
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: repositoryName,
              description: `Access to ${repositoryName} repository`,
            },
            unit_amount: priceCents,
            ...(pricingType === 'subscription' && subscriptionCadence
              ? {
                  recurring: {
                    interval: subscriptionCadence === 'monthly' ? 'month' : 'year',
                  },
                }
              : {}),
          },
          quantity: 1,
        },
      ],
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return {
      sessionId: session.id,
      sessionUrl: session.url,
    };
  } catch (error: any) {
    console.error('Failed to create checkout session:', error);
    throw new Error(`Stripe error: ${error.message}`);
  }
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(subscriptionId: string) {
  try {
    const subscription = await stripe.subscriptions.cancel(subscriptionId);
    return subscription;
  } catch (error: any) {
    console.error('Failed to cancel subscription:', error);
    throw new Error(`Failed to cancel subscription: ${error.message}`);
  }
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error: any) {
    console.error('Webhook signature verification failed:', error);
    throw new Error(`Webhook error: ${error.message}`);
  }
}
