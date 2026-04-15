import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env
vi.mock('../../lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    SITE_URL: 'http://localhost:4321',
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
      purchases: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 'purchase-free-123',
            status: 'completed',
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
  repositories: { id: {} },
  purchases: { id: {}, repositoryId: {}, githubUsername: {} },
  users: { id: {} },
}));

vi.mock('../../lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  emailTemplates: {
    accessGranted: vi.fn().mockReturnValue({
      subject: 'Access Granted',
      html: '<p>Access Granted</p>',
    }),
  },
}));

vi.mock('../../lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({
    allowed: true,
  }),
  getClientId: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('../../lib/github', () => ({
  addCollaborator: vi.fn().mockResolvedValue(true),
}));

import { POST } from './free-access';

describe('POST /api/free-access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should grant access with only githubUsername when email is not required', async () => {
    const { db } = await import('../../db');

    const repoId = '123e4567-e89b-12d3-a456-426614174000';
    const userId = 'user-123';

    vi.mocked(db.query.repositories.findFirst).mockResolvedValue({
      id: repoId,
      ownerId: userId,
      displayName: 'Free Repo',
      githubOwner: 'test-owner',
      githubRepoName: 'free-repo',
      pricingType: 'free',
      requireEmailForFree: false,
      active: true,
    } as any);

    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      id: userId,
      githubPersonalAccessToken: 'ghp_test_token',
      emailNotifications: true,
    } as any);

    vi.mocked(db.query.purchases.findFirst).mockResolvedValue(undefined);

    const request = new Request('http://localhost/api/free-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repositoryId: repoId,
        githubUsername: 'testuser',
      }),
    });

    const response = await POST({ request } as any);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);

    // Verify purchase was created with fallback email
    expect(db.insert).toHaveBeenCalled();
    // Verification of collaborator add
    const { addCollaborator } = await import('../../lib/github');
    expect(addCollaborator).toHaveBeenCalled();
  });

  it('should return 400 if email is required but not provided', async () => {
    const { db } = await import('../../db');

    const repoId = '123e4567-e89b-12d3-a456-426614174000';

    vi.mocked(db.query.repositories.findFirst).mockResolvedValue({
      id: repoId,
      pricingType: 'free',
      requireEmailForFree: true,
      active: true,
    } as any);

    const request = new Request('http://localhost/api/free-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repositoryId: repoId,
        githubUsername: 'testuser',
      }),
    });

    const response = await POST({ request } as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Email address is required for this repository');
  });
});
