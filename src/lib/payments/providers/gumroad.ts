/**
 * Gumroad Payment Provider Implementation
 */

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

export class GumroadProvider implements IPaymentProvider {
  private accessToken: string | null = null;
  private baseUrl = 'https://api.gumroad.com/v2';

  getName(): string {
    return 'gumroad';
  }

  async initialize(credentials: UserPaymentCredentials): Promise<void> {
    if (credentials.provider !== 'gumroad') {
      throw new Error('Invalid provider credentials');
    }

    const { gumroadAccessToken } = credentials.credentials;
    if (!gumroadAccessToken) {
      throw new Error('Gumroad access token is required');
    }

    this.accessToken = gumroadAccessToken;
  }

  private async fetch(endpoint: string, data: Record<string, any> = {}): Promise<any> {
    if (!this.accessToken) {
      throw new Error('Gumroad not initialized');
    }

    const formData = new URLSearchParams({
      access_token: this.accessToken,
      ...data,
    });

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      throw new Error(`Gumroad API error: ${response.statusText}`);
    }

    return response.json();
  }

  async createProduct(
    productDetails: ProductDetails,
    priceDetails: PriceDetails
  ): Promise<CreateProductResult> {
    const result = await this.fetch('/products', {
      name: productDetails.name,
      description: productDetails.description || '',
      price: priceDetails.amountCents / 100, // Gumroad uses dollars
      currency: priceDetails.currency.toUpperCase(),
      // Gumroad doesn't have native subscriptions in API
      // Would need to use their UI for subscription setup
    });

    const productId = result.product.id;

    return {
      productId,
      priceId: productId, // Gumroad doesn't separate price from product
    };
  }

  async updateProduct(productId: string, productDetails: Partial<ProductDetails>): Promise<void> {
    const updateData: any = {};

    if (productDetails.name) {
      updateData.name = productDetails.name;
    }
    if (productDetails.description !== undefined) {
      updateData.description = productDetails.description;
    }

    await this.fetch(`/products/${productId}`, updateData);
  }

  async updatePrice(productId: string, priceDetails: PriceDetails): Promise<string> {
    await this.fetch(`/products/${productId}`, {
      price: priceDetails.amountCents / 100,
    });

    return productId; // Gumroad doesn't separate price ID
  }

  async createCheckoutUrl(priceId: string, metadata: CheckoutMetadata): Promise<string> {
    // Gumroad uses a simple permalink structure
    // You'd need to get the product permalink from the API
    const result = await this.fetch(`/products/${priceId}`);
    const permalink = result.product.short_url || result.product.url;

    // Append custom fields as query params
    const url = new URL(permalink);
    url.searchParams.set('wanted', 'true');
    url.searchParams.set('email', metadata.email);

    return url.toString();
  }

  async verifyWebhook(event: WebhookEvent): Promise<boolean> {
    // Gumroad webhooks don't have signature verification
    // You'd verify by checking the ping endpoint
    // For now, return true (implement IP whitelist in production)
    return true;
  }

  async handlePaymentSuccess(event: WebhookEvent): Promise<PaymentResult> {
    const data = event.data as any;

    return {
      success: true,
      customerId: data.purchaser_id,
      amountCents: Math.round(parseFloat(data.price || '0') * 100),
      metadata: {
        email: data.email,
        githubUsername: data.custom_fields?.github_username,
        repositoryId: data.custom_fields?.repository_id,
      },
    };
  }

  async handlePaymentFailure(event: WebhookEvent): Promise<PaymentResult> {
    return {
      success: false,
      error: 'Payment failed',
      metadata: event.data || {},
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    // Gumroad subscriptions are managed through their UI
    throw new Error('Gumroad subscription cancellation must be done through Gumroad dashboard');
  }
}
