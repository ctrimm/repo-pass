# RepoPass - Quick Start Guide

This guide will get you up and running with RepoPass locally in **under 10 minutes**.

## Prerequisites

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Docker Desktop** - [Download here](https://www.docker.com/products/docker-desktop/) (for PostgreSQL database)
- **GitHub account** - For OAuth and repository management

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Environment Variables

The `.env` file has already been created with development placeholder values. **You can use these placeholders to get started**, but you'll need real values for full functionality:

```bash
# .env is already configured with development placeholders
# For local development, these work out of the box:
# ✅ Database connection (PostgreSQL via Docker)
# ✅ JWT secrets (development-only values)
# ✅ Basic app configuration

# You'll need to set up real API keys for these features to work:
# ⚠️ GitHub OAuth - Required to log in to admin panel
# ⚠️ Stripe - Required for payments
# ⚠️ Resend - Required for sending emails
```

### Get Real API Keys (Optional for Initial Testing)

<details>
<summary><strong>GitHub OAuth Setup (Required for Login)</strong></summary>

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: RepoPass Dev
   - **Homepage URL**: `http://localhost:4321`
   - **Authorization callback URL**: `http://localhost:4321/api/auth/github/callback`
4. Copy **Client ID** → Update `GITHUB_CLIENT_ID` in `.env`
5. Generate **Client Secret** → Update `GITHUB_CLIENT_SECRET` in `.env`

</details>

<details>
<summary><strong>GitHub Personal Access Token (Required for Adding Collaborators)</strong></summary>

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Name: "RepoPass Dev"
4. Select scope: ✅ `repo` (Full control of private repositories)
5. Copy token → Update `GITHUB_PERSONAL_ACCESS_TOKEN` in `.env`

</details>

<details>
<summary><strong>Stripe Setup (Required for Payments)</strong></summary>

1. Sign up at https://stripe.com
2. Go to https://dashboard.stripe.com/test/apikeys
3. Copy keys:
   - **Publishable key** → Update `STRIPE_PUBLISHABLE_KEY` in `.env`
   - **Secret key** → Update `STRIPE_SECRET_KEY` in `.env`

For webhooks:
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe  # macOS
# OR
scoop install stripe  # Windows

# Login and forward webhooks
stripe login
stripe listen --forward-to localhost:4321/api/webhooks/stripe
# Copy the webhook secret → Update STRIPE_WEBHOOK_SECRET in .env
```

</details>

<details>
<summary><strong>Resend Setup (Required for Emails)</strong></summary>

1. Sign up at https://resend.com
2. Go to API Keys → Create API Key
3. Copy key → Update `RESEND_API_KEY` in `.env`
4. Update `EMAIL_FROM` to a verified domain (or use Resend's test domain)

</details>

## Step 3: Start PostgreSQL Database

```bash
# Start PostgreSQL and MailDev (for local email testing)
docker-compose up -d

# Verify containers are running
docker-compose ps

# You should see:
# ✅ repopass_postgres - PostgreSQL database
# ✅ repopass_maildev - Email testing interface (http://localhost:1080)
```

## Step 4: Run Database Migrations

```bash
# Generate migration files (if not already generated)
npm run db:generate

# Run migrations to create tables
npm run db:migrate

# Seed database with sample data (optional)
npm run db:seed
```

## Step 5: Start Development Server

```bash
npm run dev
```

The app will be available at **http://localhost:4321**

## Step 6: Log In

1. Visit http://localhost:4321
2. Click **"Sign in with GitHub"**
3. Authorize the OAuth app
4. You'll be redirected to the admin dashboard! 🎉

## Testing Payments (Optional)

If you've set up Stripe:

1. In admin panel, click **"Add Repository"**
2. Fill in repository details (e.g., `yourusername/your-repo`)
3. Set a price (e.g., $49 one-time)
4. Visit the product page
5. Use Stripe test card: **4242 4242 4242 4242**
6. Check http://localhost:1080 for the welcome email (MailDev)

## Troubleshooting

### Port 5432 already in use
```bash
# Another PostgreSQL instance is running
# Either stop it, or change the port in docker-compose.yml
sudo lsof -i :5432  # See what's using the port
```

### Can't connect to database
```bash
# Make sure Docker is running
docker-compose ps

# Restart services
docker-compose restart

# Check logs
docker-compose logs postgres
```

### Environment validation errors
```bash
# The .env file requires:
# - JWT_SECRET and SESSION_SECRET must be at least 32 characters
# - EMAIL_FROM must be a valid email address
# - SITE_URL must be a valid URL

# Regenerate secrets:
openssl rand -base64 32  # Copy to JWT_SECRET
openssl rand -base64 32  # Copy to SESSION_SECRET
```

### OAuth callback fails
```bash
# Make sure GitHub OAuth callback URL exactly matches:
# http://localhost:4321/api/auth/github/callback
#
# Check your GitHub OAuth app settings:
# https://github.com/settings/developers
```

## Available Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build

# Database
npm run db:generate      # Generate migrations from schema changes
npm run db:migrate       # Run migrations
npm run db:seed          # Seed with sample data
npm run db:studio        # Open Drizzle Studio (database GUI)
npm run db:reset         # Reset database (⚠️ deletes all data)

# Code Quality
npm run type-check       # Check TypeScript types
npm run lint             # Lint code
npm run format           # Format code with Prettier
npm run test             # Run tests

# Services
docker-compose up -d     # Start PostgreSQL and MailDev
docker-compose down      # Stop all services
docker-compose logs -f   # View logs
```

## What's Next?

- 📖 Read the full documentation in [`docs/`](./docs/)
- 🚀 Check [`TODO.md`](./TODO.md) for deployment instructions
- 🎨 Customize the UI in `src/pages/` and `src/components/`
- 🔧 Modify the database schema in `src/db/schema.ts`

## Minimum Setup for Testing

If you just want to see the app running without full functionality:

1. ✅ **npm install** - Install dependencies
2. ✅ **docker-compose up -d** - Start PostgreSQL
3. ✅ **npm run db:migrate** - Create database tables
4. ✅ **npm run dev** - Start the app

The app will start, but:
- ❌ Login won't work (need GitHub OAuth)
- ❌ Payments won't work (need Stripe)
- ❌ Emails won't send (need Resend)

But you can explore the codebase and UI!

---

**Need help?** Check the [full documentation](./docs/SETUP.md) or [open an issue](https://github.com/ctrimm/repo-pass/issues).
