/**
 * Lemon Squeezy Payment Provider Implementation
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

export class LemonSqueezyProvider implements IPaymentProvider {
  private apiKey: string | null = null;
  private storeId: string | null = null;
  private baseUrl = 'https://api.lemonsqueezy.com/v1';

  getName(): string {
    return 'lemon_squeezy';
  }

  async initialize(credentials: UserPaymentCredentials): Promise<void> {
    if (credentials.provider !== 'lemon_squeezy') {
      throw new Error('Invalid provider credentials');
    }

    const { lemonSqueezyApiKey, lemonSqueezyStoreId } = credentials.credentials;
    if (!lemonSqueezyApiKey || !lemonSqueezyStoreId) {
      throw new Error('Lemon Squeezy API key and Store ID are required');
    }

    this.apiKey = lemonSqueezyApiKey;
    this.storeId = lemonSqueezyStoreId;
  }

  private async fetch(endpoint: string, options: RequestInit = {}): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Lemon Squeezy not initialized');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Lemon Squeezy API error: ${response.statusText}`);
    }

    return response.json();
  }

  async createProduct(
    productDetails: ProductDetails,
    priceDetails: PriceDetails
  ): Promise<CreateProductResult> {
    if (!this.storeId) {
      throw new Error('Lemon Squeezy not initialized');
    }

    // Create product
    const productResponse = await this.fetch('/products', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'products',
          attributes: {
            store_id: parseInt(this.storeId),
            name: productDetails.name,
            description: productDetails.description || '',
          },
        },
      }),
    });

    const productId = productResponse.data.id;

    // Create variant (price)
    const variantResponse = await this.fetch('/variants', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'variants',
          attributes: {
            product_id: productId,
            name: 'Default',
            price: priceDetails.amountCents / 100, // LS uses dollars
            interval: priceDetails.interval === 'one-time' ? null : priceDetails.interval,
          },
        },
      }),
    });

    const variantId = variantResponse.data.id;

    return {
      productId,
      priceId: variantId,
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

    await this.fetch(`/products/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'products',
          id: productId,
          attributes: updateData,
        },
      }),
    });
  }

  async updatePrice(productId: string, priceDetails: PriceDetails): Promise<string> {
    // Create new variant with updated price
    const variantResponse = await this.fetch('/variants', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'variants',
          attributes: {
            product_id: productId,
            name: 'Updated Price',
            price: priceDetails.amountCents / 100,
            interval: priceDetails.interval === 'one-time' ? null : priceDetails.interval,
          },
        },
      }),
    });

    return variantResponse.data.id;
  }

  async createCheckoutUrl(priceId: string, metadata: CheckoutMetadata): Promise<string> {
    if (!this.storeId) {
      throw new Error('Lemon Squeezy not initialized');
    }

    const checkoutResponse = await this.fetch('/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            store_id: parseInt(this.storeId),
            variant_id: parseInt(priceId),
            custom_price: null,
            checkout_data: {
              email: metadata.email,
              custom: {
                repositoryId: metadata.repositoryId,
                githubUsername: metadata.githubUsername,
              },
            },
          },
        },
      }),
    });

    return checkoutResponse.data.attributes.url;
  }

  async verifyWebhook(event: WebhookEvent): Promise<boolean> {
    // Lemon Squeezy uses signature verification
    // Implementation would verify HMAC signature
    // For now, return true (implement proper verification in production)
    return true;
  }

  async handlePaymentSuccess(event: WebhookEvent): Promise<PaymentResult> {
    const data = event.data as any;

    return {
      success: true,
      customerId: data.attributes?.customer_id,
      subscriptionId: data.attributes?.subscription_id,
      amountCents: Math.round((data.attributes?.total || 0) * 100),
      metadata: data.attributes?.custom_data || {},
    };
  }

  async handlePaymentFailure(event: WebhookEvent): Promise<PaymentResult> {
    return {
      success: false,
      error: 'Payment failed',
      metadata: event.data?.attributes?.custom_data || {},
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.fetch(`/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
    });
  }
}
