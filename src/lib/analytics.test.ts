import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env before importing analytics
vi.mock('./env', () => ({
  env: {
    NODE_ENV: 'test',
    POSTHOG_API_KEY: '',
    POSTHOG_HOST: 'https://app.posthog.com',
  },
}));

import { analytics, AnalyticsEvents } from './analytics';

describe('Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should track events without throwing', () => {
    expect(() => {
      analytics.track(AnalyticsEvents.PURCHASE_COMPLETED, {
        repositoryId: 'test-repo',
        amountCents: 4900,
      });
    }).not.toThrow();
  });

  it('should identify users without throwing', () => {
    expect(() => {
      analytics.identify('user-123', {
        email: 'test@example.com',
      });
    }).not.toThrow();
  });

  it('should capture errors without throwing', () => {
    expect(() => {
      analytics.captureError(new Error('Test error'), {
        context: 'test',
      });
    }).not.toThrow();
  });
});
