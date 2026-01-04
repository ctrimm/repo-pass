/**
 * Payment Provider Interface
 *
 * Abstract interface that all payment providers must implement
 */

import type {
  ProductDetails,
  PriceDetails,
  CreateProductResult,
  CheckoutMetadata,
  PaymentResult,
  WebhookEvent,
  UserPaymentCredentials,
} from './types';

export interface IPaymentProvider {
  /**
   * Initialize the provider with user credentials
   */
  initialize(credentials: UserPaymentCredentials): Promise<void>;

  /**
   * Create a product in the payment provider's system
   * @param productDetails - Product information
   * @param priceDetails - Pricing information
   * @returns Product and Price IDs from the provider
   */
  createProduct(
    productDetails: ProductDetails,
    priceDetails: PriceDetails
  ): Promise<CreateProductResult>;

  /**
   * Update product details in the payment provider's system
   * @param productId - External product ID
   * @param productDetails - Updated product information
   */
  updateProduct(productId: string, productDetails: Partial<ProductDetails>): Promise<void>;

  /**
   * Update price for a product
   * @param productId - External product ID
   * @param priceDetails - Updated pricing information
   * @returns New price ID
   */
  updatePrice(productId: string, priceDetails: PriceDetails): Promise<string>;

  /**
   * Generate a checkout URL for a product
   * @param priceId - External price ID
   * @param metadata - Additional data to attach to the checkout
   * @returns Checkout URL to redirect user to
   */
  createCheckoutUrl(priceId: string, metadata: CheckoutMetadata): Promise<string>;

  /**
   * Verify webhook authenticity
   * @param event - Webhook event data
   * @returns True if webhook is authentic
   */
  verifyWebhook(event: WebhookEvent): Promise<boolean>;

  /**
   * Handle successful payment from webhook
   * @param event - Webhook event data
   * @returns Payment result with metadata
   */
  handlePaymentSuccess(event: WebhookEvent): Promise<PaymentResult>;

  /**
   * Handle failed payment from webhook
   * @param event - Webhook event data
   * @returns Payment result with error
   */
  handlePaymentFailure(event: WebhookEvent): Promise<PaymentResult>;

  /**
   * Cancel a subscription
   * @param subscriptionId - External subscription ID
   */
  cancelSubscription(subscriptionId: string): Promise<void>;

  /**
   * Get provider name
   */
  getName(): string;
}
