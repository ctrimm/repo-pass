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
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: 'purchase-123',
          status: 'pending',
        }]),
      }),
    }),
  },
  repositories: {},
  purchases: {},
}));

vi.mock('../../lib/stripe', () => ({
  createCheckoutSession: vi.fn().mockResolvedValue({
    sessionId: 'cs_test_123',
    sessionUrl: 'https://checkout.stripe.com/test',
  }),
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
    const { createCheckoutSession } = await import('../../lib/stripe');

    const repoId = '123e4567-e89b-12d3-a456-426614174000';

    vi.mocked(db.query.repositories.findFirst).mockResolvedValue({
      id: repoId,
      displayName: 'Test Repo',
      slug: 'test-repo',
      priceCents: 4900,
      pricingType: 'one-time',
      subscriptionCadence: null,
      active: true,
      githubOwner: 'test-owner',
      githubRepoName: 'test-repo',
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
    expect(createCheckoutSession).toHaveBeenCalled();

    const data = await response.json();
    expect(data.sessionId).toBe('cs_test_123');
    expect(data.sessionUrl).toBe('https://checkout.stripe.com/test');
  });
});
