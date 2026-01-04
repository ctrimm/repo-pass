/**
 * Payment Provider Types
 *
 * Common types used across all payment providers
 */

export type PaymentProvider = 'stripe' | 'lemon_squeezy' | 'gumroad' | 'paddle';

export interface ProductDetails {
  name: string;
  description?: string;
  imageUrl?: string;
  repositoryId: string;
  githubOwner: string;
  githubRepoName: string;
}

export interface PriceDetails {
  amountCents: number;
  currency: string;
  interval?: 'month' | 'year' | 'one-time';
}

export interface CreateProductResult {
  productId: string;
  priceId: string;
  checkoutUrl?: string;
}

export interface CheckoutMetadata {
  repositoryId: string;
  email: string;
  githubUsername: string;
  purchaseId?: string;
}

export interface PaymentResult {
  success: boolean;
  purchaseId?: string;
  customerId?: string;
  subscriptionId?: string;
  paymentIntentId?: string;
  amountCents?: number;
  metadata?: Record<string, any>;
  error?: string;
}

export interface WebhookEvent {
  type: string;
  data: any;
  raw: string;
  signature?: string;
}

/**
 * User payment provider credentials
 */
export interface UserPaymentCredentials {
  provider: PaymentProvider;
  credentials: {
    // Stripe
    stripeSecretKey?: string;
    stripePublishableKey?: string;

    // Lemon Squeezy
    lemonSqueezyApiKey?: string;
    lemonSqueezyStoreId?: string;

    // Gumroad
    gumroadAccessToken?: string;

    // Paddle
    paddleVendorId?: string;
    paddleApiKey?: string;
  };
}
