import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit } from './rate-limit';

describe('Rate Limiting', () => {
  beforeEach(() => {
    // Clear mocks between tests
    vi.clearAllMocks();
  });

  it('should allow requests within limit', () => {
    const result = checkRateLimit('test-key', 5, 60000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
  });

  it('should block requests exceeding limit', () => {
    const key = 'test-limit';

    // Make 5 requests (at limit)
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, 5, 60000);
    }

    // 6th request should be blocked
    const result = checkRateLimit(key, 5, 60000);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should reset after time window', async () => {
    const key = 'test-reset';

    // First request
    const first = checkRateLimit(key, 2, 100); // 100ms window
    expect(first.allowed).toBe(true);

    // Second request (at limit)
    const second = checkRateLimit(key, 2, 100);
    expect(second.allowed).toBe(true);

    // Third request (over limit)
    const third = checkRateLimit(key, 2, 100);
    expect(third.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should be allowed again
    const fourth = checkRateLimit(key, 2, 100);
    expect(fourth.allowed).toBe(true);
  });
});
