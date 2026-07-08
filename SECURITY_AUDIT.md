# Security Audit Report - RepoPass Multi-Tenant Application

**Date:** 2026-01-04 (updated 2026-07-08 — see status notes below)
**Auditor:** Claude
**Scope:** Multi-tenancy, Data Storage, Access Control

> **Update (2026-07-08):** The two items originally marked CRITICAL/LOW below —
> unencrypted secrets and missing checkout rate limiting — have since been fixed
> and are called out inline. The rest of this report (multi-tenancy isolation,
> session management, SQL injection protection) still reflects the current
> codebase.

---

## ✅ SECURE - Multi-Tenancy Access Control

### API Endpoints - Properly Secured
All dashboard API endpoints now have ownership verification:

1. **GET /api/dashboard/admin/repositories** ✅
   - Filters by `eq(repositories.ownerId, session.userId)`

2. **GET/PATCH/DELETE /api/dashboard/admin/repositories/[id]** ✅
   - Verifies: `and(eq(repositories.id, id), eq(repositories.ownerId, session.userId))`

3. **GET /api/dashboard/admin/customers** ✅
   - Gets user's repo IDs first, then filters: `inArray(purchases.repositoryId, userRepoIds)`

4. **POST /api/dashboard/admin/customers/[id]/revoke** ✅
   - Verifies repository ownership before revoking access

### Dashboard Pages - Properly Secured
All dashboard pages filter by ownership:

1. **/dashboard/index.astro** ✅
2. **/dashboard/customers/index.astro** ✅
3. **/dashboard/customers/[id].astro** ✅
4. **/dashboard/repositories/[id]/edit.astro** ✅

---

## ✅ RESOLVED - Sensitive Data Storage

### Issue: Unencrypted API Keys in Database (FIXED)

**Original Severity:** CRITICAL
**Location:** `src/db/schema.ts` - users table

**Status:** Fixed. All payment provider API keys and the GitHub personal access
token are now encrypted at the application layer via `src/lib/crypto.ts` before
being written to the `users` table, and decrypted on read:

```typescript
// src/pages/api/dashboard/settings/github-pat.ts
githubPersonalAccessToken: encrypt(githubPat),

// src/pages/api/dashboard/settings/payment-provider.ts
updateData.stripeSecretKey = encrypt(secretKey);
updateData.lemonSqueezyApiKey = encrypt(apiKey);
updateData.gumroadAccessToken = encrypt(accessToken);
updateData.paddleApiKey = encrypt(apiKey);
```

The columns themselves (`text` type) still store ciphertext, not plaintext — the
schema comment "encrypted in application layer" reflects this.

---

## ⚠️ MEDIUM - Customer Email Privacy

### Issue: Email Exposure in Purchases Table

**Severity:** MEDIUM
**Location:** `src/db/schema.ts` - purchases table

**Problem:**
Customer emails are stored in plain text and may be visible to repository owners.

```typescript
email: varchar('email', { length: 255 }).notNull(),
```

**Risk:**
- Email addresses can be scraped from database
- Potential GDPR compliance issue
- Spam/phishing target list

**Recommendation:**
1. Hash emails for lookup purposes
2. Store encrypted version for email sending
3. Implement email opt-out mechanism
4. Add GDPR compliance features (data export, deletion)

---

## ✅ GOOD - Session Management

### Secure Session Handling
- JWT tokens used for sessions ✅
- Session secrets stored in environment variables ✅
- Cookie-based auth with httpOnly flag ✅

---

## ✅ RESOLVED - Rate Limiting

### Issue: No Rate Limiting on Checkout (FIXED)

**Original Severity:** LOW
**Location:** `/api/checkout.ts`, `/api/free-access.ts`

**Status:** Fixed. Both endpoints call `checkRateLimit()` from
`src/lib/rate-limit.ts`, capping requests at 5/minute per client and returning
`429` with `Retry-After`/`X-RateLimit-*` headers when exceeded.

**Note:** the limiter is an in-memory, per-process `Map` (see
`src/lib/rate-limit.ts`) — it resets on redeploy and isn't shared across
multiple server instances. That's an accepted MVP trade-off, not a bug, but
worth knowing if this is deployed behind a multi-instance/multi-Lambda setup.

---

## ✅ GOOD - SQL Injection Protection

### Drizzle ORM Parameterized Queries
All database queries use Drizzle ORM with parameterized queries ✅
- No raw SQL with string concatenation
- Safe from SQL injection attacks

---

## ⚠️ MEDIUM - GitHub Token Scope

### Issue: Broad GitHub PAT Permissions

**Severity:** MEDIUM
**Location:** GitHub Personal Access Token usage

**Problem:**
Users are asked to provide a GitHub PAT which may have broader permissions than needed.

**Risk:**
- Over-privileged access to user's GitHub
- If token is compromised, attacker gains full GitHub access

**Recommendation:**
1. Document minimum required scopes (only `repo` for private, none for public)
2. Consider GitHub App installation instead of PAT
3. Implement token scope validation
4. Store token expiration and prompt for renewal

---

## ✅ GOOD - Multi-Tenant Isolation

### Database Schema Design
- All repositories have `ownerId` foreign key ✅
- Purchases linked to repositories (indirect ownership) ✅
- No shared resources between tenants ✅

---

## 📋 Recommended Actions

### Immediate (Before Production)
1. ✅ **DONE** - Add ownership verification to all API endpoints
2. ✅ **DONE** - Encrypt API keys and tokens in database
3. ✅ **DONE** - Implement rate limiting on public endpoints
4. ⚠️ **TODO** - Add GDPR compliance features (right-to-erasure/export endpoints; an
   `email_notifications` opt-out column exists on `users`, but no data export/delete flow yet)

### Short-term (Within 1-2 sprints)
1. Hash/encrypt customer emails
2. Implement token scope validation for GitHub PATs
3. Add audit logging for sensitive operations
4. Implement session expiration and renewal

### Long-term (Future enhancements)
1. Consider GitHub App instead of PAT
2. Implement 2FA for dashboard access
3. Add security headers (CSP, HSTS, etc.)
4. Regular security penetration testing

---

## Summary

**Overall Security Grade:** B+ (previous critical/low findings resolved; medium items remain)

**Strengths:**
- ✅ Excellent multi-tenant isolation
- ✅ Proper ownership verification on all endpoints
- ✅ SQL injection protection via ORM
- ✅ Secure session management
- ✅ Secrets encrypted at rest (payment provider keys, GitHub tokens)
- ✅ Rate limiting on checkout and free-access endpoints

**Remaining Gaps (Medium/Low):**
- ⚠️ Plain text email storage in `purchases` table
- ⚠️ No GDPR data export/erasure endpoints
- ⚠️ GitHub PAT/OAuth scope is broader (`repo`) than strictly required for read-only collaborator management

**Recommendation:** The must-fix items from the original audit are done. The remaining items are
reasonable to prioritize post-launch.
