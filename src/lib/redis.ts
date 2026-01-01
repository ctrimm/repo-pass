import { createClient } from 'redis';
import { env } from './env';

let client: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
  if (!client) {
    client = createClient({
      url: env.REDIS_URL,
    });

    client.on('error', (err) => console.error('Redis Client Error:', err));

    await client.connect();
  }

  return client;
}

/**
 * Rate limiting helper
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const redis = await getRedisClient();

  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, windowSeconds);
  }

  const remaining = Math.max(0, limit - current);

  return {
    allowed: current <= limit,
    remaining,
  };
}

/**
 * Cache helper
 */
export async function cache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const redis = await getRedisClient();

  // Try to get from cache
  const cached = await redis.get(key);

  if (cached) {
    return JSON.parse(cached) as T;
  }

  // Execute function and cache result
  const result = await fn();
  await redis.setEx(key, ttlSeconds, JSON.stringify(result));

  return result;
}
