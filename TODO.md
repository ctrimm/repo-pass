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

### 2. GitHub Personal Access Token (PAT)
**Why?** The OAuth token is for your login. The PAT is for the service to add collaborators to your repos.

- [ ] Go to https://github.com/settings/tokens
- [ ] Click "Generate new token" → "Generate new token (classic)"
- [ ] Name: "RepoPass Service Token"
- [ ] Select scopes:
  - ✅ `repo` (Full control of private repositories)
- [ ] Click "Generate token"
- [ ] Copy token → Add to `.env` as `GITHUB_PERSONAL_ACCESS_TOKEN`

**⚠️ Important**: Save this token securely! You can't see it again.

### 3. Stripe Setup
- [ ] Sign up at https://stripe.com (if you haven't)
- [ ] Go to https://dashboard.stripe.com/test/apikeys
- [ ] Copy "Publishable key" → Add to `.env` as `STRIPE_PUBLISHABLE_KEY`
- [ ] Copy "Secret key" → Add to `.env` as `STRIPE_SECRET_KEY`
- [ ] Install Stripe CLI: `brew install stripe/stripe-cli/stripe` (macOS)
- [ ] Login: `stripe login`
- [ ] Forward webhooks: `stripe listen --forward-to localhost:4321/api/webhooks/stripe`
- [ ] Copy webhook secret → Add to `.env` as `STRIPE_WEBHOOK_SECRET`

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
- [x] Remove unused Redis code (not needed for MVP)
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

## Revenue Model Implementation (Option C - Hybrid)

### Overview
Implement a hybrid revenue model for RepoPass platform fees:
- **FREE**: First $100 in sales
- **5% Platform Fee**: After $100, take 5% of each sale
- **OR $15/mo Flat Fee**: Unlimited sales (sellers can opt-in)

### Cost Structure
**Your Infrastructure Costs:**
- Neon PostgreSQL: $0/mo (FREE tier)
- AWS Lambda + CloudFront: $0-5/mo (within free tier for low traffic)
- Domain: ~$12/yr (~$1/mo)
- **Total**: ~$1-6/mo to run RepoPass

**Breakeven Analysis:**
- At 5% fee: Need $120 in gross sales/month = 2-3 sales at $49/each
- At $15/mo subscription: Need 1 paying seller
- **Goal**: Profitable after 3 total sales OR 1 subscriber

### Implementation Plan

#### Phase 1: Database Schema (Platform Fees)
- [ ] Create `platform_fees` table:
  ```sql
  - seller_id (references users)
  - stripe_account_id (Stripe Connect)
  - plan_type (enum: 'free', 'percentage', 'flat')
  - lifetime_revenue_cents (tracking for $100 threshold)
  - current_period_start
  - current_period_end
  - status (active, canceled, etc.)
  ```
- [ ] Create `fee_transactions` table:
  ```sql
  - transaction_id
  - seller_id
  - purchase_id
  - sale_amount_cents
  - platform_fee_cents
  - stripe_fee_cents
  - seller_net_cents
  - created_at
  ```

#### Phase 2: Stripe Connect Integration
- [ ] Set up Stripe Connect for multi-seller payments
- [ ] Implement "Connect with Stripe" flow for sellers
- [ ] Store Stripe Connect account IDs
- [ ] Configure application fee collection (5% or $0 based on plan)

#### Phase 3: Fee Calculation Logic
- [ ] Create `src/lib/platform-fees.ts`:
  - [ ] Function to calculate platform fee based on seller's plan
  - [ ] Function to check if seller exceeds $100 free tier
  - [ ] Function to determine if seller should upgrade to paid plan
- [ ] Update checkout flow to apply platform fees via Stripe Connect

#### Phase 4: Seller Dashboard
- [ ] Add "Revenue" tab to seller dashboard:
  - [ ] Show lifetime revenue
  - [ ] Show current plan (Free, 5% fee, or $15/mo)
  - [ ] Show fee breakdown per transaction
  - [ ] Button to upgrade to $15/mo flat plan
- [ ] Add notification when approaching $100 free tier limit

#### Phase 5: Subscription Billing
- [ ] Create subscription product for $15/mo flat fee plan
- [ ] Implement "Upgrade to Pro" checkout flow
- [ ] Handle subscription renewal/cancellation
- [ ] Automatically switch between percentage and flat fee based on subscription status

#### Phase 6: Admin Analytics
- [ ] Platform revenue dashboard for Cory:
  - [ ] Total platform fees collected
  - [ ] Breakdown by fee type (5% vs $15/mo)
  - [ ] Number of active sellers by plan type
  - [ ] MRR (Monthly Recurring Revenue) tracking

### Pricing Strategy
**For sellers using RepoPass:**
| Seller's Sale Price | Stripe Fee (2.9% + $0.30) | Platform Fee (5%) | Seller Keeps |
|---------------------|---------------------------|-------------------|--------------|
| $49 | $1.72 | $2.45 | $44.83 (91.5%) |
| $79 | $2.59 | $3.95 | $72.46 (91.7%) |
| $99 | $3.17 | $4.95 | $90.88 (91.8%) |

**Flat fee alternative:**
- Seller pays $15/mo → Keeps 97% of sales (only Stripe fees)
- Makes sense for sellers with >$300/mo in sales

### Launch Checklist
- [ ] Implement basic platform fee tracking (read-only)
- [ ] Launch with FREE tier only (no fees initially)
- [ ] Gather feedback from early adopters
- [ ] Enable 5% fee after 10+ active sellers
- [ ] Introduce $15/mo plan when sellers request it

**Priority**: LOW (implement after initial launch and validation)

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

---

**Questions?** Check `/docs/SETUP.md` for detailed instructions or ping Claude!
