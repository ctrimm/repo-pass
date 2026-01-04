# RepoPass - Database Schema

## Overview

RepoPass uses PostgreSQL as its primary database. This document describes the complete schema, relationships, and migration strategy.

## Database Technology

- **DBMS**: PostgreSQL 15+
- **ORM**: Drizzle ORM (preferred) or Prisma
- **Hosting**: AWS RDS
- **Backup**: Automated daily snapshots (30-day retention)

## Schema Diagram

```
┌─────────────┐
│    users    │
└──────┬──────┘
       │
       │ 1:N
       │
┌──────▼────────────┐
│   repositories    │
└──────┬───────┬────┘
       │       │
   1:N │       │ 1:N
       │       │
┌──────▼───┐ ┌▼──────────┐
│ products │ │ purchases │
└──────────┘ └────┬──────┘
                  │
                  │ 1:N
                  │
            ┌─────▼────────┐
            │ access_logs  │
            └──────────────┘
```

## Tables

### users

Stores admin and creator accounts. MVP: Single user (Cory).

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  github_oauth_id VARCHAR(255) UNIQUE,
  github_username VARCHAR(255),
  github_avatar_url TEXT,
  stripe_account_id VARCHAR(255), -- For future multi-tenant
  role VARCHAR(50) NOT NULL DEFAULT 'admin', -- 'admin', 'creator', 'none'
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_github_oauth_id ON users(github_oauth_id);
```

**Constraints**:
- Email must be valid format
- At least one admin user must exist

### repositories

Registered repositories available for purchase.

```sql
CREATE TABLE repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  github_owner VARCHAR(255) NOT NULL, -- e.g., "ctrimm"
  github_repo_name VARCHAR(255) NOT NULL, -- e.g., "premium-theme"
  slug VARCHAR(255) UNIQUE NOT NULL, -- URL-friendly identifier
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  pricing_type VARCHAR(50) NOT NULL, -- 'one-time', 'subscription'
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  subscription_cadence VARCHAR(50), -- 'monthly', 'yearly', 'custom'
  custom_cadence_days INTEGER, -- For custom subscription periods
  active BOOLEAN NOT NULL DEFAULT true,
  github_stars INTEGER DEFAULT 0,
  github_last_updated TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_github_repo UNIQUE (github_owner, github_repo_name),
  CONSTRAINT valid_pricing_type CHECK (pricing_type IN ('one-time', 'subscription')),
  CONSTRAINT valid_subscription CHECK (
    (pricing_type = 'subscription' AND subscription_cadence IS NOT NULL) OR
    (pricing_type = 'one-time' AND subscription_cadence IS NULL)
  )
);

CREATE INDEX idx_repositories_owner_id ON repositories(owner_id);
CREATE INDEX idx_repositories_slug ON repositories(slug);
CREATE INDEX idx_repositories_active ON repositories(active);
```

**Constraints**:
- `price_cents` must be >= 0
- If `pricing_type` is 'subscription', `subscription_cadence` is required
- `slug` must be unique and URL-safe

### products

Maps repositories to Stripe products.

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  stripe_product_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_price_id VARCHAR(255) UNIQUE NOT NULL,
  price_tier VARCHAR(100) DEFAULT 'standard', -- For future multi-variant
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_repo_tier UNIQUE (repository_id, price_tier)
);

CREATE INDEX idx_products_repository_id ON products(repository_id);
CREATE INDEX idx_products_stripe_product_id ON products(stripe_product_id);
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
  purchase_type VARCHAR(50) NOT NULL, -- 'one-time', 'subscription'
  amount_cents INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'canceled'
  access_status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'revoked'
  revocation_reason TEXT,
  revoked_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  access_granted_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT valid_purchase_type CHECK (purchase_type IN ('one-time', 'subscription')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'completed', 'failed', 'canceled')),
  CONSTRAINT valid_access_status CHECK (access_status IN ('pending', 'active', 'revoked')),
  CONSTRAINT subscription_has_id CHECK (
    (purchase_type = 'subscription' AND stripe_subscription_id IS NOT NULL) OR
    (purchase_type = 'one-time')
  )
);

CREATE INDEX idx_purchases_repository_id ON purchases(repository_id);
CREATE INDEX idx_purchases_email ON purchases(email);
CREATE INDEX idx_purchases_github_username ON purchases(github_username);
CREATE INDEX idx_purchases_stripe_customer_id ON purchases(stripe_customer_id);
CREATE INDEX idx_purchases_stripe_subscription_id ON purchases(stripe_subscription_id);
CREATE INDEX idx_purchases_access_status ON purchases(access_status);
CREATE INDEX idx_purchases_created_at ON purchases(created_at DESC);
```

### access_logs

Audit trail for all access-related operations.

```sql
CREATE TABLE access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL, -- 'collaborator_added', 'collaborator_removed', 'email_sent_confirmation', 'email_sent_access_granted', 'email_sent_revocation'
  status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'retry'
  error_message TEXT,
  metadata JSONB, -- Additional context (GitHub response, email ID, etc.)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT valid_action CHECK (action IN (
    'collaborator_added',
    'collaborator_removed',
    'email_sent_confirmation',
    'email_sent_access_granted',
    'email_sent_revocation',
    'email_sent_renewal',
    'payment_failed'
  )),
  CONSTRAINT valid_log_status CHECK (status IN ('success', 'failed', 'retry'))
);

CREATE INDEX idx_access_logs_purchase_id ON access_logs(purchase_id);
CREATE INDEX idx_access_logs_action ON access_logs(action);
CREATE INDEX idx_access_logs_status ON access_logs(status);
CREATE INDEX idx_access_logs_created_at ON access_logs(created_at DESC);
```

### pricing_history

Track pricing changes for grandfathering logic.

```sql
CREATE TABLE pricing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL,
  pricing_type VARCHAR(50) NOT NULL,
  subscription_cadence VARCHAR(50),
  changed_by UUID REFERENCES users(id),
  effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
  effective_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pricing_history_repository_id ON pricing_history(repository_id);
CREATE INDEX idx_pricing_history_effective_from ON pricing_history(effective_from DESC);
```

## Views

### Active Subscriptions View

```sql
CREATE VIEW active_subscriptions AS
SELECT
  p.id,
  p.email,
  p.github_username,
  r.display_name AS repository_name,
  r.github_owner,
  r.github_repo_name,
  p.amount_cents,
  p.access_granted_at,
  p.created_at
FROM purchases p
JOIN repositories r ON p.repository_id = r.id
WHERE
  p.purchase_type = 'subscription'
  AND p.access_status = 'active'
  AND p.status = 'completed';
```

### Revenue Summary View

```sql
CREATE VIEW revenue_summary AS
SELECT
  r.id AS repository_id,
  r.display_name AS repository_name,
  COUNT(DISTINCT p.id) AS total_purchases,
  COUNT(DISTINCT CASE WHEN p.purchase_type = 'subscription' AND p.access_status = 'active' THEN p.id END) AS active_subscriptions,
  SUM(p.amount_cents) AS total_revenue_cents,
  SUM(CASE WHEN p.created_at >= NOW() - INTERVAL '30 days' THEN p.amount_cents ELSE 0 END) AS revenue_30d_cents,
  MAX(p.created_at) AS last_purchase_at
FROM repositories r
LEFT JOIN purchases p ON r.id = p.repository_id AND p.status = 'completed'
GROUP BY r.id, r.display_name;
```

## Migrations

### Migration Strategy

- **Tool**: Drizzle Kit or Prisma Migrate
- **Versioning**: Sequential numbering (001, 002, etc.)
- **Rollback**: Down migrations for each up migration
- **Testing**: Test migrations on staging before production

### Initial Migration (001_initial_schema.sql)

Create all tables, indexes, and constraints as defined above.

### Example Migration Commands

```bash
# Using Drizzle Kit
npx drizzle-kit generate:pg
npx drizzle-kit push:pg

# Using Prisma
npx prisma migrate dev --name initial_schema
npx prisma migrate deploy
```

## Seeding

### Development Seed Data

```sql
-- Insert admin user (Cory)
INSERT INTO users (email, github_username, role, is_admin)
VALUES ('cory@example.com', 'ctrimm', 'admin', true);

-- Insert test repository
INSERT INTO repositories (
  owner_id,
  github_owner,
  github_repo_name,
  slug,
  display_name,
  description,
  pricing_type,
  price_cents
) VALUES (
  (SELECT id FROM users WHERE email = 'cory@example.com'),
  'ctrimm',
  'premium-astro-theme',
  'premium-astro-theme',
  'Premium Astro Theme',
  'A beautiful, production-ready Astro theme',
  'one-time',
  4900
);
```

## Performance Optimization

### Indexes

All foreign keys have indexes.
Frequently queried columns (email, github_username, created_at) are indexed.

### Query Optimization

- Use prepared statements
- Implement pagination for large result sets
- Use database connection pooling
- Cache frequently accessed data in Redis

## Backup and Recovery

### Automated Backups

- **Frequency**: Daily at 2 AM UTC
- **Retention**: 30 days
- **Location**: AWS RDS automated snapshots

### Point-in-Time Recovery

RDS provides PITR up to the last 5 minutes.

### Manual Backup

```bash
pg_dump -h <rds-endpoint> -U <username> -d repopass > backup.sql
```

---

**Last Updated**: January 1, 2026
**Version**: 1.0
