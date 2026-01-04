/**
 * Paddle Payment Provider Implementation
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

export class PaddleProvider implements IPaymentProvider {
  private vendorId: string | null = null;
  private apiKey: string | null = null;
  private baseUrl = 'https://api.paddle.com';

  getName(): string {
    return 'paddle';
  }

  async initialize(credentials: UserPaymentCredentials): Promise<void> {
    if (credentials.provider !== 'paddle') {
      throw new Error('Invalid provider credentials');
    }

    const { paddleVendorId, paddleApiKey } = credentials.credentials;
    if (!paddleVendorId || !paddleApiKey) {
      throw new Error('Paddle vendor ID and API key are required');
    }

    this.vendorId = paddleVendorId;
    this.apiKey = paddleApiKey;
  }

  private async fetch(endpoint: string, data: Record<string, any> = {}): Promise<any> {
    if (!this.vendorId || !this.apiKey) {
      throw new Error('Paddle not initialized');
    }

    const formData = new URLSearchParams({
      vendor_id: this.vendorId,
      vendor_auth_code: this.apiKey,
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
      throw new Error(`Paddle API error: ${response.statusText}`);
    }

    return response.json();
  }

  async createProduct(
    productDetails: ProductDetails,
    priceDetails: PriceDetails
  ): Promise<CreateProductResult> {
    const endpoint =
      priceDetails.interval === 'one-time'
        ? '/2.0/product/generate_pay_link'
        : '/2.0/subscription/plans_create';

    const result = await this.fetch(endpoint, {
      product_title: productDetails.name,
      product_description: productDetails.description || '',
      price: priceDetails.amountCents / 100,
      currency: priceDetails.currency.toUpperCase(),
      ...(priceDetails.interval !== 'one-time' && {
        billing_type: 'month',
        billing_period: priceDetails.interval === 'month' ? 1 : 12,
      }),
    });

    const productId = result.response?.product_id || result.response?.plan_id || '';

    return {
      productId,
      priceId: productId, // Paddle doesn't separate price from product
    };
  }

  async updateProduct(productId: string, productDetails: Partial<ProductDetails>): Promise<void> {
    // Paddle doesn't support updating products via API
    // Products must be updated through the Paddle dashboard
    throw new Error('Paddle product updates must be done through Paddle dashboard');
  }

  async updatePrice(productId: string, priceDetails: PriceDetails): Promise<string> {
    // Create new product with updated price
    // Paddle doesn't support price updates for existing products
    throw new Error('Paddle price updates require creating a new product');
  }

  async createCheckoutUrl(priceId: string, metadata: CheckoutMetadata): Promise<string> {
    if (!this.vendorId) {
      throw new Error('Paddle not initialized');
    }

    // Paddle checkout uses their overlay widget
    // Generate a pay link
    const result = await this.fetch('/2.0/product/generate_pay_link', {
      product_id: priceId,
      customer_email: metadata.email,
      passthrough: JSON.stringify({
        repositoryId: metadata.repositoryId,
        githubUsername: metadata.githubUsername,
        email: metadata.email,
      }),
    });

    return result.response.url;
  }

  async verifyWebhook(event: WebhookEvent): Promise<boolean> {
    // Paddle webhooks use public key verification
    // Implementation would verify with Paddle's public key
    // For now, return true (implement proper verification in production)
    return true;
  }

  async handlePaymentSuccess(event: WebhookEvent): Promise<PaymentResult> {
    const data = event.data as any;
    const passthrough = data.passthrough ? JSON.parse(data.passthrough) : {};

    return {
      success: true,
      customerId: data.user_id,
      subscriptionId: data.subscription_id,
      amountCents: Math.round(parseFloat(data.sale_gross || '0') * 100),
      metadata: passthrough,
    };
  }

  async handlePaymentFailure(event: WebhookEvent): Promise<PaymentResult> {
    const data = event.data as any;
    const passthrough = data.passthrough ? JSON.parse(data.passthrough) : {};

    return {
      success: false,
      error: 'Payment failed',
      metadata: passthrough,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.fetch('/2.0/subscription/users_cancel', {
      subscription_id: subscriptionId,
    });
  }
}
