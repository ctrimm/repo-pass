# RepoPass - Product Requirements Document

## 1. Executive Summary

**RepoPass** is a SaaS platform that enables creators to monetize access to GitHub and GitLab repositories. Users can set up a simple payment flow via Stripe (one-time or subscription) and automatically grant purchasers access to private repositories. The purchaser provides their username, pays, and receives lifetime (or subscription-based) access to fork/clone the repository.

**MVP Status**: Single-tenant (Cory's instance), with architecture designed to support multi-tenancy in future releases.

**Tech Stack**: NextJS, React, Tailwind CSS, SST, AWS (built on existing astro-react-shad-tailwind-template-repo)

---

## 2. Problem Statement

- Developers/creators want to monetize their code/templates/themes but don't want to manage license keys, DRM, or complicated access systems
- GitHub doesn't have native monetization beyond sponsorships
- Existing solutions are either too heavy (dedicated platforms) or too light (honor system)
- No simple way to connect payment → automated repo access with revocation capabilities

---

## 3. Solution Overview

RepoPass provides a lightweight, automated bridge between Stripe payments and GitHub/GitLab repository access. A creator registers a private repository, sets pricing (one-time or subscription), and RepoPass handles:

1. Payment processing (Stripe)
2. Email confirmation & verification
3. Automatic collaborator invitation via GitHub/GitLab API
4. Access revocation for canceled subscriptions or flagged accounts
5. Lifetime/subscription-based access control

**User Journey**:
- Purchaser visits product page → Enters GitHub username → Pays via Stripe → Receives email confirmation → Username automatically added as collaborator → Access granted

---

## 4. Goals & Success Metrics

**Primary Goals:**
- [ ] Enable frictionless monetization of repositories
- [ ] Reduce manual access management overhead to ~0% for Cory
- [ ] Minimize churn through transparent access management
- [ ] Build foundation for multi-tenant platform (future)

**Success Metrics:**
- Payment completion rate (target: >85%)
- Time from purchase to repo access (<5 minutes)
- Email delivery success rate (>95%)
- Access revocation accuracy (100%)
- Platform uptime (>99.5%)

---

## 5. User Personas & Roles

### Primary User: Repository Owner (Cory, MVP)
- **Goals**: Monetize premium templates, themes, or code without friction
- **Pain Points**: Manual access management, payment processing, access revocation
- **Behaviors**: Technical, wants automation, needs admin controls

### Secondary User: Repository Purchaser
- **Goals**: Get access to premium content quickly
- **Pain Points**: Complex onboarding, unclear access terms, DRM friction
- **Behaviors**: Expects one-click checkout, clear terms, instant access

### Future User: Multi-tenant Creator (Phase 2)
- **Goals**: Host their own monetized repositories on RepoPass platform
- **Pain Points**: Setting up payment infrastructure, compliance, scaling

---

## 6. Feature Requirements

### 6.1 MVP Features

#### Admin Panel (Creator/Owner Only)
- **Repository Management**
  - Add/register private repository (manual input or via GitHub API)
    - Fields: GitHub owner, repo name, description, cover image
    - Option to fetch repo details via GitHub API (starred count, README preview, etc.)
  - Edit repository details and pricing (with grandfathering rules)
  - View list of registered repositories
  - Deactivate/activate repository at any time

- **Pricing Configuration**
  - Set price (USD)
  - Choose billing model: One-time or Subscription
    - For subscriptions: Monthly, Yearly, or Custom cadence options
    - Allow multiple product variants per repo (e.g., "Theme - Basic" vs "Theme - Pro") - **deprioritize for MVP, stub for future**
  - Update pricing with grandfathering logic (existing customers maintain old price)
  - View pricing history

- **Customer Management**
  - List all customers who purchased access
  - View purchase date, amount, subscription status
  - View their GitHub username
  - Manually revoke access (with reason/note)
  - View access logs (when added as collaborator, email sent, etc.)
  - Flag account for suspicious activity

- **Dashboard & Analytics** (MVP - minimal version)
  - Total revenue (lifetime)
  - Active subscribers/customers
  - Churn rate
  - Recent sales
  - Failed payment attempts

#### Public Product Page
- Single page per repository (URL: `/product/{repo-id}` or `/products/{repo-slug}`)
  - Repository name, description, cover image
  - Pricing display (one-time or subscription terms)
  - Brief feature list
  - FAQ or value proposition
  - GitHub repo link/stats (optional: star count, last updated)
  - "Purchase Access" CTA button

#### Checkout Flow
- **Step 1: Username Input**
  - Simple form field: "Enter your GitHub/GitLab username"
  - No verification of ownership (as specified)
  - Submit → Proceed to payment

- **Step 2: Stripe Payment** (Connected Account)
  - Standard Stripe checkout (hosted or embedded)
  - Display: Repo name, price, access type (one-time or subscription)
  - Auto-fill email if available
  - Billing address (Stripe default)
  - Agreement to terms (no account sharing, revocation policy)

- **Step 3: Confirmation**
  - Order confirmation page
  - "Check your email for next steps" message
  - Link to dashboard (future)

#### Email Notifications
- **Purchase Confirmation Email**
  - Order ID, repo name, price, payment method
  - Username submitted
  - Expected timeline for access (within 5 minutes)
  - Link to view access/dashboard
  - Unsubscribe for subscription-only (Stripe-managed)

- **Access Granted Email**
  - Confirmation that username has been added as collaborator
  - Link to repository
  - How to clone/fork
  - Access terms (lifetime, subscription duration, revocation policy)
  - Support email

- **Subscription Renewal Email** (if applicable)
  - Confirmation of renewal
  - Next billing date
  - Option to manage subscription (pause, cancel)

- **Subscription Canceled Email**
  - Confirmation of cancellation
  - Access revocation date
  - Thank you message + reactivation CTA

#### Access Management System
- **Automated Collaborator Invitation**
  - Trigger: Successful Stripe payment
  - Process:
    1. Create GitHub personal access token (PAT) call
    2. Invite username as collaborator to private repo
    3. Log event with timestamp and status
    4. Send "Access Granted" email
  - Error handling: Retry logic, alert Cory on failure
  - Username validation (does GitHub user exist? If not, alert Cory)

- **Access Revocation**
  - Triggered by: Subscription cancellation OR manual flag by Cory
  - Process:
    1. Remove username as collaborator from repo
    2. Log event with reason
    3. Send notification email
    4. Remove from access list
  - Reactivation: For canceled subscriptions, allow re-purchase to regain access

- **Suspicious Activity Detection** (MVP - Manual Only)
  - Cory flags an account (reason: account sharing suspected, etc.)
  - Triggers manual revocation workflow
  - Future: Automated detection (multiple users accessing from same IP, etc.)

#### Dashboard (Owner)
- Overview of sales, active customers, revenue
- Quick links to manage repos, view customers
- Recent activity feed
- Alerts (failed payments, revocation errors, etc.)

---

### 6.2 Out of Scope (MVP) / Future Features

- [ ] Multi-tenant creator platform (Phase 2)
- [ ] GitLab support (stubs only in Phase 1)
- [ ] Multiple product variants per repo
- [ ] Customer portal/self-service dashboard (purchasers can view their licenses)
- [ ] Refund management (built into Stripe, not custom logic)
- [ ] Usage analytics/tracking (code execution tracking)
- [ ] API for programmatic repo management
- [ ] Bulk customer management/import
- [ ] Advanced fraud detection (IP tracking, device fingerprinting)
- [ ] Tiered support/SLAs

---

## 7. User Flows

### 7.1 Repository Owner (Cory) - Setup Flow
```
1. Log into Admin Panel
2. Click "Add Repository"
3. Option A: Manual entry
   - Enter: GitHub owner, repo name, description, cover image, pricing
4. Option B: GitHub API lookup
   - Authenticate with GitHub (OAuth)
   - Select repo from list
   - Auto-populate: description, stats
   - Manually set: pricing, cover image
5. Configure pricing: One-time amount OR subscription (Monthly/Yearly)
6. Review & publish
7. Get shareable product page link
```

### 7.2 Purchaser Flow
```
1. Click link to product page
2. Review repo details & pricing
3. Click "Purchase Access"
4. Enter GitHub username (no verification)
5. Proceed to Stripe checkout
6. Complete payment
7. See confirmation page
8. Receive confirmation email
9. Wait for access (polling or push notification?)
10. Receive "Access Granted" email with repo link
11. Clone/fork repo using GitHub credentials
```

### 7.3 Repository Owner - Access Revocation Flow
```
1. Admin Panel → Customers
2. Find customer in list
3. Click "Revoke Access" OR auto-trigger on subscription cancellation
4. Confirm action
5. System removes collaborator from repo
6. Email notification sent to customer
```

---

## 8. Technical Architecture

### 8.1 Database Schema (MVP - Single Tenant)

```
Table: repositories
- id (UUID, PK)
- owner_id (foreign key to users, always Cory for MVP)
- github_owner (string)
- github_repo_name (string)
- display_name (string)
- description (text)
- cover_image_url (string)
- pricing_type (enum: 'one-time', 'subscription')
- price_cents (integer)
- subscription_cadence (enum: 'monthly', 'yearly', 'custom', nullable if one-time)
- custom_cadence_days (integer, nullable)
- active (boolean, default true)
- created_at (timestamp)
- updated_at (timestamp)

Table: products (Stripe)
- stripe_product_id (string, PK)
- repository_id (FK to repositories)
- price_tier (string, e.g., "standard") - reserved for future multi-variant
- created_at (timestamp)

Table: purchases (Orders)
- id (UUID, PK)
- repository_id (FK)
- stripe_payment_intent_id (string)
- stripe_subscription_id (string, nullable if one-time)
- email (string)
- github_username (string)
- purchase_type (enum: 'one-time', 'subscription')
- amount_cents (integer)
- status (enum: 'completed', 'pending', 'failed', 'canceled')
- access_status (enum: 'pending', 'active', 'revoked')
- revocation_reason (string, nullable)
- created_at (timestamp)
- access_granted_at (timestamp, nullable)
- revoked_at (timestamp, nullable)

Table: access_logs
- id (UUID, PK)
- purchase_id (FK)
- action (enum: 'collaborator_added', 'collaborator_removed', 'email_sent_confirmation', 'email_sent_access_granted')
- status (enum: 'success', 'failed')
- error_message (string, nullable)
- timestamp (timestamp)

Table: users (Stub for multi-tenant)
- id (UUID, PK)
- email (string, unique)
- github_oauth_id (string, nullable)
- stripe_account_id (string, nullable, for future multi-tenant)
- role (enum: 'admin', 'creator', 'none')
- is_admin (boolean, for MVP - always true for Cory)
- created_at (timestamp)
```

### 8.2 Infrastructure

**Hosting**: AWS
- **Web**: NextJS application on SST (Lambda + API Gateway)
- **Database**: RDS PostgreSQL (or DynamoDB if preferred)
- **Caching**: ElastiCache (Redis) for session management, rate limiting
- **File Storage**: S3 for cover images
- **Functions**: Lambda for async workflows (email, revocation, webhook processing)
- **Secrets**: AWS Secrets Manager for GitHub PAT, Stripe keys

**Authentication**:
- Cory: Magic link or OAuth (GitHub)
- Purchasers: Email-based verification (optional, for future customer portal)

**External APIs**:
- GitHub REST API v3 (collaborator management)
- Stripe API (payments, subscriptions, webhooks)
- Email service (SendGrid or AWS SES)

### 8.3 API Endpoints (Backend)

**Admin Routes** (Protected - Cory only)
```
POST /api/admin/repositories
GET /api/admin/repositories
GET /api/admin/repositories/:id
PATCH /api/admin/repositories/:id
DELETE /api/admin/repositories/:id

POST /api/admin/repositories/:id/fetch-github-data
  - Fetches repo details via GitHub API

GET /api/admin/customers
GET /api/admin/customers/:purchaseId
PATCH /api/admin/customers/:purchaseId/revoke
POST /api/admin/customers/:purchaseId/flag

GET /api/admin/dashboard
  - Returns: Total revenue, active customers, recent sales

GET /api/admin/access-logs
  - Filter by repo, customer, action
```

**Public Routes** (Unauthenticated)
```
GET /api/products/:repoId
  - Returns: repo details for product page

POST /api/checkout
  - Input: repoId, githubUsername, email
  - Returns: Stripe session URL

POST /api/webhooks/stripe
  - Webhook handler for payment events
  - Triggers access grant/revocation
```

**Multi-tenant Stubs** (Phase 2)
```
POST /api/creators/repositories
POST /api/creators/dashboard
```

### 8.4 Workflow: Purchase → Access

**Synchronous (Checkout)**
1. User submits username + email on product page
2. Backend validates inputs
3. Creates Stripe session, records purchase as `pending`
4. Redirects to Stripe checkout

**Asynchronous (Post-Payment, via Webhook)**
1. Stripe sends webhook: `payment_intent.succeeded` or `charge.succeeded`
2. Lambda function triggered
3. Update purchase status to `completed`
4. Call GitHub API: Add username as collaborator
5. Log success/failure in `access_logs`
6. Send "Access Granted" email
7. Update `access_status` to `active`

**Error Handling**:
- GitHub API fails: Retry 3x (exponential backoff), alert Cory via dashboard
- Email fails: Log and retry, alert Cory
- Username doesn't exist on GitHub: Send alert email to Cory with purchase details

### 8.5 Subscription Management

**Subscription Events**:
- `customer.subscription.created`: Log event
- `customer.subscription.updated`: Log event, handle price changes
- `customer.subscription.deleted`: Revoke access, send email
- `invoice.payment_failed`: Alert Cory, mark subscription at risk
- `invoice.payment_succeeded`: Log renewal

**Subscription Cancellation**:
1. User cancels subscription in Stripe dashboard
2. Stripe sends webhook
3. Lambda revokes access (remove collaborator)
4. Log revocation reason: "subscription_cancelled"
5. Send email to customer

**Re-purchase Logic**:
- Customer can re-purchase at any time to regain access
- No special pricing for re-purchase in MVP

---

## 9. Admin Panel Features (Detailed)

### 9.1 Settings
- GitHub Personal Access Token management (masked display)
- Stripe credentials (view only, keys managed via Secrets Manager)
- Email service configuration (SendGrid API key)
- Revocation reasons (predefined list: "Account sharing suspected", "Malicious activity", "Refund requested", etc.)

### 9.2 Reports (MVP - Basic)
- Revenue over time (chart)
- Customers by repo
- Subscription churn
- Export customer list (CSV)

---

## 10. Security & Compliance

### 10.1 Data Security
- All API calls over HTTPS
- Database encryption at rest (RDS)
- Secrets stored in AWS Secrets Manager
- GitHub PAT scoped to minimal permissions (read/write collaborators only)

### 10.2 Access Control
- Cory only (single-tenant MVP)
- Magic link authentication or GitHub OAuth
- Session expiration: 30 days
- API rate limiting: 100 req/min per IP

### 10.3 PCI Compliance
- No credit card storage (all handled by Stripe)
- No sensitive data logging
- Stripe checkout uses hosted forms (reduced PCI scope)

### 10.4 Terms & Conditions
- Purchaser agrees: No account sharing, access may be revoked, non-transferable
- Creator responsibility: Moderate access, revoke suspicious accounts
- Data privacy: Email stored for order history, GitHub username stored for access tracking

---

## 11. Monitoring & Alerts

**Critical Alerts** (Cory notified immediately):
- GitHub API errors (retries exhausted)
- Stripe webhook processing failures
- Database errors
- Failed email deliveries

**Dashboard Alerts**:
- Subscription churn spike
- Failed payment attempts
- Revocation actions

---

## 12. Launch & Rollout Plan

### Phase 1: MVP (Single-Tenant)
- [ ] Database schema + migrations
- [ ] Admin panel (repo management, customer management, basic analytics)
- [ ] Public product page + checkout flow
- [ ] GitHub API integration (add/remove collaborator)
- [ ] Stripe integration (one-time + subscriptions)
- [ ] Email system (SendGrid/SES)
- [ ] Access logs & monitoring
- [ ] Manual testing + Stripe test environment
- [ ] Deploy to AWS (dev + prod environments)
- [ ] Set up monitoring/alerting
- **Target**: 2-3 weeks

### Phase 2: Multi-Tenant (Future)
- [ ] Creator onboarding flow
- [ ] Stripe Connect integration
- [ ] Creator dashboard
- [ ] Customer self-service portal
- [ ] Multi-repo product bundles
- [ ] Advanced fraud detection

### Phase 3: GitLab Support (Future)
- [ ] GitLab API integration (parallel to GitHub)
- [ ] Creator can choose: GitHub, GitLab, or both

---

## 13. Success Criteria for MVP Launch

- ✅ One successful purchase (Stripe test mode)
- ✅ GitHub collaborator automatically added
- ✅ Email confirmation sent
- ✅ Access can be revoked and removed
- ✅ Subscription cancellation triggers revocation
- ✅ Admin panel fully functional
- ✅ No manual steps required after payment
- ✅ All error cases logged and alertable

---

## 14. Out-of-Scope Decisions (Rationale)

| Feature | Reason |
|---------|--------|
| GitHub username verification | Adds friction; GitHub API can validate later |
| Multi-variant pricing per repo | Complexity; add after MVP validates market |
| Customer self-service portal | Defer until multi-tenant; email is sufficient MVP |
| Advanced fraud detection | Manual review sufficient for MVP; automate later |
| API for repo management | Manual admin panel is faster MVP; API can follow |
| Bulk import | Not needed for MVP (single creator) |

---

## 15. Questions for Future Refinement

1. Should we implement email verification (clicking link in email) before granting access, or trust the email immediately?
2. Should purchasers get a customer dashboard to view their license status, or just email confirmations?
3. For subscription renewal, should we send reminders before billing date, or Stripe default?
4. Should we track/limit number of accounts that can share a single purchase (device ID tracking)?
5. Should repos have a "waitlist" or "coming soon" status before launch?

---

## Appendix A: Stripe Webhook Events (Exact Implementation)

**One-Time Purchase**:
- `charge.succeeded` → Grant access
- `charge.refunded` → Revoke access (optional MVP, handle manually)

**Subscription**:
- `customer.subscription.created` → Grant access
- `customer.subscription.deleted` → Revoke access
- `invoice.payment_failed` → Log + alert (do not revoke immediately)
- `invoice.payment_succeeded` → Log renewal

---

## Appendix B: GitHub API Reference

**Add Collaborator**:
```
PUT /repos/{owner}/{repo}/collaborators/{username}
{
  "permission": "pull"  // read-only
}
```

**Remove Collaborator**:
```
DELETE /repos/{owner}/{repo}/collaborators/{username}
```

**Authentication**: Personal Access Token with `repo` scope

---

## Appendix C: Email Templates (Outline)

1. **Purchase Confirmation**: Order details, pending access
2. **Access Granted**: Repo link, clone instructions, access terms
3. **Subscription Renewed**: Next billing date, manage subscription
4. **Access Revoked**: Reason (if applicable), reactivation CTA
5. **Failed Payment**: Retry info, update payment method link

---

**Document Version**: 1.0  
**Last Updated**: December 31, 2025  
**Owner**: Cory Trimm  
**Status**: Ready for Engineering Kickoff
