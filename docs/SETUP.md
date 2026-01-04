# RepoPass - Development Setup Guide

## Prerequisites

- **Node.js**: v18+ (v20 recommended)
- **npm**: v9+
- **PostgreSQL**: v15+ (or use Docker)
- **Redis**: v7+ (or use Docker)
- **Git**: v2.30+
- **Stripe CLI**: For webhook testing
- **GitHub Account**: For OAuth and API testing

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/ctrimm/repo-pass.git
cd repo-pass
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Application
NODE_ENV=development
SITE_URL=http://localhost:4321
PORT=4321

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/repopass_dev

# Redis
REDIS_URL=redis://localhost:6379

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_pat

# Stripe
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Email (Resend)
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=noreply@repopass.com

# Auth
JWT_SECRET=your_random_jwt_secret_min_32_chars
SESSION_SECRET=your_random_session_secret

# Admin
ADMIN_EMAIL=cory@example.com

# Analytics (PostHog) - Optional
POSTHOG_API_KEY=phc_xxxxx
POSTHOG_HOST=https://app.posthog.com
```

### 4. Database Setup (Neon - Serverless PostgreSQL)

For **local development**, you have two options:

**Option A: Use Neon (Recommended - same as production)**
- Sign up at [https://neon.tech](https://neon.tech)
- Create new project (FREE tier is fine)
- Copy connection string
- Add to `.env` as `DATABASE_URL`
- No Docker needed!

**Option B: Use Docker (Traditional)**
```bash
docker-compose up -d  # Starts PostgreSQL on port 5432
```

### 5. Redis Setup (Upstash - Optional)

Redis is **optional** for MVP. If you want caching:

**Option A: Use Upstash (Recommended - same as production)**
- Sign up at [https://upstash.com](https://upstash.com)
- Create Redis database (FREE tier)
- Copy connection string
- Add to `.env` as `REDIS_URL`

**Option B: Use Docker (Traditional)**
```bash
docker-compose up -d  # Includes Redis on port 6379
```

**Option C: Skip Redis (For MVP)**
- Leave `REDIS_URL` empty for now
- Add it later when you need caching

### 6. Run Database Migrations

```bash
npm run db:migrate
```

Seed initial data (optional):

```bash
npm run db:seed
```

### 6. Start Development Server

```bash
npm run dev
```

Visit: `http://localhost:4321`

## GitHub OAuth Setup

### 1. Create OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in details:
   - **Application name**: RepoPass (Development)
   - **Homepage URL**: `http://localhost:4321`
   - **Authorization callback URL**: `http://localhost:4321/api/auth/github/callback`
4. Click "Register application"
5. Copy Client ID and Client Secret to `.env`

### 2. Create Personal Access Token (PAT)

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (Full control of private repositories)
   - `read:user` (Read user profile data)
4. Click "Generate token"
5. Copy token to `.env` as `GITHUB_PERSONAL_ACCESS_TOKEN`

**Important**: Store this token securely. It grants access to your repositories.

## Stripe Setup

### 1. Create Stripe Account

Sign up at [https://stripe.com](https://stripe.com)

### 2. Get API Keys

1. Go to Developers → API keys
2. Copy "Publishable key" and "Secret key" (test mode)
3. Add to `.env`

### 3. Install Stripe CLI

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Other platforms
# See: https://stripe.com/docs/stripe-cli
```

### 4. Login to Stripe CLI

```bash
stripe login
```

### 5. Forward Webhooks to Local Server

```bash
stripe listen --forward-to localhost:4321/api/webhooks/stripe
```

Copy the webhook signing secret to `.env` as `STRIPE_WEBHOOK_SECRET`.

Keep this terminal running while developing.

## Email Setup (Resend)

### 1. Create Resend Account

Sign up at [https://resend.com](https://resend.com)

### 2. Get API Key

1. Go to API Keys: https://resend.com/api-keys
2. Click "Create API Key"
3. Copy key and add to `.env` as `RESEND_API_KEY`

### 3. Verify Domain (Optional for production)

1. Go to Domains in Resend dashboard
2. Add your domain
3. Add DNS records as instructed
4. Verify domain
5. Update `EMAIL_FROM` in `.env` to use your domain

**For Development**: You can use Resend's test domain without verification.

## Analytics Setup (PostHog) - Optional

### 1. Create PostHog Account

Sign up at [https://posthog.com](https://posthog.com)

### 2. Get API Key

1. Go to Project Settings
2. Copy "Project API Key"
3. Add to `.env` as `POSTHOG_API_KEY`
4. Copy "Host" (usually `https://app.posthog.com`)
5. Add to `.env` as `POSTHOG_HOST`

**Note**: Analytics are completely optional. The app works without PostHog configured.

## Database Management

### Migrations

Create a new migration:

```bash
npm run db:migration:create -- add_new_field
```

Run pending migrations:

```bash
npm run db:migrate
```

Rollback last migration:

```bash
npm run db:rollback
```

### Database Schema Visualization

```bash
npm run db:studio
```

Opens Drizzle Studio at `http://localhost:4983`

### Reset Database (Development only)

```bash
npm run db:reset
```

**Warning**: This drops all tables and recreates them.

## Testing

### Run All Tests

```bash
npm test
```

### Run Unit Tests

```bash
npm run test:unit
```

### Run Integration Tests

```bash
npm run test:integration
```

### Run E2E Tests

```bash
npm run test:e2e
```

### Test Coverage

```bash
npm run test:coverage
```

## Code Quality

### Linting

```bash
npm run lint
```

Fix linting issues:

```bash
npm run lint:fix
```

### Type Checking

```bash
npm run type-check
```

### Formatting

```bash
npm run format
```

Check formatting:

```bash
npm run format:check
```

## Docker Development

### Full Stack with Docker Compose

```bash
docker-compose up
```

This starts:
- Application (port 4321)
- PostgreSQL (port 5432)
- Redis (port 6379)

### Build Production Docker Image

```bash
docker build -t repopass:latest .
```

### Run Production Container

```bash
docker run -p 4321:4321 --env-file .env repopass:latest
```

## Troubleshooting

### Port Already in Use

If port 4321 is occupied:

```bash
# Change PORT in .env
PORT=3000
```

### Database Connection Issues

Check if PostgreSQL is running:

```bash
docker ps # if using Docker
# or
pg_isready -h localhost -p 5432
```

Verify `DATABASE_URL` in `.env`

### Redis Connection Issues

Check if Redis is running:

```bash
docker ps # if using Docker
# or
redis-cli ping # should return PONG
```

### GitHub API Rate Limiting

GitHub has rate limits:
- **Unauthenticated**: 60 requests/hour
- **Authenticated** (with PAT): 5000 requests/hour

Use PAT for development.

### Stripe Webhook Not Receiving Events

Ensure Stripe CLI is running:

```bash
stripe listen --forward-to localhost:4321/api/webhooks/stripe
```

Check webhook signing secret in `.env` matches CLI output.

## Development Workflow

### 1. Create Feature Branch

```bash
git checkout -b feature/add-new-feature
```

### 2. Make Changes

Edit code, write tests, commit changes.

### 3. Run Tests

```bash
npm test
npm run lint
npm run type-check
```

### 4. Commit Changes

```bash
git add .
git commit -m "feat: add new feature"
```

We follow [Conventional Commits](https://www.conventionalcommits.org/).

### 5. Push and Create PR

```bash
git push origin feature/add-new-feature
```

Create Pull Request on GitHub.

## IDE Setup

### VS Code Extensions (Recommended)

- ESLint
- Prettier
- Astro
- Tailwind CSS IntelliSense
- TypeScript Vue Plugin (Volar)
- GitLens

### VS Code Settings

Add to `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

## Useful Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build

# Database
npm run db:migrate       # Run migrations
npm run db:studio        # Open database GUI
npm run db:seed          # Seed database

# Testing
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode

# Code Quality
npm run lint             # Lint code
npm run format           # Format code
npm run type-check       # Check types

# Stripe
npm run stripe:listen    # Forward webhooks to local server
```

## Additional Resources

- [Astro Documentation](https://docs.astro.build)
- [Stripe API Reference](https://stripe.com/docs/api)
- [GitHub API Reference](https://docs.github.com/en/rest)
- [Drizzle ORM Documentation](https://orm.drizzle.team)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

**Last Updated**: January 1, 2026
**Version**: 1.0
