/**
 * SST Resource Integration
 *
 * This file provides helpers to access SST-linked resources
 * and fallback to environment variables for local development.
 */

import { Resource } from 'sst';

/**
 * Check if running in SST environment
 */
export function isSST(): boolean {
  try {
    // Check if we're actually in an SST deployment with accessible resources
    return (
      // @ts-expect-error - SST Resource types are generated at runtime
      typeof Resource !== 'undefined' && Resource !== null && Resource.DatabaseUrl !== undefined
    );
  } catch {
    return false;
  }
}

/**
 * Get database URL from SST or environment
 */
export function getDatabaseUrl(): string {
  if (isSST()) {
    try {
      // @ts-expect-error - SST Resource types are generated at runtime
      return Resource.DatabaseUrl.value;
    } catch {
      // Fall through to env var
    }
  }
  return process.env.DATABASE_URL || '';
}

/**
 * Get secret value from SST or environment
 */
export function getSecret(sstName: string, envName: string): string {
  if (isSST()) {
    try {
      // @ts-expect-error - SST Resource types are generated at runtime
      const value = Resource[sstName]?.value;
      if (value) return value;
    } catch {
      // Fall through to env var
    }
  }
  return process.env[envName] || '';
}

/**
 * Get all environment variables, preferring SST resources
 */
export function getEnv() {
  return {
    // Database
    DATABASE_URL: getDatabaseUrl(),

    // Secrets
    JWT_SECRET: getSecret('JwtSecret', 'JWT_SECRET'),
    SESSION_SECRET: getSecret('SessionSecret', 'SESSION_SECRET'),
    GITHUB_CLIENT_SECRET: getSecret('GitHubClientSecret', 'GITHUB_CLIENT_SECRET'),
    GITHUB_PERSONAL_ACCESS_TOKEN: getSecret('GitHubPAT', 'GITHUB_PERSONAL_ACCESS_TOKEN'),
    STRIPE_SECRET_KEY: getSecret('StripeSecretKey', 'STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: getSecret('StripeWebhookSecret', 'STRIPE_WEBHOOK_SECRET'),
    RESEND_API_KEY: getSecret('ResendApiKey', 'RESEND_API_KEY'),
    POSTHOG_API_KEY: getSecret('PostHogApiKey', 'POSTHOG_API_KEY'),
    ADMIN_EMAIL: getSecret('AdminEmail', 'ADMIN_EMAIL'),

    // Environment variables (not secrets)
    NODE_ENV: process.env.NODE_ENV || 'development',
    SITE_URL: process.env.SITE_URL || 'http://localhost:4321',
    PORT: process.env.PORT || '4321',
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
    EMAIL_FROM: process.env.EMAIL_FROM || '',
    POSTHOG_HOST: process.env.POSTHOG_HOST || 'https://app.posthog.com',
  };
}
