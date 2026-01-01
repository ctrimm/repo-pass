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

## Notes

- **Development**: Use Stripe test mode and test cards (4242 4242 4242 4242)
- **Production**:
  - Update OAuth callback URL to production domain
  - Use Stripe live mode keys
  - Update SITE_URL in .env
  - Deploy to AWS (we can set this up later with SST)

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
