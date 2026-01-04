/**
 * Stripe Payment Provider Implementation
 */

import Stripe from 'stripe';
import type { IPaymentProvider } from '../provider';
import type {
  ProductDetails,
  PriceDetails,
  CreateProductResult,
  CheckoutMetadata,
  PaymentResult,
  WebhookEvent,
  UserPaymentCredentials,
} from '../types';

export class StripeProvider implements IPaymentProvider {
  private stripe: Stripe | null = null;
  private webhookSecret: string | null = null;

  getName(): string {
    return 'stripe';
  }

  async initialize(credentials: UserPaymentCredentials): Promise<void> {
    if (credentials.provider !== 'stripe') {
      throw new Error('Invalid provider credentials');
    }

    const { stripeSecretKey } = credentials.credentials;
    if (!stripeSecretKey) {
      throw new Error('Stripe secret key is required');
    }

    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    });
  }

  async createProduct(
    productDetails: ProductDetails,
    priceDetails: PriceDetails
  ): Promise<CreateProductResult> {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    // Create product in Stripe
    const product = await this.stripe.products.create({
      name: productDetails.name,
      description: productDetails.description,
      images: productDetails.imageUrl ? [productDetails.imageUrl] : undefined,
      metadata: {
        repositoryId: productDetails.repositoryId,
        githubOwner: productDetails.githubOwner,
        githubRepoName: productDetails.githubRepoName,
      },
    });

    // Create price for the product
    const recurring =
      priceDetails.interval && priceDetails.interval !== 'one-time'
        ? { interval: priceDetails.interval }
        : undefined;

    const price = await this.stripe.prices.create({
      product: product.id,
      unit_amount: priceDetails.amountCents,
      currency: priceDetails.currency.toLowerCase(),
      recurring,
    });

    return {
      productId: product.id,
      priceId: price.id,
    };
  }

  async updateProduct(productId: string, productDetails: Partial<ProductDetails>): Promise<void> {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    const updateData: Stripe.ProductUpdateParams = {};

    if (productDetails.name) {
      updateData.name = productDetails.name;
    }
    if (productDetails.description !== undefined) {
      updateData.description = productDetails.description || '';
    }
    if (productDetails.imageUrl) {
      updateData.images = [productDetails.imageUrl];
    }

    await this.stripe.products.update(productId, updateData);
  }

  async updatePrice(productId: string, priceDetails: PriceDetails): Promise<string> {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    // Stripe doesn't allow updating prices, so create a new one
    const recurring =
      priceDetails.interval && priceDetails.interval !== 'one-time'
        ? { interval: priceDetails.interval }
        : undefined;

    const price = await this.stripe.prices.create({
      product: productId,
      unit_amount: priceDetails.amountCents,
      currency: priceDetails.currency.toLowerCase(),
      recurring,
    });

    return price.id;
  }

  async createCheckoutUrl(priceId: string, metadata: CheckoutMetadata): Promise<string> {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: metadata.purchaseId ? 'payment' : 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/products/${metadata.repositoryId}`,
      customer_email: metadata.email,
      metadata: {
        repositoryId: metadata.repositoryId,
        githubUsername: metadata.githubUsername,
        email: metadata.email,
        purchaseId: metadata.purchaseId || '',
      },
    });

    if (!session.url) {
      throw new Error('Failed to create checkout session');
    }

    return session.url;
  }

  async verifyWebhook(event: WebhookEvent): Promise<boolean> {
    if (!this.stripe || !this.webhookSecret) {
      throw new Error('Stripe not initialized or webhook secret not set');
    }

    try {
      this.stripe.webhooks.constructEvent(event.raw, event.signature || '', this.webhookSecret);
      return true;
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      return false;
    }
  }

  async handlePaymentSuccess(event: WebhookEvent): Promise<PaymentResult> {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    try {
      const session = event.data as Stripe.Checkout.Session;

      return {
        success: true,
        customerId: session.customer as string | undefined,
        subscriptionId: session.subscription as string | undefined,
        paymentIntentId: session.payment_intent as string | undefined,
        amountCents: session.amount_total || 0,
        metadata: session.metadata || {},
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async handlePaymentFailure(event: WebhookEvent): Promise<PaymentResult> {
    const session = event.data as Stripe.Checkout.Session;

    return {
      success: false,
      customerId: session.customer as string | undefined,
      metadata: session.metadata || {},
      error: 'Payment failed',
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    await this.stripe.subscriptions.cancel(subscriptionId);
  }

  /**
   * Set webhook secret for signature verification
   */
  setWebhookSecret(secret: string): void {
    this.webhookSecret = secret;
  }
}
