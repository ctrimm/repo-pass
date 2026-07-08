# RepoPass - API Documentation

## Overview

RepoPass exposes Astro API routes for GitHub OAuth login, the owner dashboard, public
product/checkout pages, and payment-provider webhooks. There is no versioned `/api/v1/` prefix
and no separate public REST API for third parties — these routes back the app's own UI.

## Base URL

Requests go to whatever `SITE_URL` is configured for the deployment (`http://localhost:4321` in
local dev). There's no separate staging/production API host baked into the code — that's purely
a function of where you deploy.

## Authentication

RepoPass has **no Bearer-token API auth and no magic-link login**. The only login method is
GitHub OAuth, and sessions are a JWT stored in an HTTP-only cookie (`repopass_session`, see
`src/lib/auth.ts`) — not sent via an `Authorization` header.

Any GitHub account can sign in; there's no invite list or `ADMIN_EMAIL` allowlist gating login.
Each signed-in user only ever sees their own repositories and customers (enforced by filtering
every query on `ownerId = session.userId`).

**Login flow**:
1. `GET /api/auth/github` — redirects to GitHub's OAuth authorize URL (requests `repo read:user
   user:email` scope)
2. GitHub redirects back to `GET /api/auth/github/callback` with a `code`
3. The callback exchanges the code for an access token, creates/updates the `users` row
   (storing the encrypted OAuth token as the user's GitHub credential), sets the session cookie,
   and redirects to `/dashboard`
4. `POST /api/auth/logout` clears the session cookie

**Session expiration**: 30 days (`setExpirationTime('30d')` in `src/lib/auth.ts`).

### Rate Limiting

Only two endpoints are rate-limited, via an in-memory per-process counter
(`src/lib/rate-limit.ts`) — there is no rate limiting on any other route:

| Endpoint | Limit |
|---|---|
| `POST /api/checkout` | 5 requests / minute / client |
| `POST /api/free-access` | 5 requests / minute / client |

A `429` response includes `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and
`X-RateLimit-Reset` headers.

## Auth Routes

### `GET /api/auth/github`
Redirects to GitHub's OAuth authorize page.

### `GET /api/auth/github/callback`
OAuth callback. Redirects to `/dashboard` on success, or `/login?error=oauth_failed` /
`/login?error=server_error` on failure.

### `GET /api/auth/github/repositories`
Returns the signed-in user's own GitHub repositories (for the "select from your GitHub repos"
dropdown on the Add Repository form).

**Response** (200 OK):
```json
{
  "repositories": [
    {
      "id": 123456,
      "name": "premium-theme",
      "fullName": "ctrimm/premium-theme",
      "owner": "ctrimm",
      "description": "A beautiful production-ready theme",
      "isPrivate": true,
      "stars": 12,
      "url": "https://github.com/ctrimm/premium-theme"
    }
  ]
}
```

### `POST /api/auth/logout`
Clears the session cookie.

## Dashboard API (Authenticated, Owner-Scoped)

All routes below require a valid session cookie and only operate on data owned by
`session.userId`. Unauthenticated requests get `401`.

### Repositories

#### `GET /api/dashboard/admin/repositories`
List the current user's repositories.

**Response** (200 OK):
```json
{ "repositories": [ /* full repositories rows */ ] }
```

#### `POST /api/dashboard/admin/repositories`
Create a repository.

**Request Body**:
```json
{
  "githubOwner": "ctrimm",
  "githubRepoName": "premium-theme",
  "displayName": "Premium Astro Theme",
  "description": "A beautiful production-ready theme",
  "coverImageUrl": "https://example.com/cover.png",
  "pricingType": "one-time",
  "priceCents": 4900,
  "subscriptionCadence": "monthly",
  "requireEmailForFree": false
}
```
`pricingType` is one of `one-time` / `subscription` / `free`. A `slug` is generated from
`githubRepoName`, and an initial `pricing_history` row is created automatically.

**Response** (201 Created): the created repository row.

#### `GET /api/dashboard/admin/repositories/:id`
Returns the repository (verifying ownership) plus `stats: { totalPurchases, activePurchases,
totalRevenueCents }`.

#### `PATCH /api/dashboard/admin/repositories/:id`
Partial update (`displayName`, `description`, `coverImageUrl`, `priceCents`, `active`).
`githubOwner`/`githubRepoName` cannot be changed after creation. Changing `priceCents` closes out
the current `pricing_history` row (sets `effectiveUntil`) and opens a new one — this is how
grandfathering works: existing purchases keep the price recorded at time of purchase.

#### `DELETE /api/dashboard/admin/repositories/:id`
Soft delete — sets `active = false`. Existing purchases are untouched.

### Customers

#### `GET /api/dashboard/admin/customers?repositoryId=<uuid>&status=<active|pending|revoked>`
Lists purchases across all of the current user's repositories (joined with repository name/slug),
optionally filtered by repository or `access_status`.

#### `POST /api/dashboard/admin/customers/:purchaseId/revoke`
Revokes a customer's access: removes the GitHub collaborator, cancels the Stripe subscription if
one exists, marks the purchase `access_status = 'revoked'`, logs an `access_logs` entry, and
emails the customer.

**Request Body**: `{ "reason": "Account sharing suspected" }` (optional)

**Response** (200 OK): `{ "message": "Access revoked successfully", "purchaseId": "..." }`

> There is no "flag customer" endpoint, no standalone dashboard-metrics API, and no
> `access-logs` list API — the dashboard overview page (`/dashboard`) and customer pages query
> the database directly in Astro frontmatter rather than calling a separate JSON endpoint.

### Settings

- `POST /api/dashboard/settings/github-pat` — store an encrypted GitHub PAT override
- `POST /api/dashboard/settings/payment-provider` — connect Stripe / Lemon Squeezy / Gumroad /
  Paddle credentials (encrypted at rest); clears the other providers' fields when switching
- `POST /api/dashboard/settings/disconnect-provider` — clear the connected payment provider
- `POST /api/dashboard/settings/email-preferences` — toggle the `email_notifications` opt-out

These are plain HTML form posts (`request.formData()`), not JSON APIs.

## Public Routes (Unauthenticated)

### Product Page
`GET /products/:slug` is a server-rendered Astro page (`src/pages/products/[slug].astro`), not a
JSON API — it queries the repository by slug directly and renders the purchase form.

### `POST /api/checkout`
Creates a checkout session with whichever payment provider the repository owner has connected.

**Request Body**:
```json
{
  "repositoryId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "customer@example.com",
  "githubUsername": "johndoe"
}
```

**Response** (200 OK):
```json
{
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_xxxxx",
  "purchaseId": "650e8400-e29b-41d4-a716-446655440001",
  "provider": "stripe"
}
```

Rejects with `400` if the repository is `free` (use `/api/free-access` instead) or if the owner
hasn't configured a payment provider yet.

### `POST /api/free-access`
For `pricingType: 'free'` repositories — grants access without any payment step.

**Request Body**:
```json
{
  "repositoryId": "550e8400-e29b-41d4-a716-446655440000",
  "githubUsername": "johndoe",
  "email": "customer@example.com"
}
```
`email` is only required if the repository has `requireEmailForFree: true`.

## Webhooks

Each connected payment provider has its own webhook endpoint. All of them: create/update the
matching `purchases` row, add or remove the GitHub collaborator via `src/lib/github.ts`, write an
`access_logs` entry, and send a transactional email via Resend.

### `POST /api/webhooks/stripe`
Verifies the `Stripe-Signature` header against `STRIPE_WEBHOOK_SECRET`. Handles:
- `checkout.session.completed` → grant access (one-time or new subscription)
- `customer.subscription.deleted` → revoke access
- `invoice.payment_succeeded` → log renewal
- `invoice.payment_failed` → alert the repository owner (`ADMIN_EMAIL`)

### `POST /api/webhooks/lemon-squeezy`
Handles `order_created`, `subscription_cancelled`, `subscription_payment_success`,
`subscription_payment_failed` (from the `meta.event_name` field).

### `POST /api/webhooks/paddle`
Handles `payment_succeeded` / `subscription_payment_succeeded`, `subscription_cancelled`,
`subscription_payment_failed`, `payment_refunded`.

### `POST /api/webhooks/gumroad`
Gumroad sends a form-encoded "ping" rather than a signed JSON event; the handler reads the
`refunded` field directly to decide whether to revoke access.

## Error Responses

There's no single standardized error envelope across every route — most return
`{ "error": "<message>" }` with an appropriate HTTP status, and validation failures return
`{ "error": "Invalid request", "details": [...] }` where `details` is a Zod `issues` array.

Common status codes: `400` (validation), `401` (no/invalid session), `404` (not found or not
owned by the caller), `429` (rate limited), `500` (unhandled error).

## Testing

### Stripe Test Mode

**Test Cards**:
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

### Webhook Testing

```bash
stripe listen --forward-to localhost:4321/api/webhooks/stripe
```

Other providers don't have an equivalent local CLI in this repo — test their webhooks against a
deployed URL using each provider's dashboard-based webhook testing tools.

---

**Last Updated**: 2026-07-08
