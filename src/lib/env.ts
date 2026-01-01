// Environment configuration with validation
import { z } from 'zod';

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
});

function getEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors.map(e => e.path.join('.')).join(', ');
      throw new Error(`Missing or invalid environment variables: ${missing}`);
    }
    throw error;
  }
}

export const env = getEnv();
