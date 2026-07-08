# RepoPass - Security & Compliance

## Overview

This document describes what RepoPass actually implements today, plus known gaps. It replaces an
earlier version that described a lot of AWS infrastructure (RDS, ElastiCache, S3, WAF,
CloudTrail, KMS rotation) that was never built — this app currently runs on Postgres + Node,
optionally on AWS Lambda via SST, with no additional AWS services wired in.

## Authentication & Authorization

### Login

**Method**: GitHub OAuth 2.0 — the only login method. There is no password login and no
magic-link login.

**Flow** (`src/pages/api/auth/github.ts` → `github/callback.ts`):
1. User clicks "Sign in with GitHub" → `GET /api/auth/github`
2. Redirected to GitHub's OAuth authorize page, requesting `repo read:user user:email` scope
3. GitHub redirects back to `GET /api/auth/github/callback` with an authorization code
4. Backend exchanges the code for an access token and fetches the user's profile/email
5. A `users` row is created (first login) or updated (subsequent logins); the OAuth access token
   is encrypted and stored as the user's GitHub credential
6. A JWT session token is issued (30-day expiration) and set as an HTTP-only cookie
7. Redirect to `/dashboard`

**What is NOT implemented**, despite being commonly expected for OAuth flows:
- No `state` parameter / CSRF protection on the OAuth redirect
- No PKCE
- No email allowlist — **any GitHub account can sign in and immediately manage its own
  repositories**; there is no admin-approval step

If you need to restrict who can use a deployment, that would need to be added — today it's fully
open self-serve signup.

### Session Management

**Storage**: Stateless JWT (HS256), **not** a server-side session store — there is no Redis/
database-backed session table. The token itself, verified against `JWT_SECRET`, is the source of
truth.

**Token contents** (`src/lib/auth.ts`): `{ userId, email, iat, exp }` — no role/permissions claim
(every authenticated user has the same capabilities over their own data).

**Cookie**: `repopass_session`, `httpOnly`, `sameSite: lax`, `secure` in production, 30-day
`maxAge`.

**Logout**: clears the cookie. Because the JWT itself isn't tracked server-side, a token that
leaked before logout remains cryptographically valid until it expires — there's no revocation
list. This is a standard trade-off of stateless JWTs, not a bug, but worth knowing if you need
hard revocation.

## Data Security

### Encryption at Rest

**What's actually encrypted**: payment provider credentials (Stripe/Lemon Squeezy/Gumroad/Paddle
keys) and the GitHub token, via application-layer AES-256-GCM encryption
(`src/lib/crypto.ts`), keyed off `ENCRYPTION_SECRET` (scrypt-derived). This was a real fix for a
previously-flagged issue — see [`SECURITY_AUDIT.md`](../SECURITY_AUDIT.md).

**What relies on the hosting platform**: whether the database itself is encrypted at rest
depends on your Postgres provider (Neon encrypts by default; so does AWS RDS) — RepoPass doesn't
configure this itself.

**Not implemented**: KMS-based secret rotation, S3 (there's no file storage in this app —
`coverImageUrl` is just a text URL field, not an upload pipeline).

### Encryption in Transit

TLS is provided by whatever's in front of the app (CloudFront if deployed via SST, or your own
reverse proxy/load balancer on a Node host) — RepoPass itself doesn't terminate or configure TLS.

### Data Minimization

**Collected**: email, GitHub username, and (for paid purchases) payment metadata forwarded by the
provider (customer ID, payment intent/subscription ID — never card data).

**Not collected**: passwords (OAuth only), card details (handled entirely by the connected
provider).

## Input Validation

All mutating API routes validate the request body with Zod (see `docs/API.md` for the actual
schemas per route — for example `checkoutSchema` in `src/pages/api/checkout.ts` requires
`repositoryId` as a UUID, `email` as an email, and `githubUsername` as 1-39 characters). There is
no additional regex-based GitHub-username-format validation beyond the length check.

### SQL Injection Prevention

All database access goes through Drizzle ORM's parameterized query builder — there is no raw SQL
string interpolation in the application code (migrations are static `.sql` files, not
user-influenced).

### XSS Prevention

React escapes rendered content by default. There is no explicit `Content-Security-Policy` header
configured in this repo, and no DOMPurify sanitization call was found wired into the repository
description rendering path, despite `isomorphic-dompurify` being listed as a dependency — treat
CSP and output sanitization here as a gap, not a shipped mitigation, until verified otherwise for
your deployment.

## API Security

### Rate Limiting

**Implementation**: in-memory, per-process counter (`src/lib/rate-limit.ts`) — not Redis, not
distributed.

**Actual limits** (everything else is unlimited):

| Endpoint | Limit |
|---|---|
| `POST /api/checkout` | 5 requests / minute / client |
| `POST /api/free-access` | 5 requests / minute / client |

`429` responses include `Retry-After` and `X-RateLimit-*` headers.

### CORS

No CORS configuration exists in this codebase. That's fine as long as nothing but this app's own
frontend calls its API routes — if you build a separate client that calls these endpoints
cross-origin, you'll need to add CORS handling.

### API Versioning

There is no `/api/v1/` versioning scheme — routes are unversioned.

## Secrets Management

**Local development**: `.env` (gitignored), loaded via `dotenv`, validated at startup by
`src/lib/env.ts` (Zod schema — the app throws a descriptive error naming any missing/invalid
variable).

**Production (SST/AWS path)**: secrets are set via `npx sst secret set ...` and stored in AWS
Secrets Manager, injected into the Lambda environment by SST. There is no automatic rotation
configured.

**Per-user secrets**: payment provider credentials and the GitHub token are stored in the
database, encrypted (see above) — not in AWS Secrets Manager, since they're per-tenant, not
platform-level.

## Webhook Security

### Stripe

`src/pages/api/webhooks/stripe.ts` reads the `Stripe-Signature` header and verifies it against
`STRIPE_WEBHOOK_SECRET` via `stripe.webhooks.constructEvent` before processing. Missing/invalid
signatures are rejected with `400`.

### Lemon Squeezy / Paddle / Gumroad

Each has its own webhook handler with its own verification approach (see `docs/API.md` for the
event names each handles) — they were not audited in this pass with the same depth as Stripe's;
if you connect one of these providers in production, verify its signature-checking logic
yourself before relying on it.

## GitHub API Security

### OAuth / Personal Access Token

**Scope requested at login**: `repo read:user user:email` — this is broader than the minimum
needed for read-only collaborator management (a fine-grained PAT scoped to just collaborator
administration would be tighter, but isn't what's implemented).

**Storage**: encrypted in the `users` table (see Encryption at Rest above).

**Collaborator permission granted to purchasers**: `pull` (read-only) — customers can clone/fork
but not push to the source repo.

## Payment Security

RepoPass never touches card data — that's handled entirely by whichever provider (Stripe, Lemon
Squeezy, Gumroad, Paddle) the repository owner connects. The database stores only payment
metadata: provider customer/subscription/payment-intent IDs and the charged amount in cents.

## Logging

Errors are logged via `console.error`/`console.warn` — there is no structured logging, log
redaction (e.g., masking emails or tokens in logs), or centralized log aggregation configured in
this repo. If deployed via SST/Lambda, these end up in whatever CloudWatch Logs SST wires up by
default; nothing beyond that is configured.

## Known Gaps (Honest List)

- No GDPR/CCPA data export or erasure endpoints (the `email_notifications` column is the only
  privacy-related control that exists)
- No CSRF protection on the OAuth login flow (no `state` parameter)
- No rate limiting outside of `/api/checkout` and `/api/free-access`
- No dependency-scanning automation configured (no Dependabot/Snyk config in this repo — `npm
  audit` is manual)
- No Content-Security-Policy header
- Broad OAuth/PAT scope (`repo`) relative to what collaborator management strictly needs

## Vulnerability Management

Run `npm audit` periodically — no automated schedule exists in this repo (no Dependabot
configuration file was found).

---

**Last Updated**: 2026-07-08
