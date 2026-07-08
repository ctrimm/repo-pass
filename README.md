# RepoPass

**Monetize your GitHub repositories with automated access management and payments.**

RepoPass is a self-serve SaaS platform that enables anyone to sell access to their private GitHub repositories. Sign in with GitHub, set up a payment flow (one-time or subscription), and automatically grant purchasers access to your repos. No license keys, no DRM, no manual management.

Each GitHub account that signs in owns and manages its own repositories, pricing, and customers — there's no separate "admin" role to configure.

## Features

- 🔑 **Sign In With GitHub** - Any GitHub account can log in and start listing repositories; no invite or admin approval needed
- 💳 **Multi-Provider Payments** - Connect Stripe, Lemon Squeezy, Gumroad, or Paddle for one-time purchases and subscriptions
- 🆓 **Free ($0) Repositories** - Offer frictionless, username-only (or username + email) access to public/lead-gen repos
- 🔐 **Automated Access** - Automatically adds customers as read-only GitHub collaborators
- 📧 **Email Notifications** - Purchase confirmations, access grants, renewals via Resend
- 👥 **Customer Management** - Full dashboard to view, filter, and manage customers per repository
- 📊 **Pricing History** - Track price changes with automatic grandfathering
- 🔄 **Subscription Management** - Auto-revoke access on cancellation
- 📈 **Analytics Ready** - PostHog integration for tracking business metrics
- 🎨 **Beautiful UI** - Modern dashboard and public product pages

## Quick Start

### Prerequisites

- Node.js 22.12+
- PostgreSQL 15+
- GitHub account (for OAuth login)
- A payment provider account: Stripe, Lemon Squeezy, Gumroad, or Paddle
- Resend account (for transactional email)

### Installation

1. **Clone and install**:
```bash
git clone https://github.com/ctrimm/repo-pass.git
cd repo-pass
npm install
```

2. **Set up environment**:
```bash
cp .env.example .env
```

Fill in your `.env` with:
- GitHub OAuth credentials (`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`)
- A fallback GitHub Personal Access Token (used only if a signed-in user hasn't stored their own)
- Stripe API keys (used for webhook signature verification; each user can still connect their own Stripe, Lemon Squeezy, Gumroad, or Paddle account from `/dashboard/settings`)
- Resend API key
- PostHog API key (optional)

See [`TODO.md`](./TODO.md) for detailed setup instructions.

3. **Start database**:
```bash
docker-compose up -d
```

4. **Run migrations**:
```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

5. **Start development server**:
```bash
npm run dev
```

Visit `http://localhost:4321`

### Testing Payments

In development, use Stripe test mode:

1. Start Stripe webhook forwarding:
```bash
stripe listen --forward-to localhost:4321/api/webhooks/stripe
```

2. Use test card: `4242 4242 4242 4242`

## How It Works

### For You (Repository Owner)

1. **Sign In** - Log in with GitHub (no invite needed)
2. **Add Repository** - Register your private repo in the dashboard
3. **Set Pricing** - Choose one-time, subscription, or free ($0) access, and pick your payment provider
4. **Share Link** - Get product page URL to share on your website
5. **Done!** - Purchases are processed automatically

### For Your Customers

1. **Visit Product Page** - Click link to your product
2. **Enter GitHub Username** - Provide their GitHub username (and email, if required)
3. **Pay** - Secure checkout via whichever provider the owner connected (Stripe, Lemon Squeezy, Gumroad, or Paddle), or skip payment entirely for free repos
4. **Get Access** - Automatically added as a read-only collaborator within 5 minutes

## Project Structure

```
repo-pass/
├── src/
│   ├── db/              # Database schema and migrations (Drizzle ORM)
│   ├── lib/             # Core services (auth, email, github, stripe, analytics)
│   ├── pages/
│   │   ├── dashboard/   # Dashboard and admin pages
│   │   ├── api/         # API routes (dashboard, public, webhooks)
│   │   └── products/    # Public product pages
│   └── components/      # UI components
├── docs/                # Technical documentation
├── docker-compose.yml   # Local PostgreSQL + MailDev (dev-only dependencies, not the app itself)
└── TODO.md             # Setup checklist
```

## Documentation

- **[TODO.md](./TODO.md)** - Complete setup checklist
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Technical architecture
- **[docs/DATABASE.md](./docs/DATABASE.md)** - Database schema
- **[docs/API.md](./docs/API.md)** - API documentation
- **[docs/SETUP.md](./docs/SETUP.md)** - Detailed setup guide
- **[docs/WORKFLOWS.md](./docs/WORKFLOWS.md)** - User and system workflows
- **[docs/SECURITY.md](./docs/SECURITY.md)** - Security and compliance

## Tech Stack

- **Framework**: Astro 7 (SSR via `@astrojs/node`) + React 19
- **Database**: PostgreSQL + Drizzle ORM
- **Payments**: Stripe, Lemon Squeezy, Gumroad, or Paddle (per-repository-owner choice)
- **Email**: Resend
- **Analytics**: PostHog (optional)
- **Hosting**: AWS Lambda via SST, or any Node.js host (the app runs as a standalone Node server)
- **UI**: Tailwind CSS v4 + shadcn/ui

## Available Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build

# Database
npm run db:generate      # Generate migrations
npm run db:migrate       # Run migrations
npm run db:seed          # Seed database
npm run db:studio        # Open Drizzle Studio
npm run db:reset         # Reset database (dev only)

# Code Quality
npm run type-check       # Check TypeScript types
npm run lint             # Lint code
npm run format           # Format code

# Stripe
npm run stripe:listen    # Forward webhooks to localhost
```

## Admin Panel Features

### Dashboard (`/dashboard`)
- Revenue overview and statistics
- Repository management (add, edit, activate/deactivate)
- Recent customer purchases
- Quick actions and analytics

### Customers (`/dashboard/customers`)
- Filter by repository, status, or search
- View complete purchase history
- Access logs and activity timeline
- Revoke access manually
- Stripe payment details

### Repositories (`/dashboard/repositories/new`, `/dashboard/repositories/:id/edit`)
- Add new repositories (the list itself lives on the main `/dashboard` page — there's no
  separate `/dashboard/repositories` index route)
- Edit details and pricing
- Pricing history with grandfathering
- Repository statistics
- Quick links to GitHub and product pages

### $0 (Free) Repositories
- Offer free access to your private repositories
- **Username-only Access**: For free repositories, you can choose to only require a GitHub username, making it a frictionless experience for your users
- **Lead Generation**: Optionally require an email address to build your mailing list even for free products

## Use Cases

### Personal Premium Themes/Templates
List your premium Astro/React/Tailwind themes on your personal site and link to RepoPass for checkout.

### SaaS Starter Kits
Sell access to your production-ready SaaS boilerplates.

### Educational Code
Monetize course materials, example projects, or learning resources.

### Component Libraries
Sell premium component libraries or design systems.

## Security

- ✅ GitHub OAuth login (each account only sees and manages its own repositories/customers)
- ✅ JWT session management with HTTP-only cookies
- ✅ Payment provider credentials and GitHub tokens encrypted at rest
- ✅ Webhook signature verification
- ✅ Input validation with Zod schemas
- ✅ Rate limiting on checkout and free-access endpoints
- ✅ SQL injection prevention via ORM
- ✅ PCI compliance via your chosen payment provider (card data never touches RepoPass)
- ✅ Read-only GitHub collaborator access

See [docs/SECURITY.md](./docs/SECURITY.md) for details.

## Deployment

RepoPass ships with the `@astrojs/node` adapter in standalone mode, so it runs as a self-contained Node.js server. It can be deployed to:
- **AWS Lambda via SST** (recommended — `sst.config.ts` is already set up for Neon Postgres + Lambda + CloudFront)
- **Any Node.js host** (a VPS, Docker, Railway, Fly.io, Render) by running `npm run build && node dist/server/entry.mjs`
- **Vercel or Netlify**, if you swap in their platform-specific Astro adapter (not configured by default)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for details.

## Pricing Features

- **Grandfathering**: Change prices anytime - existing customers keep their price
- **One-time**: Single payment, lifetime access
- **Subscriptions**: Monthly or yearly billing
- **Auto-revocation**: Access removed when subscription cancels
- **History Tracking**: Full audit trail of all pricing changes

## Support

- **Issues**: [GitHub Issues](https://github.com/ctrimm/repo-pass/issues)
- **Documentation**: [`/docs`](./docs/)
- **Setup Help**: See [`TODO.md`](./TODO.md)

## License

MIT License - See [LICENSE](./LICENSE)

---

**Built with ❤️ by Cory Trimm**
