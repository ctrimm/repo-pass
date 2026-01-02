# RepoPass - Technical Architecture

## Overview

RepoPass is a SaaS platform that automates GitHub repository access monetization. This document outlines the technical architecture, technology stack, and system design.

## Technology Stack

### Frontend
- **Framework**: Astro v5+ with React integration
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS v4+
- **Type Safety**: TypeScript (strict mode)
- **State Management**: React Context API / Zustand (TBD)

### Backend
- **Runtime**: Node.js
- **API Framework**: Astro API routes
- **Database**: PostgreSQL (Neon - Serverless)
- **ORM**: Drizzle ORM
- **Caching**: Redis (Upstash - Serverless, optional for MVP)

### Infrastructure (Serverless)
- **Deployment**: SST v3 (Ion)
- **Compute**: AWS Lambda functions
- **Database**: Neon PostgreSQL (serverless, scales to zero)
- **Caching**: Upstash Redis (serverless, optional)
- **CDN**: AWS CloudFront
- **Secrets**: AWS Secrets Manager (via SST)
- **Cost**: $0-5/month for low traffic

### External Services
- **Payments**: Stripe (Checkout, Subscriptions, Webhooks)
- **Version Control**: GitHub API v3
- **Email**: Resend (transactional emails)
- **Analytics**: PostHog (optional)

## System Architecture

```
Ultra-Low-Cost Serverless Stack ($0-5/month)

┌──────────────────────────────────────────────┐
│           User (Browser/API Client)          │
└──────────────────┬───────────────────────────┘
                   │
           ┌───────▼────────┐
           │  CloudFront    │  ← AWS (Free: 1TB/month)
           │     (CDN)      │
           └───────┬────────┘
                   │
    ┌──────────────▼──────────────────┐
    │   AWS Lambda (SST/Astro SSR)    │  ← AWS (Free: 1M requests/mo)
    │  ┌────────┐ ┌────────┐ ┌─────┐ │
    │  │ Public │ │ Admin  │ │ API │ │
    │  │ Pages  │ │ Panel  │ │ Routes│
    │  └────────┘ └────────┘ └─────┘ │
    └──────────────┬──────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌──────────────┐      ┌──────────────┐
│     Neon     │      │   Upstash    │  ← External (Serverless)
│  PostgreSQL  │      │    Redis     │  ← Both: FREE tier
│ (Serverless) │      │  (Optional)  │
└──────────────┘      └──────────────┘
        │
        └─────────────────────────────────────┐
                                              │
┌─────────────────────────────────────────────▼─┐
│            External Services (APIs)           │
│  ┌────────┐  ┌────────┐  ┌────────┐ ┌──────┐│
│  │ Stripe │  │ GitHub │  │ Resend │ │PostHog││
│  │   API  │  │   API  │  │ Email  │ │(opt.)││
│  └────────┘  └────────┘  └────────┘ └──────┘│
└───────────────────────────────────────────────┘

Key Benefits:
✓ Scales to zero when idle (no fixed costs)
✓ No VPC, NAT Gateway, or always-on resources
✓ Total cost: $0-5/month for low traffic
✓ Identical local dev environment (Docker PostgreSQL)
```

## Database Architecture

See [DATABASE.md](./DATABASE.md) for detailed schema documentation.

### Core Tables
- **users**: Admin/creator accounts (single-tenant MVP: Cory only)
- **repositories**: Registered repositories with pricing
- **products**: Stripe product mappings
- **purchases**: Order records and access status
- **access_logs**: Audit trail for all access operations

### Relationships
```
users (1) ──> (N) repositories
repositories (1) ──> (N) products
repositories (1) ──> (N) purchases
purchases (1) ──> (N) access_logs
```

## Architectural Decisions

### Database: PostgreSQL (Neon) vs DynamoDB

**Decision**: Use PostgreSQL via Neon instead of AWS DynamoDB.

**Rationale**:

#### Why PostgreSQL/Neon:
1. **Relational data model** - Our schema has clear relationships (users → repositories → purchases → access logs) that map naturally to SQL
2. **Complex queries** - Need JOINs for reporting (e.g., "show all purchases with repository details and user info")
3. **Type safety** - Drizzle ORM provides excellent TypeScript integration with schema inference
4. **Developer experience** - SQL queries are simpler to write and maintain than DynamoDB single-table design
5. **Sufficient free tier** - Neon's free tier (0.5GB storage, shared compute) handles MVP and early growth
6. **Easier local development** - Can use Docker PostgreSQL locally, identical to production
7. **Proven patterns** - Standard CRUD operations, transactions, and constraints work out-of-the-box

#### DynamoDB Trade-offs (Why We Didn't Choose It):
**Pros**:
- Better AWS integration (no external service)
- Larger free tier (25GB vs 0.5GB)
- No connection pooling issues with Lambda
- Potentially lower cost at scale

**Cons**:
- **Major rewrite required** - Would need to redesign entire schema and rewrite all queries
- **NoSQL constraints** - No JOINs, complex access patterns require denormalization
- **Drizzle ORM incompatible** - Would need to use AWS SDK/DocumentClient directly
- **Development complexity** - Single-table design or GSI management adds cognitive overhead
- **Estimated effort** - 4-7 days of development work to migrate

**When to reconsider**: If we reach >100,000 users and need DynamoDB's scale/performance, or if Neon costs become prohibitive (unlikely until significant revenue).

### Caching: Upstash Redis (Optional)

**Decision**: Use Upstash Redis as optional cache, not required for MVP.

**Rationale**:
- Redis not currently implemented in codebase
- Neon PostgreSQL is fast enough for MVP traffic
- Can add later for session storage, rate limiting, or query caching
- Upstash free tier (10K commands/day) sufficient for future needs

## API Architecture

### Admin Routes (Protected)
- `POST /api/admin/repositories` - Create repository
- `GET /api/admin/repositories` - List repositories
- `PATCH /api/admin/repositories/:id` - Update repository
- `GET /api/admin/customers` - List customers
- `PATCH /api/admin/customers/:id/revoke` - Revoke access
- `GET /api/admin/dashboard` - Dashboard metrics

### Public Routes
- `GET /api/products/:id` - Get product details
- `POST /api/checkout` - Create checkout session
- `POST /api/webhooks/stripe` - Stripe webhook handler

See [API.md](./API.md) for detailed endpoint documentation.

## Authentication & Authorization

### Admin Authentication
- **Method**: GitHub OAuth or Magic Link
- **Session**: JWT stored in HTTP-only cookie
- **Expiration**: 30 days
- **Refresh**: Automatic token refresh

### API Security
- Rate limiting: 100 req/min per IP
- CORS: Configured for production domain
- CSRF: Token validation for mutations
- Input validation: Zod schemas

## Data Flow

### Purchase Flow
```
1. User visits product page
   ↓
2. Enters GitHub username + email
   ↓
3. Redirects to Stripe Checkout
   ↓
4. Stripe processes payment
   ↓
5. Webhook received → Lambda triggered
   ↓
6. Purchase record created (pending)
   ↓
7. GitHub API: Add collaborator
   ↓
8. Access log created
   ↓
9. Email sent (access granted)
   ↓
10. Purchase status → active
```

### Subscription Cancellation Flow
```
1. User cancels in Stripe portal
   ↓
2. Webhook: customer.subscription.deleted
   ↓
3. Lambda triggered
   ↓
4. GitHub API: Remove collaborator
   ↓
5. Access log created (revoked)
   ↓
6. Email sent (cancellation notice)
   ↓
7. Purchase status → revoked
```

## Caching Strategy

### Redis Cache
- **Session data**: 30-day TTL
- **Product listings**: 5-minute TTL
- **Repository metadata**: 1-hour TTL
- **Dashboard metrics**: 5-minute TTL

### CloudFront Cache
- **Static assets**: 1 year
- **Product pages**: 5 minutes
- **API responses**: No cache

## Error Handling

### Retry Logic
- **GitHub API failures**: 3 retries, exponential backoff
- **Email failures**: 3 retries, exponential backoff
- **Webhook processing**: Stripe built-in retries

### Alerting
- **Critical alerts**: Email + SMS to admin
  - Database connection failures
  - GitHub API exhausted retries
  - Webhook processing failures
- **Warning alerts**: Email only
  - High error rates
  - Failed payment attempts
  - Subscription churn spikes

## Security

### Data Protection
- **Encryption at rest**: RDS encryption enabled
- **Encryption in transit**: TLS 1.3
- **Secrets management**: AWS Secrets Manager
- **PCI compliance**: Stripe handles all card data

### Access Control
- **Admin panel**: GitHub OAuth required
- **API endpoints**: JWT validation
- **Database**: Least-privilege IAM roles
- **GitHub PAT**: Scoped to collaborator management only

## Monitoring

### Application Monitoring
- **APM**: AWS X-Ray or DataDog
- **Logging**: CloudWatch Logs
- **Metrics**: CloudWatch Metrics

### Key Metrics
- Request latency (p50, p95, p99)
- Error rates by endpoint
- Database query performance
- Cache hit rates
- Webhook processing time

### Business Metrics
- Conversion rate (visits → purchases)
- Payment success rate
- Time to access grant
- Email delivery rate
- Subscription churn rate

## Scalability Considerations

### Current (MVP)
- Single tenant (Cory only)
- Expected load: < 100 purchases/month
- Single region (us-east-1)

### Future (Multi-tenant)
- Database partitioning by creator
- Multi-region deployment
- Read replicas for analytics
- Horizontal scaling of Lambda functions

## Deployment

See [DEPLOYMENT.md](../DEPLOYMENT.md) for deployment procedures.

### Environments
- **Development**: Local with Docker Compose
- **Staging**: AWS (isolated stack)
- **Production**: AWS (production stack)

### CI/CD Pipeline
1. GitHub Actions workflow triggered
2. Run tests and linting
3. Build application
4. Deploy to staging
5. Run E2E tests
6. Manual approval
7. Deploy to production

## Dependencies

### Core Dependencies
```json
{
  "astro": "^5.16.6",
  "react": "^19.2.3",
  "drizzle-orm": "TBD",
  "stripe": "TBD",
  "@octokit/rest": "TBD",
  "aws-sdk": "TBD"
}
```

### Dev Dependencies
```json
{
  "typescript": "latest",
  "vitest": "latest",
  "playwright": "latest"
}
```

## Performance Targets

- **Page load time**: < 2 seconds (p95)
- **API response time**: < 500ms (p95)
- **Time to access grant**: < 5 minutes (p95)
- **Database query time**: < 100ms (p95)
- **Uptime**: > 99.5%

## Disaster Recovery

- **Database backups**: Daily automated snapshots
- **Retention**: 30 days
- **RTO**: 4 hours
- **RPO**: 1 hour

---

**Last Updated**: January 1, 2026
**Version**: 1.0
