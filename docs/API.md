# RepoPass - API Documentation

## Overview

RepoPass provides REST APIs for admin operations, public product pages, and webhook handling.

## Base URLs

- **Development**: `http://localhost:4321/api`
- **Staging**: `https://staging.repopass.com/api`
- **Production**: `https://repopass.com/api`

## Authentication

### Admin Routes

All admin routes require authentication via JWT token.

**Headers**:
```
Authorization: Bearer <jwt_token>
```

**Token Acquisition**:
- Login via GitHub OAuth: `POST /api/auth/github/callback`
- Magic link: `POST /api/auth/magic-link`

**Token Expiration**: 30 days

### Rate Limiting

- **Authenticated**: 1000 requests/hour
- **Unauthenticated**: 100 requests/hour
- **Webhook**: No limit (validated by signature)

## Admin API

### Repositories

#### Create Repository

```http
POST /api/admin/repositories
```

**Request Body**:
```json
{
  "githubOwner": "ctrimm",
  "githubRepoName": "premium-theme",
  "displayName": "Premium Astro Theme",
  "description": "A beautiful production-ready theme",
  "coverImageUrl": "https://cdn.example.com/cover.png",
  "pricingType": "one-time",
  "priceCents": 4900,
  "subscriptionCadence": null
}
```

**Response** (201 Created):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "premium-astro-theme",
  "displayName": "Premium Astro Theme",
  "githubOwner": "ctrimm",
  "githubRepoName": "premium-theme",
  "description": "A beautiful production-ready theme",
  "coverImageUrl": "https://cdn.example.com/cover.png",
  "pricingType": "one-time",
  "priceCents": 4900,
  "active": true,
  "createdAt": "2026-01-01T00:00:00Z"
}
```

#### List Repositories

```http
GET /api/admin/repositories?page=1&limit=20&active=true
```

**Query Parameters**:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `active` (optional): Filter by active status (true/false)

**Response** (200 OK):
```json
{
  "repositories": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "slug": "premium-astro-theme",
      "displayName": "Premium Astro Theme",
      "pricingType": "one-time",
      "priceCents": 4900,
      "active": true,
      "purchaseCount": 42,
      "totalRevenueCents": 205800,
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

#### Get Repository

```http
GET /api/admin/repositories/:id
```

**Response** (200 OK):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "premium-astro-theme",
  "displayName": "Premium Astro Theme",
  "githubOwner": "ctrimm",
  "githubRepoName": "premium-theme",
  "description": "A beautiful production-ready theme",
  "coverImageUrl": "https://cdn.example.com/cover.png",
  "pricingType": "one-time",
  "priceCents": 4900,
  "active": true,
  "githubStars": 127,
  "githubLastUpdated": "2026-01-01T00:00:00Z",
  "stats": {
    "totalPurchases": 42,
    "activePurchases": 42,
    "totalRevenueCents": 205800
  },
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-01T00:00:00Z"
}
```

#### Update Repository

```http
PATCH /api/admin/repositories/:id
```

**Request Body** (partial update):
```json
{
  "displayName": "Premium Astro Theme v2",
  "priceCents": 5900,
  "description": "Updated description"
}
```

**Response** (200 OK):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "displayName": "Premium Astro Theme v2",
  "priceCents": 5900,
  "updatedAt": "2026-01-01T01:00:00Z"
}
```

**Note**: Price changes create a new entry in `pricing_history` table for grandfathering.

#### Deactivate Repository

```http
DELETE /api/admin/repositories/:id
```

**Response** (200 OK):
```json
{
  "message": "Repository deactivated successfully",
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Note**: Soft delete - sets `active = false`. Existing purchases remain valid.

#### Fetch GitHub Data

```http
POST /api/admin/repositories/:id/fetch-github-data
```

Fetches latest repository metadata from GitHub API.

**Response** (200 OK):
```json
{
  "githubStars": 127,
  "githubLastUpdated": "2026-01-01T00:00:00Z",
  "description": "A beautiful production-ready theme"
}
```

### Customers

#### List Customers

```http
GET /api/admin/customers?page=1&limit=20&repositoryId=<uuid>&status=active
```

**Query Parameters**:
- `page` (optional): Page number
- `limit` (optional): Items per page
- `repositoryId` (optional): Filter by repository
- `status` (optional): Filter by access_status (pending/active/revoked)

**Response** (200 OK):
```json
{
  "customers": [
    {
      "id": "650e8400-e29b-41d4-a716-446655440001",
      "email": "customer@example.com",
      "githubUsername": "johndoe",
      "repositoryName": "Premium Astro Theme",
      "purchaseType": "one-time",
      "amountCents": 4900,
      "status": "completed",
      "accessStatus": "active",
      "accessGrantedAt": "2026-01-01T00:05:00Z",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

#### Get Customer

```http
GET /api/admin/customers/:purchaseId
```

**Response** (200 OK):
```json
{
  "id": "650e8400-e29b-41d4-a716-446655440001",
  "email": "customer@example.com",
  "githubUsername": "johndoe",
  "repository": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "displayName": "Premium Astro Theme",
    "githubOwner": "ctrimm",
    "githubRepoName": "premium-theme"
  },
  "purchaseType": "subscription",
  "amountCents": 2900,
  "status": "completed",
  "accessStatus": "active",
  "stripeCustomerId": "cus_xxxxx",
  "stripeSubscriptionId": "sub_xxxxx",
  "accessLogs": [
    {
      "action": "collaborator_added",
      "status": "success",
      "createdAt": "2026-01-01T00:05:00Z"
    },
    {
      "action": "email_sent_access_granted",
      "status": "success",
      "createdAt": "2026-01-01T00:05:30Z"
    }
  ],
  "createdAt": "2026-01-01T00:00:00Z",
  "accessGrantedAt": "2026-01-01T00:05:00Z"
}
```

#### Revoke Access

```http
PATCH /api/admin/customers/:purchaseId/revoke
```

**Request Body**:
```json
{
  "reason": "Account sharing suspected"
}
```

**Response** (200 OK):
```json
{
  "message": "Access revoked successfully",
  "purchaseId": "650e8400-e29b-41d4-a716-446655440001",
  "revokedAt": "2026-01-01T12:00:00Z"
}
```

**Side Effects**:
- Removes GitHub collaborator
- Updates `access_status` to 'revoked'
- Sends revocation email to customer
- Creates access_log entry

#### Flag Customer

```http
POST /api/admin/customers/:purchaseId/flag
```

**Request Body**:
```json
{
  "reason": "Suspicious activity detected"
}
```

**Response** (200 OK):
```json
{
  "message": "Customer flagged successfully",
  "purchaseId": "650e8400-e29b-41d4-a716-446655440001"
}
```

**Note**: Flagging doesn't revoke access automatically. Admin must manually revoke.

### Dashboard

#### Get Dashboard Metrics

```http
GET /api/admin/dashboard?period=30d
```

**Query Parameters**:
- `period` (optional): Time period (7d/30d/90d/1y/all) (default: 30d)

**Response** (200 OK):
```json
{
  "period": "30d",
  "metrics": {
    "totalRevenueCents": 245000,
    "totalPurchases": 50,
    "activePurchases": 48,
    "activeSubscriptions": 12,
    "churnRate": 4.0,
    "conversionRate": 12.5,
    "averageOrderValueCents": 4900
  },
  "recentSales": [
    {
      "id": "750e8400-e29b-41d4-a716-446655440002",
      "repositoryName": "Premium Astro Theme",
      "email": "customer@example.com",
      "amountCents": 4900,
      "createdAt": "2026-01-01T10:00:00Z"
    }
  ],
  "failedPayments": [
    {
      "id": "850e8400-e29b-41d4-a716-446655440003",
      "email": "customer2@example.com",
      "repositoryName": "Premium Astro Theme",
      "amountCents": 2900,
      "reason": "insufficient_funds",
      "createdAt": "2026-01-01T09:00:00Z"
    }
  ]
}
```

### Access Logs

#### Get Access Logs

```http
GET /api/admin/access-logs?purchaseId=<uuid>&action=collaborator_added&status=failed
```

**Query Parameters**:
- `purchaseId` (optional): Filter by purchase
- `repositoryId` (optional): Filter by repository
- `action` (optional): Filter by action type
- `status` (optional): Filter by status (success/failed/retry)
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response** (200 OK):
```json
{
  "logs": [
    {
      "id": "950e8400-e29b-41d4-a716-446655440004",
      "purchaseId": "650e8400-e29b-41d4-a716-446655440001",
      "action": "collaborator_added",
      "status": "success",
      "metadata": {
        "githubUsername": "johndoe",
        "repositoryFullName": "ctrimm/premium-theme"
      },
      "createdAt": "2026-01-01T00:05:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "totalPages": 3
  }
}
```

## Public API

### Products

#### Get Product Details

```http
GET /api/products/:slug
```

**Response** (200 OK):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "premium-astro-theme",
  "displayName": "Premium Astro Theme",
  "description": "A beautiful production-ready theme",
  "coverImageUrl": "https://cdn.example.com/cover.png",
  "pricingType": "one-time",
  "priceCents": 4900,
  "subscriptionCadence": null,
  "githubOwner": "ctrimm",
  "githubRepoName": "premium-theme",
  "githubStars": 127,
  "features": [
    "Fully responsive design",
    "Dark mode support",
    "SEO optimized"
  ]
}
```

### Checkout

#### Create Checkout Session

```http
POST /api/checkout
```

**Request Body**:
```json
{
  "repositoryId": "550e8400-e29b-41d4-a716-446655440000",
  "githubUsername": "johndoe",
  "email": "customer@example.com"
}
```

**Response** (200 OK):
```json
{
  "sessionId": "cs_test_xxxxx",
  "sessionUrl": "https://checkout.stripe.com/c/pay/cs_test_xxxxx",
  "purchaseId": "650e8400-e29b-41d4-a716-446655440001"
}
```

**Side Effects**:
- Creates Stripe Checkout Session
- Creates purchase record with status 'pending'
- Sends confirmation email

## Webhooks

### Stripe Webhook

```http
POST /api/webhooks/stripe
```

**Headers**:
```
Stripe-Signature: t=1234567890,v1=xxxxx
```

**Handled Events**:
- `charge.succeeded` - Grant access for one-time purchases
- `charge.refunded` - Revoke access (manual handling)
- `customer.subscription.created` - Grant access for subscriptions
- `customer.subscription.deleted` - Revoke access
- `invoice.payment_succeeded` - Log renewal
- `invoice.payment_failed` - Alert admin

**Response** (200 OK):
```json
{
  "received": true
}
```

**Error Response** (400 Bad Request):
```json
{
  "error": "Invalid signature"
}
```

## Error Responses

### Standard Error Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

## Pagination

All list endpoints support cursor-based pagination:

**Request**:
```http
GET /api/admin/customers?page=2&limit=20
```

**Response**:
```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasNext": true,
    "hasPrevious": true
  }
}
```

## Testing

### Stripe Test Mode

Use Stripe test mode credentials in development and staging.

**Test Cards**:
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

### Webhook Testing

Use Stripe CLI for local webhook testing:

```bash
stripe listen --forward-to localhost:4321/api/webhooks/stripe
```

---

**Last Updated**: January 1, 2026
**Version**: 1.0
