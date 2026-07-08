# RepoPass - Database Schema

## Overview

RepoPass uses PostgreSQL. This document describes the actual current schema, taken from
`src/db/schema.ts` and the applied migrations in `src/db/migrations/`.

## Database Technology

- **DBMS**: PostgreSQL 15+
- **ORM**: Drizzle ORM (`drizzle-orm` + `drizzle-kit`) — the only ORM used, there is no Prisma
- **Hosting**: Neon (serverless Postgres) in the SST/AWS deployment path; a local Docker Postgres
  container for development. Nothing in this repo assumes AWS RDS specifically.
- **Backups**: whatever your Postgres host provides (e.g. Neon's backup/PITR features on paid
  tiers) — RepoPass does not implement its own backup process

## Schema Diagram

```
┌─────────────┐
│    users    │
└──────┬──────┘
       │ 1:N
┌──────▼────────────┐
│   repositories    │
└──────┬───────┬────┘
   1:N │       │ 1:N
┌──────▼───┐ ┌▼──────────┐       ┌──────────────────┐
│ products │ │ purchases │──1:N─▶│   access_logs     │
└──────────┘ └───────────┘       └──────────────────┘
       ▲
       │ 1:N
┌──────┴────────────┐
│  pricing_history   │ (also belongs to repositories, 1:N)
└────────────────────┘
```

## Tables

### users

Every GitHub account that has signed in. Each user owns their own repositories — there is no
separate admin/creator distinction anymore (the `role` enum only has one value, `user`, kept for
schema-evolution headroom rather than active use).

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  github_oauth_id VARCHAR(255) UNIQUE,
  github_username VARCHAR(255),
  github_avatar_url TEXT,
  github_personal_access_token TEXT,       -- encrypted; the OAuth token, or a manual override
  role role NOT NULL DEFAULT 'user',        -- enum currently has only 'user'

  -- Payment provider settings (values encrypted at the application layer, see src/lib/crypto.ts)
  payment_provider payment_provider,        -- 'stripe' | 'lemon_squeezy' | 'gumroad' | 'paddle'
  stripe_secret_key TEXT,
  stripe_publishable_key TEXT,
  lemon_squeezy_api_key TEXT,
  lemon_squeezy_store_id VARCHAR(255),
  gumroad_access_token TEXT,
  paddle_vendor_id VARCHAR(255),
  paddle_api_key TEXT,

  email_notifications BOOLEAN NOT NULL DEFAULT true,  -- opt-out for non-critical emails

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

There is **no `is_admin` or `stripe_account_id` column** — those existed in the original
single-tenant design and were dropped in migration `0002_violet_butterfly.sql` when the app
moved to self-serve, per-user payment provider credentials.

### repositories

Registered repositories available for purchase, owned by a user.

```sql
CREATE TABLE repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_owner VARCHAR(255) NOT NULL,
  github_repo_name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  pricing_type pricing_type NOT NULL,        -- 'one-time' | 'subscription' | 'free'
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  subscription_cadence subscription_cadence, -- 'monthly' | 'yearly' | 'custom'
  custom_cadence_days INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  require_email_for_free BOOLEAN NOT NULL DEFAULT false, -- for free repos: also collect email?

  payment_provider payment_provider,          -- null for free repos
  external_product_id VARCHAR(255),           -- product ID in the connected provider
  external_price_id VARCHAR(255),             -- price ID in the connected provider

  github_stars INTEGER DEFAULT 0,
  github_last_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_github_repo UNIQUE (github_owner, github_repo_name)
);
```

`pricing_type = 'free'` is a real, shipped option — not just one-time/subscription.

### products

Maps a repository to its product/price IDs with whichever provider is connected. Despite the
column names (`stripe_product_id`/`stripe_price_id`, left over from the Stripe-only original
design), these are populated with the connected provider's IDs regardless of which provider it
is — column names were not renamed when multi-provider support was added.

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  stripe_product_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_price_id VARCHAR(255) UNIQUE NOT NULL,
  price_tier VARCHAR(100) DEFAULT 'standard',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_repo_tier UNIQUE (repository_id, price_tier)
);
```

### purchases

Order records and access status tracking.

```sql
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
  product_id UUID REFERENCES products(id),
  stripe_payment_intent_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  email VARCHAR(255) NOT NULL,
  github_username VARCHAR(255) NOT NULL,
  purchase_type purchase_type NOT NULL,      -- 'one-time' | 'subscription'
  amount_cents INTEGER NOT NULL,
  status purchase_status NOT NULL DEFAULT 'pending',       -- 'pending'|'completed'|'failed'|'canceled'
  access_status access_status NOT NULL DEFAULT 'pending',  -- 'pending'|'active'|'revoked'
  revocation_reason TEXT,
  revoked_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  access_granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
```

### access_logs

Audit trail for collaborator add/remove and email-send events.

```sql
CREATE TABLE access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  action access_log_action NOT NULL,   -- 'collaborator_added' | 'collaborator_removed' |
                                        -- 'email_sent_confirmation' | 'email_sent_access_granted' |
                                        -- 'email_sent_revocation' | 'email_sent_renewal' | 'payment_failed'
  status access_log_status NOT NULL,   -- 'success' | 'failed' | 'retry'
  error_message TEXT,
  metadata TEXT,                       -- JSON string, not a native jsonb column
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### pricing_history

Tracks pricing changes for grandfathering. A new row is inserted whenever a repository is
created or its price changes; the prior row's `effective_until` is set at that point.

```sql
CREATE TABLE pricing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL,
  pricing_type pricing_type NOT NULL,
  subscription_cadence subscription_cadence,
  changed_by UUID REFERENCES users(id),
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Indexes and Views

**None of the migrations create any secondary indexes or database views.** Every table only has
the indexes Postgres creates automatically for its primary key and `UNIQUE`/foreign-key
constraints. There is no `revenue_summary` or `active_subscriptions` view, and no `idx_*` indexes
on `purchases.email`, `purchases.github_username`, `access_logs.purchase_id`, etc.

This is fine at current scale (queries go through Drizzle with indexed foreign keys/uniques for
the lookups that matter most), but if `purchases`/`access_logs` grow large, adding indexes on the
frequently-filtered columns (`purchases.access_status`, `purchases.created_at`,
`access_logs.purchase_id`) would be a reasonable follow-up — via a new Drizzle migration, not by
hand-editing existing migration files.

## Migrations

**Tool**: Drizzle Kit. Generate a migration after changing `src/db/schema.ts`:

```bash
npm run db:generate   # drizzle-kit generate — diffs schema.ts against existing migrations
npm run db:migrate    # tsx src/db/migrate.ts — applies pending migrations
npm run db:push       # drizzle-kit push — push schema directly without a migration file (dev only)
```

(Older versions of this doc referenced `drizzle-kit generate:pg`/`push:pg` — those subcommands
were removed from drizzle-kit several versions ago; the scripts above are current.)

Applied migrations, in order:
1. `0000_skinny_miss_america` — initial schema
2. `0001_massive_spacker_dave`
3. `0002_violet_butterfly` — multi-tenant pivot: drops `is_admin`/`stripe_account_id`, collapses
   `role` to just `'user'`, renames `github_access_token` → `github_personal_access_token`, adds
   the payment-provider columns and the `free` pricing type
4. `0003_payment_providers` — a no-op today (see the file's comment); it originally duplicated
   0002's changes and would fail on a clean database, so it was neutralized rather than deleted
   to keep the migration sequence intact
5. `0004_free_repo_email_requirement` — adds `require_email_for_free`

## Seeding

`npm run db:seed` (`src/db/seed.ts`) creates one user (email from `ADMIN_EMAIL`/`AdminEmail`
secret, falling back to `cory@example.com`) and one sample repository (`premium-astro-theme`,
$49 one-time). It's meant for local development, not a description of required production data —
in production, real users create their own accounts via GitHub OAuth.

## Performance

- Use pagination for large result sets (the customers/repositories list queries don't currently
  paginate — they return every row for the current user)
- Connection pooling is handled by the `postgres` npm package's built-in pool

---

**Last Updated**: 2026-07-08
