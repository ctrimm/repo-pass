# RepoPass - Technical Architecture

## Overview

RepoPass is a self-serve SaaS platform that automates GitHub repository access monetization. Any
GitHub account can sign in, register repositories, and manage its own customers — there is no
separate "admin" role or single-tenant gate. This document outlines the actual technology stack
and system design as implemented.

## Technology Stack

### Frontend
- **Framework**: Astro 7 (server/SSR mode) with React 19 integration for interactive islands
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS v4
- **Type Safety**: TypeScript (strict mode)

### Backend
- **Runtime**: Node.js (>=22.12, via `@astrojs/node` adapter in standalone mode)
- **API Framework**: Astro API routes (`src/pages/api/**`)
- **Database**: PostgreSQL (Neon in production per `sst.config.ts`; Docker Compose Postgres for
  local dev)
- **ORM**: Drizzle ORM
- **Rate Limiting**: In-memory, per-process (`src/lib/rate-limit.ts`) — applied only to
  `/api/checkout` and `/api/free-access`. There is no Redis/Upstash in the runtime path, despite
  `redis` still appearing as an unused entry in `package.json`.

### Infrastructure

RepoPass is deployable two ways (see [DEPLOYMENT.md](../DEPLOYMENT.md)):

1. **AWS Lambda via SST v3** — `sst.config.ts` deploys the Astro SSR app behind CloudFront, with
   secrets in AWS Secrets Manager (via `sst.Secret`) and Neon Postgres as the database.
2. **Any Node.js host** — because the adapter is the generic `@astrojs/node` standalone server,
   it also runs as a plain Node process behind any reverse proxy (VPS, Docker, Railway, Fly.io).

### External Services
- **Payments**: Stripe, Lemon Squeezy, Gumroad, or Paddle — each repository owner connects their
  own account from `/dashboard/settings` (`src/lib/payments/`)
- **Version Control**: GitHub REST API (via Octokit) for OAuth login and collaborator management
- **Email**: Resend (transactional emails)
- **Analytics**: PostHog (optional, client- and server-side event tracking)

## System Architecture (SST/AWS deployment)

```
┌──────────────────────────────────────────────┐
│           User (Browser/API Client)          │
└──────────────────┬───────────────────────────┘
                   │
           ┌───────▼────────┐
           │  CloudFront    │  ← CDN in front of the Lambda function
           │     (CDN)      │
           └───────┬────────┘
                   │
    ┌──────────────▼──────────────────┐
    │   AWS Lambda (SST/Astro SSR)    │
    │  Public pages, dashboard, API   │
    │  routes all served by one       │
    │  Astro server entrypoint        │
    └──────────────┬──────────────────┘
                   │
            ┌──────▼───────┐
            │     Neon     │
            │  PostgreSQL  │
            │ (Serverless) │
            └──────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│            External Services (APIs)             │
│  ┌────────┐ ┌────────┐ ┌────────┐  ┌─────────┐ │
│  │ Stripe │ │ GitHub │ │ Resend │  │ PostHog │ │
│  │Lemon Sq│ │  API   │ │ Email  │  │  (opt.) │ │
│  │Gumroad │ │        │ │        │  │         │ │
│  │ Paddle │ │        │ │        │  │         │ │
│  └────────┘ └────────┘ └────────┘  └─────────┘ │
└───────────────────────────────────────────────┘
```

There is no Redis/ElastiCache tier in this architecture — session state is a stateless JWT in an
HTTP-only cookie, and rate limiting is in-memory per Lambda instance (see caveat above).

## Database Architecture

See [DATABASE.md](./DATABASE.md) for the full schema.

### Core Tables
- **users**: every GitHub account that has signed in; owns its own repositories
- **repositories**: registered repositories with pricing and payment-provider configuration
- **products**: Stripe product/price mappings (populated lazily on first checkout)
- **purchases**: order records and access status
- **access_logs**: audit trail for collaborator add/remove and email-send events
- **pricing_history**: price-change audit trail (powers grandfathering)

### Relationships
```
users (1) ──> (N) repositories
repositories (1) ──> (N) products
repositories (1) ──> (N) purchases
repositories (1) ──> (N) pricing_history
purchases (1) ──> (N) access_logs
```

## Architectural Decisions

### Database: PostgreSQL (Neon) vs DynamoDB

**Decision**: Use PostgreSQL via Neon instead of AWS DynamoDB.

**Rationale**:
1. **Relational data model** - the schema has clear relationships (users → repositories →
   purchases → access logs) that map naturally to SQL
2. **Complex queries** - JOINs are used for reporting (e.g., customers list joins purchases +
   repositories)
3. **Type safety** - Drizzle ORM provides TypeScript integration with schema inference
4. **Easier local development** - Docker Postgres locally, matching production
5. **Sufficient free tier** - Neon's free tier covers early-stage usage

**When to reconsider**: at a scale where Neon's cost or connection limits become a problem.

### Rate Limiting

**Decision**: In-memory rate limiting for now; no distributed store.

- Simple in-memory `Map`-based limiter in `src/lib/rate-limit.ts`
- Applied to `/api/checkout` and `/api/free-access` (5 requests/minute per client)
- Returns `429` with `Retry-After`/`X-RateLimit-*` headers

**Trade-offs**:
- **Pros**: no external dependency, zero cost, simple
- **Cons**: per-process only — a multi-instance/multi-Lambda deployment doesn't share limiter
  state across instances
- **If this becomes a problem**: a shared store (Upstash Redis, DynamoDB) would fix it, but
  nothing like that exists in the codebase today

## API Architecture

### Dashboard Routes (Authenticated, owner-scoped)
- `GET/POST /api/dashboard/admin/repositories`
- `GET/PATCH/DELETE /api/dashboard/admin/repositories/:id`
- `GET /api/dashboard/admin/customers`
- `POST /api/dashboard/admin/customers/:purchaseId/revoke`
- `POST /api/dashboard/settings/{github-pat,payment-provider,disconnect-provider,email-preferences}`

### Public Routes
- `GET /products/:slug` (Astro page, not a JSON API)
- `POST /api/checkout`
- `POST /api/free-access`
- `POST /api/webhooks/{stripe,lemon-squeezy,gumroad,paddle}`

See [API.md](./API.md) for full request/response detail.

## Authentication & Authorization

### Login
- **Method**: GitHub OAuth only — there's no magic-link or password login
- **Session**: JWT (HS256) stored in an HTTP-only, `SameSite=Lax` cookie
  (`src/lib/auth.ts`)
- **Expiration**: 30 days, no automatic refresh — the user re-authenticates via GitHub OAuth
  after expiry
- **Tenancy**: every dashboard/API route filters by `ownerId = session.userId`; there's no
  cross-account admin role

### API Security
- Input validation: Zod schemas on every mutating route
- Rate limiting: only on `/api/checkout` and `/api/free-access` (see above) — no general
  API-wide rate limit
- Webhook signature verification: Stripe verifies `Stripe-Signature`; other providers verify per
  their own scheme in their webhook handler

## Data Flow

### Purchase Flow (paid repository)
```
1. User visits product page
   ↓
2. Enters GitHub username + email
   ↓
3. POST /api/checkout creates a pending purchase + a checkout session with the
   owner's configured provider (Stripe/Lemon Squeezy/Gumroad/Paddle)
   ↓
4. Provider processes payment
   ↓
5. Provider webhook received (e.g. checkout.session.completed for Stripe)
   ↓
6. Purchase marked completed; GitHub API adds the collaborator (read-only)
   ↓
7. access_logs entry created; confirmation + access-granted emails sent
   ↓
8. Purchase access_status → active
```

### Free ($0) Repository Flow
```
1. User visits product page for a `pricingType: 'free'` repository
   ↓
2. Enters GitHub username (+ email, if requireEmailForFree)
   ↓
3. POST /api/free-access grants collaborator access directly — no payment step
```

### Subscription Cancellation Flow
```
1. User cancels in their provider's billing portal
   ↓
2. Provider webhook (e.g. customer.subscription.deleted for Stripe)
   ↓
3. GitHub API removes the collaborator
   ↓
4. access_logs entry created (revoked); cancellation email sent
   ↓
5. Purchase access_status → revoked
```

## Error Handling

There is currently **no automatic retry logic** for GitHub API or email failures — a failure is
logged to `access_logs` with `status: 'failed'` and (for high-signal failures like a failed
subscription payment) an email is sent to `ADMIN_EMAIL`. Retrying is a manual/future improvement,
not something implemented today.

## Security

### Data Protection
- **Payment provider credentials & GitHub tokens**: encrypted at the application layer
  (`src/lib/crypto.ts`) before being stored
- **Encryption in transit**: TLS, terminated by whatever's in front of the app (CloudFront/ALB,
  or your own reverse proxy on a Node host)
- **PCI compliance**: handled entirely by the connected payment provider — RepoPass never
  touches card data

### Access Control
- **Login**: GitHub OAuth, open to any GitHub account
- **API endpoints**: session-cookie validation + ownership filtering on every query
- **GitHub access**: requests `repo read:user user:email` OAuth scope; collaborators are added
  with `pull` (read-only) permission

## Monitoring

There is no APM/observability integration configured in this repo today (no CloudWatch/X-Ray/
DataDog setup, no structured logging beyond `console.log`/`console.error`). If you deploy via SST,
you get whatever default Lambda logging AWS provides; add proper monitoring before relying on this
for production incident response.

## Scalability Considerations

### Current
- Any number of tenants (self-serve signup), each scoped to their own data
- No load testing has been done; expect the in-memory rate limiter to behave oddly across
  multiple concurrent Lambda instances (see Rate Limiting above)

### Possible Future Work
- Shared rate-limit store if deployed at multi-instance scale
- Read replicas / caching if dashboard queries become a bottleneck
- Automatic retry with backoff for GitHub/email failures

## Deployment

See [DEPLOYMENT.md](../DEPLOYMENT.md) for deployment procedures. There is no CI/CD auto-deploy
configured — `.github/workflows/ci.yml` runs type-check, tests, lint, and a build on every push/PR
to `main`, but does not deploy anywhere.

---

**Last Updated**: 2026-07-08
