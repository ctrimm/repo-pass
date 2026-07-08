# TODO - Setup Tasks for Cory

## Required Setup Before Running RepoPass

### 1. GitHub OAuth App Setup
- [ ] Go to https://github.com/settings/developers
- [ ] Click "New OAuth App"
- [ ] Fill in:
  - **Application name**: RepoPass
  - **Homepage URL**: `http://localhost:4321` (dev) or `https://corytrimm.com` (prod)
  - **Authorization callback URL**: `http://localhost:4321/api/auth/github/callback`
- [ ] Copy Client ID → Add to `.env` as `GITHUB_CLIENT_ID`
- [ ] Generate Client Secret → Add to `.env` as `GITHUB_CLIENT_SECRET`

### 2. GitHub Personal Access Token (PAT) — Fallback Only
**Why?** Each signed-in user's own OAuth token (requested with `repo` scope at login) is what
normally adds/removes collaborators on their repos. This global PAT is only a fallback used if a
user's stored token is missing or fails to decrypt — mainly useful for local dev/seeding.

- [ ] Go to https://github.com/settings/tokens
- [ ] Click "Generate new token" → "Generate new token (classic)"
- [ ] Name: "RepoPass Service Token"
- [ ] Select scopes:
  - ✅ `repo` (Full control of private repositories)
- [ ] Click "Generate token"
- [ ] Copy token → Add to `.env` as `GITHUB_PERSONAL_ACCESS_TOKEN`

**⚠️ Important**: Save this token securely! You can't see it again.

### 3. Payment Provider Setup

RepoPass supports four payment providers. The `.env` Stripe keys below are the
platform-level fallback/webhook config; **each signed-in user can additionally
connect their own provider credentials from `/dashboard/settings`** to sell
under their own account — Stripe, Lemon Squeezy, Gumroad, or Paddle.

**Stripe** (the provider `.env` and the local webhook forwarding below are set up for):
- [ ] Sign up at https://stripe.com (if you haven't)
- [ ] Go to https://dashboard.stripe.com/test/apikeys
- [ ] Copy "Publishable key" → Add to `.env` as `STRIPE_PUBLISHABLE_KEY`
- [ ] Copy "Secret key" → Add to `.env` as `STRIPE_SECRET_KEY`
- [ ] Install Stripe CLI: `brew install stripe/stripe-cli/stripe` (macOS)
- [ ] Login: `stripe login`
- [ ] Forward webhooks: `stripe listen --forward-to localhost:4321/api/webhooks/stripe`
- [ ] Copy webhook secret → Add to `.env` as `STRIPE_WEBHOOK_SECRET`

**Lemon Squeezy / Gumroad / Paddle** (optional, no `.env` setup needed):
- [ ] Create an account with the provider
- [ ] Generate an API key (Lemon Squeezy, Gumroad) or vendor ID + API key (Paddle)
- [ ] Add credentials from `/dashboard/settings` → "Payment Provider" after logging in
- [ ] Webhook endpoints already exist at `/api/webhooks/lemon-squeezy`, `/api/webhooks/gumroad`,
      and `/api/webhooks/paddle` — point the provider's webhook config at your deployed URL

### 4. Resend Email Setup
- [ ] Sign up at https://resend.com
- [ ] Go to API Keys: https://resend.com/api-keys
- [ ] Click "Create API Key"
- [ ] Copy key → Add to `.env` as `RESEND_API_KEY`
- [ ] Verify your domain (or use their test domain for now)
- [ ] Update `EMAIL_FROM` in `.env` to match verified domain

### 5. PostHog Analytics Setup (Optional)
- [ ] Sign up at https://posthog.com
- [ ] Go to Project Settings
- [ ] Copy "Project API Key" → Add to `.env` as `POSTHOG_API_KEY`
- [ ] Copy "Host" (usually `https://app.posthog.com`) → Add to `.env` as `POSTHOG_HOST`
- [ ] Analytics will automatically track events (purchases, access grants, etc.)
- [ ] **Note**: Skip this step for now and add later - analytics are optional

### 6. Environment Setup
- [ ] Copy `.env.example` to `.env`: `cp .env.example .env`
- [ ] Fill in all the values from steps 1-4 above
- [ ] Generate JWT secrets:
  ```bash
  openssl rand -base64 32  # Copy to JWT_SECRET
  openssl rand -base64 32  # Copy to SESSION_SECRET
  ```
- [ ] Update `ADMIN_EMAIL` to your email

### 7. Database Setup
- [ ] Start Docker services: `docker-compose up -d`
- [ ] Generate migrations: `npm run db:generate`
- [ ] Run migrations: `npm run db:migrate`
- [ ] Seed database: `npm run db:seed`

### 8. First Run
- [ ] Install dependencies: `npm install`
- [ ] Start dev server: `npm run dev`
- [ ] Visit http://localhost:4321
- [ ] Click "Login" → Should redirect to GitHub OAuth
- [ ] Authorize the app
- [ ] You should be logged into the admin panel!

## Integration with corytrimm.com

To list your premium theme on your personal site:

1. **Create the product in RepoPass**:
   - Login to RepoPass admin panel
   - Add your repository (e.g., `ctrimm/premium-astro-theme`)
   - Set price (e.g., $49 one-time)
   - Product page will be at: `http://localhost:4321/products/premium-astro-theme`

2. **Link from corytrimm.com**:
   - Add a link/button on your site that points to the RepoPass product page
   - Example: "Buy Premium Theme" → `https://repopass.com/products/premium-astro-theme`
   - Or embed the buy button directly (we can build this later)

3. **Customer flow**:
   - Customer clicks link → RepoPass product page
   - Enters GitHub username → Pays with Stripe
   - RepoPass automatically adds them as collaborator
   - Customer gets email with access link

## Serverless Deployment with SST v3 (Ion)

### Overview
Deploy RepoPass as a **fully serverless** application using external services + AWS Lambda. Zero always-on infrastructure costs!

### Architecture (Ultra-Low-Cost)
- **App**: Astro SSR on AWS Lambda (FREE tier: 1M requests/mo)
- **Database**: Neon PostgreSQL (serverless, scales to zero, **FREE tier**)
- **Domain**: repopass.io (via Cloudflare DNS)
- **Secrets**: AWS Secrets Manager via SST
- **CDN**: CloudFront (FREE tier: 1TB/mo)
- **Monthly Cost**: **$0-5** for low traffic! 🎉

### Implementation Plan

#### Phase 1: SST Setup ✅ COMPLETE
- [x] Install SST v3
- [x] Create `sst.config.ts` with Neon + all secrets
- [x] Add SST types to `tsconfig.json`
- [x] Update `.gitignore` for SST artifacts
- [x] Update `src/lib/sst.ts` for external services
- [x] Integrate all database files (`src/db/*.ts`) with SST helpers
- [x] Add `AdminEmail` secret to SST config
- [x] Rate limiting uses an in-memory store (`src/lib/rate-limit.ts`), not Redis
- [ ] Remove the unused `redis` entry from `package.json` (still listed as a dependency but nothing imports it)
- [x] Configure domain to repopass.io
- [x] Add rate limiting to /api/checkout endpoint (5 req/min)

#### Phase 2: External Services Setup
- [ ] **Neon PostgreSQL** (FREE tier)
  - [ ] Sign up at https://neon.tech
  - [ ] Create new project → Select **FREE tier**
  - [ ] Copy connection string (starts with `postgresql://...`)
  - [ ] Add as SST secret:
    ```bash
    npx sst secret set DatabaseUrl "postgresql://username:password@host/database"
    ```
  - [ ] Test connection locally in `.env`: `DATABASE_URL=postgresql://...`
  - [ ] Run migrations: `npx sst shell --stage production` then `npm run db:migrate`

- [ ] **Cloudflare DNS** (for repopass.io domain)
  - [ ] Add repopass.io to Cloudflare account
  - [ ] Update nameservers at domain registrar
  - [ ] Verify DNS propagation before deploying

#### Phase 3: Set Application Secrets
- [ ] Set all required secrets (one-time setup):
  ```bash
  # Generate and set auth secrets
  npx sst secret set JwtSecret $(openssl rand -base64 32)
  npx sst secret set SessionSecret $(openssl rand -base64 32)

  # Set service API keys
  npx sst secret set GitHubClientSecret <from_github_oauth_app>
  npx sst secret set GitHubPAT <from_github_settings>
  npx sst secret set StripeSecretKey <from_stripe_dashboard>
  npx sst secret set StripeWebhookSecret <from_stripe_cli>
  npx sst secret set ResendApiKey <from_resend.com>
  npx sst secret set AdminEmail <your_admin_email>

  # Optional analytics
  npx sst secret set PostHogApiKey <optional>
  ```

#### Phase 4: Deploy & Test
- [ ] Deploy to staging: `npx sst deploy --stage staging`
- [ ] Test OAuth: Login with GitHub
- [ ] Test checkout: Create test repository and purchase
- [ ] Test webhooks: Complete Stripe payment
- [ ] Verify email delivery
- [ ] Deploy to production: `npx sst deploy --stage production`
- [ ] Update GitHub OAuth callback URL to production domain
- [ ] Configure custom domain (optional)

#### Phase 5: CI/CD & Monitoring (Optional)
- [ ] Set up GitHub Actions for auto-deploy on push
- [ ] Configure Sentry or similar for error tracking
- [ ] Set up uptime monitoring (UptimeRobot free tier)

### Commands
```bash
# Development
npx sst dev              # Start local dev with AWS resources

# Deployment
npx sst deploy --stage production

# Secrets management
npx sst secret set JWT_SECRET <value>
npx sst secret set STRIPE_SECRET_KEY <value>

# Database
npx sst shell             # Connect to deployed resources
npm run db:migrate        # Run migrations against prod
```

### Resources
- [SST v3 Documentation](https://sst.dev/docs)
- [Neon PostgreSQL](https://neon.tech/docs)
- [Cloudflare DNS](https://developers.cloudflare.com/dns/)
- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)

---

## Future Idea: RepoPass Platform Fees (Not Implemented)

Today, every seller connects and is billed directly by their own payment provider (Stripe,
Lemon Squeezy, Gumroad, or Paddle) — RepoPass itself doesn't take a cut and has no billing
relationship with sellers. A previous draft of this doc sketched a hybrid platform-fee model
(free under $100 in sales, then 5% or a $15/mo flat fee via Stripe Connect) — **none of that was
built**: there's no `platform_fees`/`fee_transactions` table, no Stripe Connect integration, no
fee-calculation code.

If this is revisited, note that Stripe Connect's per-transaction application fee doesn't
translate directly to Lemon Squeezy/Gumroad/Paddle — each provider would need its own
equivalent (or the fee model would need to be Stripe-only). Treat this as an unstarted idea, not
a plan in progress.

**Priority**: LOW (revisit after validating demand for the current self-serve model)

## Notes

- **Development**: Use Stripe test mode and test cards (4242 4242 4242 4242)
- **Production**:
  - Update OAuth callback URL to production domain
  - Use Stripe live mode keys
  - Update SITE_URL in .env
  - Deploy with SST (see above)

## Troubleshooting

- **GitHub OAuth fails**: Check callback URL matches exactly
- **Can't add collaborators**: Check PAT has `repo` scope and hasn't expired
- **Stripe webhooks not working**: Make sure `stripe listen` is running
- **Email not sending**: Check Resend API key and domain verification

---

## ✅ Recently Completed Features

### Customer Management (January 2026)
- ✅ **Customer List Page** (`/admin/customers`)
  - Filter by repository, status, and search
  - View all purchases with detailed information
  - Quick actions to view details or revoke access
  - Stats dashboard showing total, active, pending, and revoked customers

- ✅ **Customer Detail Page** (`/admin/customers/[id]`)
  - Complete customer information and purchase history
  - Repository access details with GitHub links
  - Stripe payment information (customer ID, payment intent, subscription)
  - Full activity log showing all access events
  - Timestamps for purchase, access grant, and revocation
  - Quick action buttons to revoke access or view on GitHub

### Repository Management (January 2026)
- ✅ **Repository Edit Page** (`/admin/repositories/[id]/edit`)
  - Edit display name, description, and cover image
  - Update pricing (with grandfathering - existing customers keep old price)
  - Toggle active/inactive status
  - View repository statistics (revenue, purchases, active customers)
  - Quick links to product page, GitHub, and customers
  - GitHub owner/repo name locked after creation (cannot be changed)

- ✅ **Pricing History Tracking**
  - Automatic history entry created when repository is added
  - New history entry created whenever price is updated
  - Previous pricing periods automatically closed with `effectiveUntil` date
  - Full audit trail showing who changed pricing and when
  - Displayed on edit page with current price highlighted
  - Supports grandfathering: existing customers maintain their original price

### Technical Improvements
- ✅ Pricing history database integration
- ✅ Admin session tracking for change attribution
- ✅ Automatic effective date management
- ✅ Historical pricing preserved for compliance and analytics

### Polish & UX Improvements (January 2026)
- ✅ **Admin Navigation Component**
  - Unified navigation across all admin pages
  - Dashboard, Customers, and Add Repository links
  - Active page highlighting
  - Consistent logout functionality

- ✅ **PostHog Analytics Integration**
  - Abstraction layer for easy provider swapping
  - Client-side and server-side event tracking
  - Predefined event constants for consistency
  - Optional - can be enabled later with API key

- ✅ **Error Pages**
  - Custom 404 page with helpful navigation
  - Custom 500 error page with retry functionality
  - Consistent branding and design

- ✅ **Dashboard Improvements**
  - Fixed edit links to point to proper edit page
  - Improved navigation flow

### Self-Serve Multi-Tenant Auth & Multi-Provider Payments
- ✅ Any GitHub account can sign in and immediately owns/manages its own repositories and
  customers — there's no separate admin allowlist or `ADMIN_EMAIL` gate on login
  (`ADMIN_EMAIL` is only used as the address for operational failure alerts)
- ✅ Sellers connect Stripe, Lemon Squeezy, Gumroad, or Paddle from `/dashboard/settings`
  (`src/lib/payments/`) instead of being locked to a single global Stripe account
- ✅ Free ($0) repositories with optional email capture (`requireEmailForFree`) via
  `/api/free-access`

### Dependency Upgrade (2026-07-08)
- ✅ Upgraded all dependencies to latest majors (Astro 6→7, Zod 3→4, TypeScript 5→6, and more)
- ✅ Fixed two broken database migrations (`0002_violet_butterfly.sql` enum/default ordering,
  `0003_payment_providers.sql` duplicate schema changes) that made `npm run db:migrate` fail on
  a fresh database
- ✅ Fixed `db:generate`/`db:push` scripts, which referenced a drizzle-kit CLI syntax
  (`generate:pg`/`push:pg`) removed several versions ago

---

**Questions?** Check `/docs/SETUP.md` for detailed instructions or ping Claude!
