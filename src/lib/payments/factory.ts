/**
 * Payment Provider Factory
 *
 * Creates and initializes payment providers based on user credentials
 */

import type { IPaymentProvider } from './provider';
import type { PaymentProvider, UserPaymentCredentials } from './types';
import { StripeProvider } from './providers/stripe';
import { LemonSqueezyProvider } from './providers/lemon-squeezy';
import { GumroadProvider } from './providers/gumroad';
import { PaddleProvider } from './providers/paddle';

export class PaymentProviderFactory {
  /**
   * Create a payment provider instance
   */
  static create(providerType: PaymentProvider): IPaymentProvider {
    switch (providerType) {
      case 'stripe':
        return new StripeProvider();
      case 'lemon_squeezy':
        return new LemonSqueezyProvider();
      case 'gumroad':
        return new GumroadProvider();
      case 'paddle':
        return new PaddleProvider();
      default:
        throw new Error(`Unsupported payment provider: ${providerType}`);
    }
  }

  /**
   * Create and initialize a payment provider from user credentials
   */
  static async createAndInitialize(credentials: UserPaymentCredentials): Promise<IPaymentProvider> {
    const provider = this.create(credentials.provider);
    await provider.initialize(credentials);
    return provider;
  }
}

/**
 * Get user's payment provider credentials from database user record
 */
export function getUserPaymentCredentials(user: any): UserPaymentCredentials | null {
  if (!user.paymentProvider) {
    return null;
  }

  return {
    provider: user.paymentProvider as PaymentProvider,
    credentials: {
      stripeSecretKey: user.stripeSecretKey || undefined,
      stripePublishableKey: user.stripePublishableKey || undefined,
      lemonSqueezyApiKey: user.lemonSqueezyApiKey || undefined,
      lemonSqueezyStoreId: user.lemonSqueezyStoreId || undefined,
      gumroadAccessToken: user.gumroadAccessToken || undefined,
      paddleVendorId: user.paddleVendorId || undefined,
      paddleApiKey: user.paddleApiKey || undefined,
    },
  };
}

/**
 * Check if user has configured a payment provider
 */
export function hasPaymentProvider(user: any): boolean {
  return user.paymentProvider !== null && user.paymentProvider !== undefined;
}

/**
 * Validate payment provider credentials are complete
 */
export function validateCredentials(credentials: UserPaymentCredentials): boolean {
  const { provider, credentials: creds } = credentials;

  switch (provider) {
    case 'stripe':
      return !!(creds.stripeSecretKey && creds.stripePublishableKey);
    case 'lemon_squeezy':
      return !!(creds.lemonSqueezyApiKey && creds.lemonSqueezyStoreId);
    case 'gumroad':
      return !!creds.gumroadAccessToken;
    case 'paddle':
      return !!(creds.paddleVendorId && creds.paddleApiKey);
    default:
      return false;
  }
}
