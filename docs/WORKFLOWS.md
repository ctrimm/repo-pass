# RepoPass - Workflow Documentation

## Overview

This document details the end-to-end workflows for RepoPass, including user flows, system processes, and edge case handling.

## User Workflows

### 1. Repository Owner: Setup Flow

**Actor**: Cory (Repository Owner)

**Steps**:

1. **Login**
   - Visit the homepage, click "Start for Free" / "Sign in with GitHub" (`/api/auth/github`)
   - Authorize the OAuth app (any GitHub account works — no invite or approval needed)
   - Redirected to `/dashboard`

2. **Add New Repository**
   - Click "Add Repository" button
   - Choose input method:

   **Option A: Select from your GitHub repos**
   - The form fetches your repos via `/api/auth/github/repositories` and lets you pick one
   - Owner/repo name auto-fill from the selection

   **Option B: Manual Entry**
   - Enter GitHub owner (e.g., "ctrimm")
   - Enter repository name (e.g., "premium-theme")
   - Enter display name and description
   - Cover image is a plain URL field (`coverImageUrl`) — there's no image upload/hosting built
     in, you paste a link to an already-hosted image
   - Set pricing:
     - Type: One-time, Subscription, or Free ($0)
     - Amount in USD (skipped for Free)
     - If subscription: Monthly or Yearly
   - Click "Create Repository"

3. **Review Product Page**
   - System generates slug (e.g., `/products/premium-theme`)
   - Preview product page
   - Copy shareable link

4. **Publish**
   - Toggle "Active" to publish
   - Product page goes live

**System Actions**:
- Creates the `repositories` row and an initial `pricing_history` entry
- Product/price records with the connected payment provider are **not** created yet — that
  happens lazily on the first checkout attempt (see `src/pages/api/checkout.ts`)
- Product page becomes reachable at `/products/:slug`

**Success Criteria**:
- Repository appears in the dashboard
- Product page is accessible (if `active: true`)

---

### 2. Purchaser: Purchase Flow

**Actor**: Customer (Repository Purchaser)

**Steps**:

1. **Discover Product**
   - Click link to product page (e.g., `/products/premium-theme`)
   - View repository details, pricing, features

2. **Initiate Purchase**
   - Click "Purchase Access" button
   - Redirected to checkout page

3. **Enter Information**
   - Enter GitHub username (no verification)
   - Enter email address
   - Review terms and conditions
   - Click "Continue to Payment"

4. **Complete Payment**
   - Redirected to the repository owner's connected provider's checkout (Stripe, Lemon Squeezy,
     Gumroad, or Paddle)
   - Enter payment details
   - Complete purchase
   - (For a Free repository, this step and the payment step are skipped entirely —
     `POST /api/free-access` grants access directly.)

5. **Confirmation**
   - Redirected to confirmation page
   - Message: "Check your email for access instructions"
   - Receive confirmation email

6. **Wait for Access**
   - System processes payment (< 5 minutes)
   - Receive "Access Granted" email
   - Username added as GitHub collaborator

7. **Access Repository**
   - Open GitHub
   - Navigate to repository
   - Clone or fork repository

**System Actions**:
- Creates purchase record (status: pending)
- Creates a checkout session with the owner's connected provider
- Sends confirmation email
- Webhook: processes the payment event
- Adds GitHub collaborator
- Updates purchase status (status: completed, access_status: active)
- Sends "Access Granted" email
- Logs collaborator-add and email-send outcomes in `access_logs`

**Success Criteria**:
- Payment successful
- Email received
- GitHub collaborator added
- Access granted within 5 minutes

**Edge Cases**:
- GitHub username doesn't exist → `access_logs` entry marked `failed`, and the repository owner
  (`ADMIN_EMAIL`) is emailed immediately with the customer's details — no retry (retrying an
  invalid username won't help)
- Payment fails → provider's own checkout UI shows the error; the pending purchase record is
  left as-is
- Collaborator-add fails for another reason (e.g. transient GitHub API error) → retried 3 times
  with exponential backoff (~1s/2s/4s) before giving up and alerting the owner
- Email delivery fails → the error is caught and logged to the console; the purchase/access
  flow still completes (email failure doesn't block access grant), but the email itself isn't
  automatically retried

---

### 3. Repository Owner: Revoke Access Flow

**Actor**: Cory (Repository Owner)

**Steps**:

1. **Navigate to Customers**
   - Dashboard → Customers
   - Search or filter for customer

2. **Review Customer Details**
   - Click customer row
   - View purchase history
   - View access logs
   - Check access status

3. **Revoke Access**
   - Click "Revoke Access" button
   - Enter reason (optional): "Account sharing suspected"
   - Confirm action

4. **Confirmation**
   - Success message displayed
   - Customer status updated to "revoked"

**System Actions**:
- GitHub API: Remove collaborator
- Update purchase record (access_status: revoked)
- Log revocation with reason
- Send revocation email to customer
- Cancel the Stripe subscription, if the purchase has one (`stripe_subscription_id` set) — note
  that this specifically calls the Stripe API (`src/lib/stripe.ts`), so a subscription sold
  through Lemon Squeezy, Gumroad, or Paddle is **not** actually canceled by this step today; only
  GitHub access is revoked and the customer would need to be told to cancel on the provider's side

**Success Criteria**:
- Collaborator removed from GitHub
- Customer receives email
- Admin sees updated status

---

## System Workflows

### 4. Purchase Processing Workflow

**Trigger**: Stripe webhook `checkout.session.completed` (covers both one-time purchases and new
subscriptions). The Lemon Squeezy/Gumroad/Paddle webhooks follow the same general shape with
their own event names — see `docs/API.md`.

**Steps**:

1. **Webhook Received**
   - POST `/api/webhooks/stripe`
   - Validate Stripe signature
   - Parse event data

2. **Identify Purchase**
   - Extract metadata (purchase_id, repository_id)
   - Query database for purchase record
   - Verify purchase exists and status is 'pending'

3. **Validate GitHub Username**
   - Call GitHub API to check the username exists (`checkUserExists` in `src/lib/github.ts`)
   - If the user doesn't exist:
     - `access_logs` entry: `collaborator_added` / `failed`
     - Email `ADMIN_EMAIL` with the customer's details — no retry
     - Purchase is left as-is (not explicitly marked `failed` for this specific case); webhook
       returns `200` so the provider doesn't keep retrying delivery
     - There is no separate "please resend your username" email to the customer

4. **Add Collaborator**
   - Call GitHub API to add the collaborator with `pull` (read-only) permission
   - Wrapped in a local `addCollaboratorWithRetry` helper (duplicated per webhook handler file,
     not centralized in `src/lib/github.ts`): 3 attempts, exponential backoff (~1s, 2s, 4s)

5. **Handle Result**

   **Success**:
   - Update purchase: `access_status = 'active'`, `access_granted_at` set
   - `access_logs` entry: `collaborator_added` / `success`

   **Failure (after 3 retries)**:
   - `access_logs` entry: `collaborator_added` / `failed`
   - Purchase `status` set to `'failed'`
   - Email `ADMIN_EMAIL` asking them to manually add the collaborator

6. **Send Access Granted Email**
   - Template: "Access Granted"
   - Include: Repository link, access terms
   - No automatic retry if this specific email send fails — the failure is caught, logged to
     `access_logs` as `email_sent_access_granted` / `failed`, and does not block the purchase
     from being marked active

7. **Log Email Status**
   - `access_logs` entry: `email_sent_access_granted`, `success` or `failed`

**Error Handling**:
- GitHub API failure adding a collaborator → retried 3x with backoff, then owner is alerted
- GitHub username doesn't exist → owner alerted immediately, no retry
- Email delivery failure → logged, not retried, does not block access being granted
- Database errors are not explicitly caught/rolled back beyond each individual query

**Success Criteria**:
- Purchase status = 'completed'
- Access status = 'active'
- Collaborator added to GitHub
- Email sent successfully

**Metrics**:
- Time from payment to access grant (target: < 5 minutes)
- Success rate (target: > 99%)

---

### 5. Subscription Renewal Workflow

**Trigger**: Stripe webhook `invoice.payment_succeeded` (for renewals)

**Steps**:

1. **Webhook Received**
   - POST `/api/webhooks/stripe`
   - Parse event data
   - Extract subscription_id

2. **Identify Purchase**
   - Query database: `purchases WHERE stripe_subscription_id = ?`
   - Verify purchase exists

3. **Verify Access Status**
   - Check if access_status = 'active'
   - If revoked, skip renewal email

4. **Log Renewal**
   - Create access_log entry (action: 'subscription_renewed', status: 'success')
   - Update purchase: updated_at timestamp

5. **Send Renewal Email**
   - Template: "Subscription Renewed"
   - Include: Next billing date, manage subscription link
   - Retry: 3 attempts if fails

6. **Log Email Status**
   - Create access_log entry (action: 'email_sent_renewal', status: 'success')

**Success Criteria**:
- Renewal logged
- Email sent

---

### 6. Subscription Cancellation Workflow

**Trigger**: Stripe webhook `customer.subscription.deleted`

**Steps**:

1. **Webhook Received**
   - POST `/api/webhooks/stripe`
   - Parse event data
   - Extract subscription_id

2. **Identify Purchase**
   - Query database: `purchases WHERE stripe_subscription_id = ?`
   - Verify purchase exists

3. **Revoke Access**
   - Call GitHub API: `DELETE /repos/{owner}/{repo}/collaborators/{username}`
   - Retry logic: 3 attempts, exponential backoff

4. **Update Database**
   - Update purchase:
     - status = 'canceled'
     - access_status = 'revoked'
     - revocation_reason = 'subscription_canceled'
     - revoked_at = current_timestamp

5. **Log Revocation**
   - Create access_log entry (action: 'collaborator_removed', status: 'success')

6. **Send Cancellation Email**
   - Template: "Subscription Canceled"
   - Include: Access revocation date, reactivation CTA
   - Retry: 3 attempts if fails

7. **Log Email Status**
   - Create access_log entry (action: 'email_sent_revocation', status: 'success')

**Success Criteria**:
- Collaborator removed from GitHub
- Purchase status updated
- Email sent

---

### 7. Failed Payment Workflow

**Trigger**: Stripe webhook `invoice.payment_failed`

**Steps**:

1. **Webhook Received**
   - Parse event data
   - Extract subscription_id, customer_id

2. **Identify Purchase**
   - Query database: `purchases WHERE stripe_subscription_id = ?`

3. **Log Failure**
   - Create access_log entry (action: 'payment_failed', status: 'failed')
   - Include failure reason (e.g., "insufficient_funds")

4. **Alert Admin**
   - Send email to admin
   - Include: Customer email, repository name, failure reason
   - Admin can manually reach out

5. **Send Customer Email** (optional)
   - Template: "Payment Failed"
   - Include: Retry info, update payment method link
   - Retry: 3 attempts if fails

**Note**: Access is NOT revoked immediately. Stripe will retry payment automatically. Admin can manually revoke if payment fails multiple times.

---

### 8. Admin Manual Revocation Workflow

**Trigger**: Admin clicks "Revoke Access" in admin panel

**Steps**:

1. **Owner Action**
   - `POST /api/dashboard/admin/customers/:purchaseId/revoke`
   - Include reason (e.g., "Account sharing suspected")

2. **Validate Request**
   - Verify session (must be logged in)
   - Verify the purchase exists and its repository is owned by the caller (no explicit check
     that `access_status` is currently `'active'` — revoking an already-revoked purchase is a
     harmless no-op)

3. **Revoke GitHub Access**
   - Call GitHub API: `DELETE /repos/{owner}/{repo}/collaborators/{username}`
   - Retry: 3 attempts

4. **Update Database**
   - Update purchase:
     - access_status = 'revoked'
     - revocation_reason = admin_reason
     - revoked_at = current_timestamp
     - revoked_by = admin_user_id

5. **Cancel Stripe Subscription** (if applicable)
   - Call Stripe API: Cancel subscription
   - Prevent future billing

6. **Log Revocation**
   - Create access_log entry (action: 'collaborator_removed', status: 'success')

7. **Send Revocation Email**
   - Template: "Access Revoked"
   - Include: Reason (if appropriate to share)
   - Include: Reactivation instructions (re-purchase)

**Success Criteria**:
- GitHub access revoked
- Subscription canceled
- Customer notified

---

## Edge Case Workflows

### 9. GitHub Username Doesn't Exist

**Scenario**: Customer enters invalid GitHub username

**Steps**:

1. Webhook processing detects username doesn't exist
2. System creates alert for admin
3. Email sent to admin with customer details
4. Purchase marked as 'failed'
5. Email sent to customer: "Invalid GitHub username. Please reply with correct username."
6. Admin manually updates username in database
7. Admin triggers manual access grant

**Future Enhancement**: Validate username at checkout (client-side GitHub API call)

---

### 10. Email Delivery Failure

**Actual behavior**: `sendEmail` calls are wrapped in try/catch; a failure is caught, logged
(usually to `access_logs` as a `failed` status, or just `console.error`), and does **not** block
the surrounding purchase/access-grant flow. There is no automatic retry of a failed email send,
and no SMS channel exists anywhere in this codebase — Resend (email) is the only notification
channel.

**Not implemented**: retrying the email itself, SMS alerting.

---

### 11. GitHub API Rate Limit

**Actual behavior**: none of this is implemented. `src/lib/github.ts` does not inspect rate-limit
response headers, back off, or queue requests. In practice this means a burst of purchases could
hit GitHub's rate limit (5000 req/hour authenticated) and fail outright rather than gracefully
retrying — that failure would surface the same way any other collaborator-add failure does (see
Purchase Processing Workflow above: 3 retries with backoff, then an alert email to the owner).

---

### 12. Duplicate Purchase Attempt

**Actual behavior**: `POST /api/checkout` does **not** check for an existing purchase by this
email/username before creating a new pending purchase and checkout session. A customer can
purchase the same repository more than once; there is no "you already have access" message.

**Not implemented / future enhancement**: checking for an existing active purchase before
checkout, and showing access status on the product page.

---

### 13. Repository Deleted from GitHub

**Not implemented.** There is no scheduled job that checks whether a registered repository still
exists on GitHub, no automatic deactivation, and no GitHub webhook listener for repository
deletion. If an owner deletes the underlying GitHub repo, RepoPass has no way of knowing until a
collaborator-add call starts failing.

---

## Scheduled Workflows

**None exist.** There is no cron/scheduled job anywhere in this codebase (no `node-cron`, no SST
cron construct, no GitHub Actions scheduled workflow) — no daily GitHub-metadata sync and no
periodic revenue report. `github_stars`/`github_last_updated` on a repository are only ever
updated if something explicitly calls `getRepositoryMetadata` (currently nothing in the UI does
this automatically after a repository is created).

---

## Monitoring & Alerts

**Actual behavior**: the only alerting channel is email to `ADMIN_EMAIL`/`AdminEmail`, sent
inline from the webhook handlers for specific failure cases (invalid GitHub username, failed
collaborator add after retries, failed payment webhook). There is no SMS, no digest/summary
email, and no alerting for infrastructure-level issues (database connection failures, webhook
processing failures) beyond whatever surfaces as an unhandled exception in the request logs.

### What Actually Triggers an Owner Email Today

- GitHub username doesn't exist (Stripe/Lemon Squeezy/Gumroad/Paddle checkout webhooks)
- Collaborator-add fails after 3 retries
- `invoice.payment_failed` (Stripe)

### Not Implemented

- Daily/weekly digest emails
- Churn-rate alerting
- Any alert channel other than email

---

**Last Updated**: 2026-07-08
