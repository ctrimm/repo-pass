// Environment configuration with validation
import { z } from 'zod';
import { getEnv as getSSTEnv, isSST } from './sst';

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SITE_URL: z.string().url(),
  PORT: z.string().default('4321'),

  // Database
  DATABASE_URL: z.string(),

  // Redis
  REDIS_URL: z.string(),

  // GitHub
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  GITHUB_PERSONAL_ACCESS_TOKEN: z.string(),

  // Stripe
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_PUBLISHABLE_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),

  // Email
  RESEND_API_KEY: z.string(),
  EMAIL_FROM: z.string().email(),

  // Auth
  JWT_SECRET: z.string().min(32),
  SESSION_SECRET: z.string().min(32),

  // Admin
  ADMIN_EMAIL: z.string().email(),

  // Analytics (PostHog) - Optional
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().optional().default('https://app.posthog.com'),
});

function getEnv() {
  try {
    // Use SST resources if available, otherwise use process.env
    const envSource = isSST() ? getSSTEnv() : process.env;
    return envSchema.parse(envSource);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors.map(e => e.path.join('.')).join(', ');
      throw new Error(`Missing or invalid environment variables: ${missing}`);
    }
    throw error;
  }
}

export const env = getEnv();
