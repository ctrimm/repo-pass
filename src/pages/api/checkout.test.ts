import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env first
vi.mock('../../lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    SITE_URL: 'http://localhost:4321',
    JWT_SECRET: 'test',
    SESSION_SECRET: 'test',
  },
}));

// Mock dependencies
vi.mock('../../db', () => ({
  db: {
    query: {
      repositories: {
        findFirst: vi.fn(),
      },
      users: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 'purchase-123',
            status: 'pending',
          },
        ]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
  repositories: {},
  purchases: {},
  users: {},
}));

vi.mock('../../lib/crypto', () => ({
  decrypt: vi.fn((value) => value), // Return value as-is for tests
}));

vi.mock('../../lib/payments/factory', () => ({
  PaymentProviderFactory: {
    createAndInitialize: vi.fn().mockResolvedValue({
      createProduct: vi.fn().mockResolvedValue({
        productId: 'prod_test_123',
        priceId: 'price_test_123',
      }),
      createCheckoutUrl: vi.fn().mockResolvedValue('https://checkout.example.com/test'),
    }),
  },
  getUserPaymentCredentials: vi.fn().mockReturnValue({
    provider: 'stripe',
    credentials: {
      stripeSecretKey: 'sk_test_123',
      stripePublishableKey: 'pk_test_123',
    },
  }),
  hasPaymentProvider: vi.fn().mockReturnValue(true),
}));

vi.mock('../../lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  emailTemplates: {
    purchaseConfirmation: vi.fn().mockReturnValue({
      subject: 'Test',
      html: '<p>Test</p>',
    }),
  },
}));

vi.mock('../../lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({
    allowed: true,
    limit: 5,
    remaining: 4,
    resetAt: Date.now() + 60000,
  }),
  getClientId: vi.fn().mockReturnValue('127.0.0.1'),
}));

import { POST } from './checkout';

describe('POST /api/checkout', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset rate limit mock to default "allowed" state
    const { checkRateLimit } = await import('../../lib/rate-limit');
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: true,
      limit: 5,
      remaining: 4,
      resetAt: Date.now() + 60000,
    });
  });

  it('should return 400 for invalid request body', async () => {
    const request = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: 'data' }),
    });

    const response = await POST({ request } as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid request');
  });

  it('should return 404 for inactive repository', async () => {
    const { db } = await import('../../db');
    vi.mocked(db.query.repositories.findFirst).mockResolvedValue(undefined);

    const request = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repositoryId: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        githubUsername: 'testuser',
      }),
    });

    const response = await POST({ request } as any);

    expect(response.status).toBe(404);
  });

  it('should return 429 when rate limited', async () => {
    const { checkRateLimit } = await import('../../lib/rate-limit');
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      limit: 5,
      remaining: 0,
      resetAt: Date.now() + 30000,
    });

    const request = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repositoryId: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        githubUsername: 'testuser',
      }),
    });

    const response = await POST({ request } as any);

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toBe('Too many requests');
  });

  it('should create checkout session for valid request', async () => {
    const { db } = await import('../../db');
    const { PaymentProviderFactory } = await import('../../lib/payments/factory');

    const repoId = '123e4567-e89b-12d3-a456-426614174000';
    const userId = 'user-123';

    vi.mocked(db.query.repositories.findFirst).mockResolvedValue({
      id: repoId,
      ownerId: userId,
      displayName: 'Test Repo',
      slug: 'test-repo',
      priceCents: 4900,
      pricingType: 'one-time',
      subscriptionCadence: null,
      active: true,
      githubOwner: 'test-owner',
      githubRepoName: 'test-repo',
      externalProductId: 'prod_test_123',
      externalPriceId: 'price_test_123',
    } as any);

    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      id: userId,
      email: 'owner@example.com',
      paymentProvider: 'stripe',
      stripeSecretKey: 'sk_test_123',
      stripePublishableKey: 'pk_test_123',
    } as any);

    const request = new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repositoryId: repoId,
        email: 'test@example.com',
        githubUsername: 'testuser',
      }),
    });

    const response = await POST({ request } as any);

    expect(response.status).toBe(200);
    expect(PaymentProviderFactory.createAndInitialize).toHaveBeenCalled();

    const data = await response.json();
    expect(data.checkoutUrl).toBe('https://checkout.example.com/test');
    expect(data.provider).toBe('stripe');
  });
});
