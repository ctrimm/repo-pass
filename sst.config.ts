/// <reference path="./.sst/platform/config.d.ts" />

/**
 * SST v3 (Ion) Configuration for RepoPass
 *
 * Deploys a fully serverless Astro SSR application with:
 * - PostgreSQL RDS with Proxy (serverless-friendly)
 * - ElastiCache Redis
 * - Secrets management
 * - CloudFront CDN
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
    // VPC for database and Redis
    const vpc = new sst.aws.Vpc("RepoPassVpc", {
      nat: "ec2", // Use EC2 NAT for lower cost (~$5/mo vs $30/mo NAT Gateway)
    });

    // PostgreSQL Database with RDS Proxy
    const database = new sst.aws.Postgres("RepoPassDB", {
      vpc,
      proxy: true, // Enable RDS Proxy for serverless Lambda connections
      version: "16.4",
      instance: $app.stage === "production" ? "t4g.small" : "t4g.micro",
      storage: $app.stage === "production" ? "100 GB" : "20 GB",
      scaling: {
        min: 0.5, // Minimum ACUs for Aurora Serverless v2
        max: $app.stage === "production" ? 4 : 2,
      },
    });

    // Redis Cache
    const redis = new sst.aws.Redis("RepoPassCache", {
      vpc,
      instance: $app.stage === "production" ? "cache.t4g.small" : "cache.t4g.micro",
    });

    // Secrets
    const jwtSecret = new sst.Secret("JwtSecret");
    const sessionSecret = new sst.Secret("SessionSecret");
    const githubClientSecret = new sst.Secret("GitHubClientSecret");
    const githubPat = new sst.Secret("GitHubPAT");
    const stripeSecretKey = new sst.Secret("StripeSecretKey");
    const stripeWebhookSecret = new sst.Secret("StripeWebhookSecret");
    const resendApiKey = new sst.Secret("ResendApiKey");
    const posthogApiKey = new sst.Secret("PostHogApiKey", {
      // Optional - can be empty
    });

    // Astro SSR Application
    const web = new sst.aws.Astro("RepoPassWeb", {
      path: ".",
      vpc,
      link: [
        database,
        redis,
        jwtSecret,
        sessionSecret,
        githubClientSecret,
        githubPat,
        stripeSecretKey,
        stripeWebhookSecret,
        resendApiKey,
        posthogApiKey,
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
      database: database.host,
      redis: redis.host,
    };
  },
});
