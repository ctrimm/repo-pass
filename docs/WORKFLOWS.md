# RepoPass - Workflow Documentation

## Overview

This document details the end-to-end workflows for RepoPass, including user flows, system processes, and edge case handling.

## User Workflows

### 1. Repository Owner: Setup Flow

**Actor**: Cory (Repository Owner)

**Steps**:

1. **Login to Admin Panel**
   - Navigate to `/admin`
   - Click "Login with GitHub"
   - Authorize OAuth app
   - Redirected to admin dashboard

2. **Add New Repository**
   - Click "Add Repository" button
   - Choose input method:

   **Option A: Manual Entry**
   - Enter GitHub owner (e.g., "ctrimm")
   - Enter repository name (e.g., "premium-theme")
   - Enter display name
   - Add description
   - Upload cover image (S3)
   - Set pricing:
     - Type: One-time or Subscription
     - Amount in USD
     - If subscription: Monthly/Yearly/Custom
   - Click "Create Repository"

   **Option B: GitHub API Fetch**
   - Authenticate with GitHub
   - Select repository from list
   - Auto-populate: description, stars, last updated
   - Manually set: pricing, cover image
   - Click "Create Repository"

3. **Review Product Page**
   - System generates slug (e.g., `/products/premium-theme`)
   - Preview product page
   - Copy shareable link

4. **Publish**
   - Toggle "Active" to publish
   - Product page goes live

**System Actions**:
- Creates repository record in database
- Creates Stripe product and price
- Generates product page
- Logs action in access_logs

**Success Criteria**:
- Repository appears in admin panel
- Product page is accessible
- Stripe product is created

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
   - Redirected to Stripe Checkout
   - Enter payment details
   - Complete purchase

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
- Creates Stripe Checkout Session
- Sends confirmation email
- Webhook: Processes payment
- Adds GitHub collaborator
- Updates purchase status (status: completed, access_status: active)
- Sends "Access Granted" email
- Logs all actions

**Success Criteria**:
- Payment successful
- Email received
- GitHub collaborator added
- Access granted within 5 minutes

**Edge Cases**:
- GitHub username doesn't exist → Alert admin
- Payment fails → Show error, retry
- Email delivery fails → Retry 3x, alert admin

---

### 3. Repository Owner: Revoke Access Flow

**Actor**: Cory (Repository Owner)

**Steps**:

1. **Navigate to Customers**
   - Admin Panel → Customers
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
- Cancel Stripe subscription (if applicable)

**Success Criteria**:
- Collaborator removed from GitHub
- Customer receives email
- Admin sees updated status

---

## System Workflows

### 4. Purchase Processing Workflow

**Trigger**: Stripe webhook `charge.succeeded` or `customer.subscription.created`

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
   - Call GitHub API: `/users/{username}`
   - If user doesn't exist:
     - Create alert for admin
     - Send email to admin with details
     - Update purchase status to 'failed'
     - Send email to customer requesting valid username
     - Exit workflow

4. **Add Collaborator**
   - Call GitHub API: `PUT /repos/{owner}/{repo}/collaborators/{username}`
   - Permission: "pull" (read-only)
   - Retry logic: 3 attempts, exponential backoff (2s, 4s, 8s)

5. **Handle API Response**

   **Success**:
   - Update purchase: status = 'completed', access_status = 'active'
   - Record access_granted_at timestamp
   - Create access_log entry (action: 'collaborator_added', status: 'success')

   **Failure**:
   - Create access_log entry (action: 'collaborator_added', status: 'failed')
   - Alert admin via email
   - Update purchase: status = 'failed'
   - Exit workflow

6. **Send Access Granted Email**
   - Template: "Access Granted"
   - Include: Repository link, clone instructions, access terms
   - Retry: 3 attempts if email fails

7. **Log Email Status**
   - Create access_log entry (action: 'email_sent_access_granted', status: 'success' or 'failed')

**Error Handling**:
- GitHub API rate limit → Wait and retry
- GitHub API 404 → Username doesn't exist, alert admin
- Email delivery failure → Retry, alert admin
- Database error → Rollback transaction, alert admin

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

1. **Admin Action**
   - POST `/api/admin/customers/:purchaseId/revoke`
   - Include reason (e.g., "Account sharing suspected")

2. **Validate Request**
   - Verify admin authentication
   - Verify purchase exists
   - Verify access_status = 'active'

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

**Scenario**: Email service is down or email bounces

**Steps**:

1. Email send fails
2. Retry 3 times with exponential backoff
3. If all retries fail:
   - Log failure in access_logs
   - Alert admin via SMS (critical emails only)
   - Admin manually sends email or contacts customer

**Mitigation**: Use reliable email service (AWS SES or SendGrid)

---

### 11. GitHub API Rate Limit

**Scenario**: Too many API calls, rate limit exceeded

**Steps**:

1. GitHub API returns 429 or 403 (rate limit)
2. Extract `X-RateLimit-Reset` header
3. Wait until reset time
4. Retry request
5. If urgent, alert admin to investigate

**Mitigation**:
- Use authenticated API calls (higher rate limit)
- Implement caching for repo metadata
- Queue access grants if rate limit approached

---

### 12. Duplicate Purchase Attempt

**Scenario**: Customer tries to purchase same repository twice

**Steps**:

1. Checkout form checks existing purchases
2. If active purchase exists:
   - Show message: "You already have access to this repository"
   - Provide link to repository
3. If revoked purchase exists:
   - Allow re-purchase (new purchase record)

**Future Enhancement**: Show access status on product page if email matches

---

### 13. Repository Deleted from GitHub

**Scenario**: Owner deletes repository from GitHub after selling access

**Steps**:

1. System periodically checks repository existence (cron job)
2. If repository doesn't exist:
   - Mark repository as inactive
   - Alert admin
   - Send email to customers with access (optional)
3. Admin decides action: Refund, migrate to new repo, etc.

**Future Enhancement**: Webhook from GitHub for repository deletions

---

## Scheduled Workflows

### 14. Daily Repository Metadata Sync

**Schedule**: Daily at 2 AM UTC

**Steps**:

1. Query all active repositories
2. For each repository:
   - Call GitHub API to fetch stars, last_updated
   - Update database record
3. Log sync results
4. Alert admin if any errors

**Purpose**: Keep product pages up-to-date with GitHub stats

---

### 15. Weekly Revenue Report

**Schedule**: Every Monday at 9 AM UTC

**Steps**:

1. Query purchases from last 7 days
2. Calculate metrics:
   - Total revenue
   - New customers
   - Active subscriptions
   - Churn rate
3. Generate report
4. Email to admin

**Purpose**: Keep admin informed of business metrics

---

## Monitoring & Alerts

### Critical Alerts (Immediate)

- Database connection failure
- GitHub API errors (after retries)
- Webhook processing failure
- Payment processing errors

**Delivery**: Email + SMS to admin

### Warning Alerts (Daily Digest)

- Failed email deliveries
- High churn rate (> 10%)
- Failed payment attempts
- Invalid GitHub usernames

**Delivery**: Email to admin

---

**Last Updated**: January 1, 2026
**Version**: 1.0
