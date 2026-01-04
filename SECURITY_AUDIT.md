# Security Audit Report - RepoPass Multi-Tenant Application

**Date:** 2026-01-04
**Auditor:** Claude
**Scope:** Multi-tenancy, Data Storage, Access Control

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

## ⚠️ CRITICAL - Sensitive Data Storage

### Issue: Unencrypted API Keys in Database

**Severity:** CRITICAL
**Location:** `src/db/schema.ts` - users table

**Problem:**
All payment provider API keys and GitHub tokens are stored as **plain text** in the database:

```typescript
// CURRENTLY INSECURE - Plain text storage
githubPersonalAccessToken: text('github_personal_access_token'),
stripeSecretKey: text('stripe_secret_key'),
stripePublishableKey: text('stripe_publishable_key'),
lemonSqueezyApiKey: text('lemon_squeezy_api_key'),
gumroadAccessToken: text('gumroad_access_token'),
paddleApiKey: text('paddle_api_key'),
```

**Risk:**
- Database breach exposes ALL user API keys
- SQL injection could leak secrets
- Backup files contain plain text secrets
- Logs may inadvertently expose keys

**Recommendation:**
Implement encryption-at-rest for sensitive fields:

```typescript
// Option 1: Application-layer encryption (recommended)
import { encrypt, decrypt } from './lib/crypto';

// Before storing
const encryptedKey = encrypt(stripeSecretKey);
await db.update(users).set({ stripeSecretKey: encryptedKey });

// When retrieving
const decryptedKey = decrypt(user.stripeSecretKey);
```

```typescript
// Option 2: Database-level encryption (Neon Postgres supports pgcrypto)
// Use pgcrypto extension for column-level encryption
stripeSecretKey: text('stripe_secret_key') // encrypted with pgcrypto
```

**Implementation Priority:** HIGH - Should be done before production deployment

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

## ⚠️ LOW - Rate Limiting

### Issue: No Rate Limiting on Checkout

**Severity:** LOW
**Location:** `/api/checkout.ts`

**Problem:**
No rate limiting on checkout endpoint could allow:
- Spam purchases
- Database DoS
- Email flooding

**Recommendation:**
```typescript
import { rateLimiter } from '../../lib/rate-limit';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Add rate limiting
  const limited = await rateLimiter.check(clientAddress, 'checkout', 5, 60000); // 5 per minute
  if (limited) {
    return new Response('Too many requests', { status: 429 });
  }
  // ... rest of handler
};
```

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
2. ⚠️ **TODO** - Encrypt API keys and tokens in database
3. ⚠️ **TODO** - Implement rate limiting on public endpoints
4. ⚠️ **TODO** - Add GDPR compliance features

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

**Overall Security Grade:** B (Good with critical fixes needed)

**Strengths:**
- ✅ Excellent multi-tenant isolation
- ✅ Proper ownership verification on all endpoints
- ✅ SQL injection protection via ORM
- ✅ Secure session management

**Critical Gaps:**
- ⚠️ Unencrypted API keys in database (MUST FIX)
- ⚠️ No rate limiting on public endpoints
- ⚠️ Plain text email storage

**Recommendation:** Address encryption of sensitive data before production launch. All other issues are manageable post-launch but should be prioritized.
