/// <reference path="./.sst/platform/config.d.ts" />

/**
 * SST v3 (Ion) Configuration for RepoPass
 *
 * Ultra-low-cost serverless deployment using:
 * - Neon PostgreSQL (serverless, scales to zero, FREE tier)
 * - Upstash Redis (serverless, FREE tier for low traffic)
 * - AWS Lambda (FREE tier: 1M requests/mo)
 * - CloudFront CDN
 *
 * Estimated monthly cost: $0-5 for low traffic! 🎉
 */

export default $config({
  app(input) {
    return {
      name: "repo-pass",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
        },
      },
    };
  },
  async run() {
    // Secrets for external services
    const databaseUrl = new sst.Secret("DatabaseUrl"); // Neon connection string
    const redisUrl = new sst.Secret("RedisUrl"); // Upstash connection string

    // Application secrets
    const jwtSecret = new sst.Secret("JwtSecret");
    const sessionSecret = new sst.Secret("SessionSecret");
    const githubClientSecret = new sst.Secret("GitHubClientSecret");
    const githubPat = new sst.Secret("GitHubPAT");
    const stripeSecretKey = new sst.Secret("StripeSecretKey");
    const stripeWebhookSecret = new sst.Secret("StripeWebhookSecret");
    const resendApiKey = new sst.Secret("ResendApiKey");
    const posthogApiKey = new sst.Secret("PostHogApiKey");
    const adminEmail = new sst.Secret("AdminEmail");

    // Astro SSR Application (deployed as Lambda functions)
    const web = new sst.aws.Astro("RepoPassWeb", {
      path: ".",
      link: [
        databaseUrl,
        redisUrl,
        jwtSecret,
        sessionSecret,
        githubClientSecret,
        githubPat,
        stripeSecretKey,
        stripeWebhookSecret,
        resendApiKey,
        posthogApiKey,
        adminEmail,
      ],
      environment: {
        // Application
        NODE_ENV: $app.stage === "production" ? "production" : "development",
        SITE_URL: $app.stage === "production"
          ? "https://repopass.com"
          : `https://${$app.stage}.repopass.com`,

        // GitHub OAuth
        GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || "",

        // Stripe
        STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || "",

        // Email
        EMAIL_FROM: process.env.EMAIL_FROM || "noreply@repopass.com",

        // Admin
        ADMIN_EMAIL: process.env.ADMIN_EMAIL || "",

        // PostHog (optional)
        POSTHOG_HOST: "https://app.posthog.com",
      },
      domain: $app.stage === "production"
        ? {
            name: "repopass.com",
            dns: sst.cloudflare.dns(),
          }
        : undefined,
    });

    // Outputs
    return {
      web: web.url,
    };
  },
});
