import posthog from 'posthog-js';
import { env } from './env';

// Analytics provider type for future extensibility
type AnalyticsProvider = 'posthog' | 'none';

interface AnalyticsEvent {
  event: string;
  properties?: Record<string, any>;
}

interface AnalyticsUser {
  userId: string;
  email?: string;
  properties?: Record<string, any>;
}

/**
 * Analytics abstraction layer
 * Allows easy swapping between analytics providers (PostHog, Amplitude, Mixpanel, etc.)
 */
class Analytics {
  private provider: AnalyticsProvider;
  private initialized = false;

  constructor() {
    this.provider = env.POSTHOG_API_KEY ? 'posthog' : 'none';
  }

  /**
   * Initialize analytics provider (client-side only)
   */
  init() {
    if (this.initialized || typeof window === 'undefined') return;

    if (this.provider === 'posthog' && env.POSTHOG_API_KEY) {
      posthog.init(env.POSTHOG_API_KEY, {
        api_host: env.POSTHOG_HOST || 'https://app.posthog.com',
        loaded: (posthog) => {
          if (env.NODE_ENV === 'development') {
            posthog.opt_out_capturing(); // Don't track in dev
          }
        },
      });
      this.initialized = true;
    }
  }

  /**
   * Track an event
   */
  track(event: string, properties?: Record<string, any>) {
    if (this.provider === 'posthog' && this.initialized) {
      posthog.capture(event, properties);
    }

    // Log in development
    if (env.NODE_ENV === 'development') {
      console.log('📊 Analytics:', event, properties);
    }
  }

  /**
   * Identify a user
   */
  identify(userId: string, properties?: Record<string, any>) {
    if (this.provider === 'posthog' && this.initialized) {
      posthog.identify(userId, properties);
    }

    if (env.NODE_ENV === 'development') {
      console.log('👤 User identified:', userId, properties);
    }
  }

  /**
   * Reset user identity (on logout)
   */
  reset() {
    if (this.provider === 'posthog' && this.initialized) {
      posthog.reset();
    }
  }

  /**
   * Set user properties
   */
  setUserProperties(properties: Record<string, any>) {
    if (this.provider === 'posthog' && this.initialized) {
      posthog.people.set(properties);
    }
  }

  /**
   * Track page view
   */
  pageView(url?: string) {
    if (this.provider === 'posthog' && this.initialized) {
      posthog.capture('$pageview', { url });
    }
  }
}

// Singleton instance
export const analytics = new Analytics();

/**
 * Server-side analytics tracking
 * For tracking backend events (purchases, access grants, etc.)
 */
export async function trackServerEvent(event: string, properties?: Record<string, any>) {
  // PostHog server-side tracking (optional)
  if (env.POSTHOG_API_KEY && env.NODE_ENV === 'production') {
    try {
      await fetch(`${env.POSTHOG_HOST || 'https://app.posthog.com'}/capture/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: env.POSTHOG_API_KEY,
          event,
          properties: {
            ...properties,
            $lib: 'repo-pass-server',
          },
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      console.error('Failed to track server event:', error);
    }
  }

  // Always log in development
  if (env.NODE_ENV === 'development') {
    console.log('📊 Server Event:', event, properties);
  }
}

/**
 * Predefined analytics events for consistency
 */
export const AnalyticsEvents = {
  // Purchase events
  PURCHASE_INITIATED: 'purchase_initiated',
  PURCHASE_COMPLETED: 'purchase_completed',
  PURCHASE_FAILED: 'purchase_failed',

  // Access events
  ACCESS_GRANTED: 'access_granted',
  ACCESS_REVOKED: 'access_revoked',
  ACCESS_FAILED: 'access_failed',

  // Repository events
  REPOSITORY_CREATED: 'repository_created',
  REPOSITORY_UPDATED: 'repository_updated',
  REPOSITORY_DEACTIVATED: 'repository_deactivated',
  PRICE_CHANGED: 'price_changed',

  // Subscription events
  SUBSCRIPTION_CREATED: 'subscription_created',
  SUBSCRIPTION_RENEWED: 'subscription_renewed',
  SUBSCRIPTION_CANCELED: 'subscription_canceled',
  PAYMENT_FAILED: 'payment_failed',

  // Admin events
  ADMIN_LOGIN: 'admin_login',
  ADMIN_LOGOUT: 'admin_logout',
  CUSTOMER_REVOKED_MANUALLY: 'customer_revoked_manually',

  // Product page events
  PRODUCT_VIEWED: 'product_viewed',
  CHECKOUT_STARTED: 'checkout_started',
} as const;
