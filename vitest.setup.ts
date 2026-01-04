import { beforeAll } from 'vitest';

// Set up test environment variables
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.SITE_URL = 'http://localhost:4321';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.GITHUB_CLIENT_ID = 'test_client_id';
  process.env.GITHUB_CLIENT_SECRET = 'test_client_secret';
  process.env.GITHUB_PERSONAL_ACCESS_TOKEN = 'ghp_test_token';
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_123';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';
  process.env.RESEND_API_KEY = 're_test_123';
  process.env.EMAIL_FROM = 'test@example.com';
  process.env.JWT_SECRET = 'test_jwt_secret_at_least_32_chars_long';
  process.env.SESSION_SECRET = 'test_session_secret_at_least_32_chars';
  process.env.ADMIN_EMAIL = 'admin@example.com';
  process.env.POSTHOG_API_KEY = '';
  process.env.POSTHOG_HOST = 'https://app.posthog.com';
});
