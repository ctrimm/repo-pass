# RepoPass

**Monetize your GitHub repositories with automated access management and payments.**

RepoPass is a SaaS platform that enables you to sell access to private GitHub repositories. Set up payment flows via Stripe (one-time or subscription) and automatically grant purchasers access to your repos. No license keys, no DRM, no manual management.

## Features

- 💳 **Stripe Integration** - One-time purchases and subscriptions
- 🔐 **Automated Access** - Automatically adds customers as GitHub collaborators
- 📧 **Email Notifications** - Purchase confirmations, access grants, renewals via Resend
- 👥 **Customer Management** - Full admin panel to view and manage customers
- 📊 **Pricing History** - Track price changes with automatic grandfathering
- 🔄 **Subscription Management** - Auto-revoke access on cancellation
- 📈 **Analytics Ready** - PostHog integration for tracking business metrics
- 🎨 **Beautiful UI** - Modern admin panel and public product pages

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- GitHub account
- Stripe account
- Resend account

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
- GitHub OAuth credentials
- GitHub Personal Access Token
- Stripe API keys
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

1. **Add Repository** - Log in to admin panel and add your private repo
2. **Set Pricing** - Choose one-time ($X) or subscription ($X/month or /year)
3. **Share Link** - Get product page URL to share on your website
4. **Done!** - Purchases are processed automatically

### For Your Customers

1. **Visit Product Page** - Click link to your product
2. **Enter GitHub Username** - Provide their GitHub username
3. **Pay with Stripe** - Secure checkout
4. **Get Access** - Automatically added as collaborator within 5 minutes

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
├── docker-compose.yml   # Local PostgreSQL, Redis, MailDev
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

- **Framework**: Astro 6 (SSR) + React 19
- **Database**: PostgreSQL + Drizzle ORM
- **Cache**: Redis
- **Payments**: Stripe
- **Email**: Resend
- **Analytics**: PostHog
- **Hosting**: AWS (SST) / Vercel / Netlify
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

### Repositories (`/dashboard/repositories`)
- Add new repositories
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

- ✅ GitHub OAuth for admin authentication
- ✅ JWT session management with HTTP-only cookies
- ✅ Webhook signature verification
- ✅ Input validation with Zod schemas
- ✅ SQL injection prevention via ORM
- ✅ PCI compliance via Stripe
- ✅ Secrets in environment variables
- ✅ Read-only GitHub collaborator access

See [docs/SECURITY.md](./docs/SECURITY.md) for details.

## Deployment

RepoPass can be deployed to:
- AWS (via SST - recommended)
- Vercel
- Netlify
- Any Node.js hosting

See [DEPLOYMENT.md](./DEPLOYMENT.md) for platform-specific guides.

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
