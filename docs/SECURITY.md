# RepoPass - Security & Compliance

## Overview

This document outlines security measures, compliance requirements, and best practices for RepoPass.

## Security Architecture

### Defense in Depth

RepoPass implements multiple layers of security:

1. **Network Layer**: CloudFront CDN, AWS WAF
2. **Application Layer**: Input validation, authentication, authorization
3. **Data Layer**: Encryption at rest and in transit
4. **Access Layer**: Least-privilege IAM roles

## Authentication & Authorization

### Admin Authentication

**Method**: GitHub OAuth 2.0

**Flow**:
1. User clicks "Login with GitHub"
2. Redirected to GitHub OAuth authorization
3. User approves scopes: `read:user`, `user:email`
4. GitHub redirects back with authorization code
5. Backend exchanges code for access token
6. Backend verifies user email matches `ADMIN_EMAIL`
7. JWT token issued (30-day expiration)
8. Token stored in HTTP-only cookie

**Security Measures**:
- State parameter for CSRF protection
- PKCE (Proof Key for Code Exchange) enabled
- HTTP-only cookies (prevents XSS)
- Secure flag (HTTPS-only)
- SameSite=Strict (prevents CSRF)

### API Authentication

**Method**: JWT (JSON Web Tokens)

**Token Structure**:
```json
{
  "sub": "user-uuid",
  "email": "cory@example.com",
  "role": "admin",
  "iat": 1609459200,
  "exp": 1612051200
}
```

**Validation**:
- Signature verification (HS256 algorithm)
- Expiration check
- Issuer verification
- Role-based access control

**Security Measures**:
- Secret key stored in AWS Secrets Manager
- Token rotation on password change
- Automatic refresh before expiration
- Revocation on logout

### Session Management

**Storage**: Redis (ElastiCache)

**Session Data**:
- User ID
- Email
- Role
- Last activity timestamp

**Security Measures**:
- 30-day expiration (auto-refresh on activity)
- Secure session IDs (crypto.randomBytes)
- Session invalidation on logout
- Concurrent session limit: 3 devices

## Data Security

### Encryption at Rest

**Database (RDS)**:
- AES-256 encryption enabled
- Encrypted snapshots
- Encrypted backups

**File Storage (S3)**:
- Server-side encryption (SSE-S3)
- Bucket encryption enforced
- Versioning enabled

**Secrets (AWS Secrets Manager)**:
- Encrypted with AWS KMS
- Automatic rotation (90 days)
- Access logged in CloudTrail

**Redis (ElastiCache)**:
- Encryption at rest enabled
- Auth token required

### Encryption in Transit

**Application**:
- TLS 1.3 enforced
- HTTP → HTTPS redirect
- HSTS header enabled (max-age: 31536000)

**API Calls**:
- GitHub API: HTTPS only
- Stripe API: HTTPS only
- Email (SES): TLS enforced

**Database Connections**:
- SSL/TLS required
- Certificate verification enabled

### Data Minimization

**Collected Data**:
- Email (required for order confirmation)
- GitHub username (required for access grant)
- Payment metadata (stored by Stripe, not RepoPass)

**Not Collected**:
- Credit card details (handled by Stripe)
- Passwords (OAuth only)
- Personal identifiable information beyond email

**Data Retention**:
- Active purchases: Indefinite
- Revoked purchases: 2 years (compliance)
- Access logs: 1 year
- Deleted users: 30-day grace period

## Input Validation

### Server-Side Validation

**All API Endpoints**:
- Zod schema validation
- Type checking
- Length constraints
- Format validation

**Example (GitHub Username)**:
```typescript
const githubUsernameSchema = z.string()
  .min(1)
  .max(39)
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/);
```

**Example (Email)**:
```typescript
const emailSchema = z.string().email();
```

**Example (Repository Pricing)**:
```typescript
const pricingSchema = z.object({
  pricingType: z.enum(['one-time', 'subscription']),
  priceCents: z.number().int().min(100).max(1000000),
  subscriptionCadence: z.enum(['monthly', 'yearly']).optional()
});
```

### SQL Injection Prevention

**ORM**: Drizzle ORM with parameterized queries

**Example**:
```typescript
// Safe (parameterized)
db.select().from(users).where(eq(users.email, email));

// Unsafe (NEVER do this)
db.execute(`SELECT * FROM users WHERE email = '${email}'`);
```

### XSS Prevention

**Output Encoding**:
- React escapes content by default
- Sanitize HTML in descriptions (DOMPurify)
- Content-Security-Policy header

**CSP Header**:
```
Content-Security-Policy: default-src 'self'; script-src 'self' https://js.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.stripe.com;
```

### CSRF Protection

**Measures**:
- SameSite=Strict cookies
- CSRF token validation (for forms)
- Origin header verification

**Token Generation**:
```typescript
const csrfToken = crypto.randomBytes(32).toString('hex');
```

## API Security

### Rate Limiting

**Implementation**: Redis-based token bucket

**Limits**:
| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Public (unauthenticated) | 100 req | 1 hour |
| Admin (authenticated) | 1000 req | 1 hour |
| Checkout | 10 req | 1 hour (per IP) |
| Webhooks | Unlimited | - |

**Response** (429 Too Many Requests):
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Try again in 3600 seconds.",
    "retryAfter": 3600
  }
}
```

### CORS Configuration

**Allowed Origins**:
- Production: `https://repopass.com`
- Staging: `https://staging.repopass.com`
- Development: `http://localhost:4321`

**Allowed Methods**: GET, POST, PATCH, DELETE

**Allowed Headers**: Content-Type, Authorization

**Credentials**: true (for cookies)

### API Versioning

**Format**: `/api/v1/...`

**Deprecation Policy**:
- Old versions supported for 6 months
- Deprecation warnings in response headers
- Documentation updated

## Secrets Management

### AWS Secrets Manager

**Stored Secrets**:
- GitHub Personal Access Token
- Stripe Secret Key
- JWT Secret
- Database Credentials
- Email Service API Keys

**Access Control**:
- IAM role-based access
- Least-privilege policy
- Audit logging (CloudTrail)

**Rotation**:
- Automatic rotation every 90 days
- Manual rotation on suspected compromise
- Zero-downtime rotation strategy

### Environment Variables

**Never Commit**:
- `.env` files in `.gitignore`
- Secrets in code
- API keys in client-side code

**Local Development**:
- `.env.example` with dummy values
- Developers create local `.env`

**Production**:
- Secrets loaded from AWS Secrets Manager
- Environment variables set in SST config

## Webhook Security

### Stripe Webhook Verification

**Steps**:
1. Extract `Stripe-Signature` header
2. Verify signature using webhook secret
3. Validate timestamp (reject if > 5 minutes old)
4. Process event only if verified

**Example**:
```typescript
const signature = request.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(
  request.body,
  signature,
  process.env.STRIPE_WEBHOOK_SECRET
);
```

**Security Measures**:
- Signature verification prevents spoofing
- Timestamp check prevents replay attacks
- Idempotency key prevents duplicate processing

## GitHub API Security

### Personal Access Token (PAT)

**Scope**: Minimal permissions
- `repo` (read/write collaborators)
- `read:user` (verify username)

**Storage**:
- AWS Secrets Manager
- Never logged or exposed

**Rotation**:
- Manual rotation every 90 days
- Auto-rotation on suspected compromise

**Rate Limiting**:
- Authenticated: 5000 req/hour
- Monitor usage via API
- Alert if approaching limit

### Collaborator Permission

**Permission Level**: `pull` (read-only)

**Rationale**:
- Customers can clone/fork
- Customers cannot modify source repo
- Prevents accidental/malicious changes

## Payment Security (PCI Compliance)

### Stripe Compliance

**PCI DSS**: Level 1 compliant (via Stripe)

**RepoPass Scope**:
- **Does NOT store** credit card data
- **Does NOT process** credit card data
- **Does NOT transmit** credit card data

**Stripe Checkout**:
- Hosted checkout (Stripe-managed)
- PCI compliance handled by Stripe
- RepoPass never touches card data

**SAQ-A Compliance**:
RepoPass qualifies for SAQ-A (simplest PCI questionnaire) because:
- All card data handled by Stripe
- No card data on RepoPass servers
- HTTPS enforced

### Payment Metadata

**Stored in RepoPass Database**:
- Stripe Payment Intent ID
- Stripe Subscription ID
- Stripe Customer ID
- Amount (cents)

**NOT Stored**:
- Card number
- CVV
- Expiration date
- Billing address (optional in Stripe)

## Logging & Monitoring

### Application Logging

**Logged Events**:
- Authentication attempts (success/failure)
- API requests (endpoint, user, timestamp)
- Access grants/revocations
- Payment events
- Errors and exceptions

**Log Storage**:
- CloudWatch Logs (encrypted)
- Retention: 90 days
- Access: Admin only

**Sensitive Data**:
- Never log passwords
- Never log credit card data
- Mask email in logs (e.g., c***@example.com)
- Mask GitHub PAT in logs

### Security Monitoring

**AWS CloudWatch Alarms**:
- Failed login attempts (> 10 in 5 min)
- API error rate (> 5%)
- Database connection failures
- Unauthorized access attempts

**SIEM Integration** (Future):
- CloudTrail logs → SIEM
- Real-time threat detection
- Anomaly detection

### Audit Logs

**access_logs Table**:
- All collaborator additions/removals
- Email send attempts
- Payment events
- Revocation actions

**Retention**: 1 year

**Access**: Admin only, read-only

## Incident Response

### Security Incident Plan

**1. Detection**
- Automated alerts (CloudWatch)
- Manual discovery
- Third-party report

**2. Containment**
- Isolate affected systems
- Revoke compromised credentials
- Block malicious IPs

**3. Investigation**
- Review logs
- Identify root cause
- Assess impact

**4. Remediation**
- Patch vulnerabilities
- Rotate secrets
- Restore from backups if needed

**5. Communication**
- Notify affected users (if data breach)
- Report to authorities (if required)
- Publish post-mortem

**6. Post-Incident**
- Update security measures
- Conduct training
- Document lessons learned

### Data Breach Response

**Threshold**: Unauthorized access to customer data (email, GitHub username)

**Steps**:
1. Contain breach
2. Assess scope (how many users affected?)
3. Notify affected users within 72 hours
4. Report to authorities (GDPR, CCPA)
5. Provide remediation (password reset, monitoring)

## Compliance

### GDPR (EU General Data Protection Regulation)

**Data Subject Rights**:
- **Right to Access**: API endpoint to export user data
- **Right to Rectification**: Edit email/username
- **Right to Erasure**: Delete account (30-day retention)
- **Right to Portability**: JSON export of data

**Lawful Basis**: Contract (purchase agreement)

**Data Processing Agreement**: With Stripe (subprocessor)

**Privacy Policy**: Required, published at `/privacy`

### CCPA (California Consumer Privacy Act)

**Applicability**: If revenue > $25M or users > 50K (future)

**Consumer Rights**:
- Right to know (data collected)
- Right to delete
- Right to opt-out of sale (not applicable - we don't sell data)

### Terms of Service

**Required Clauses**:
- Access grant terms (lifetime or subscription)
- Revocation policy (account sharing, ToS violations)
- Refund policy (handled by Stripe)
- Disclaimer (no warranties on code)
- Limitation of liability

**Acceptance**: Checkbox at checkout

## Vulnerability Management

### Dependency Scanning

**Tool**: npm audit, Snyk, or Dependabot

**Schedule**: Weekly automated scans

**Action**: Update dependencies, patch vulnerabilities

### Penetration Testing

**Frequency**: Annually (or before major releases)

**Scope**: Full application (web, API, database)

**Report**: Remediate high/critical findings within 30 days

### Bug Bounty Program (Future)

**Platform**: HackerOne or Bugcrowd

**Scope**: Production application

**Rewards**: $100 - $5000 based on severity

## Security Best Practices

### Code Security

- No secrets in code
- Use environment variables
- Validate all inputs
- Sanitize all outputs
- Use parameterized queries
- Keep dependencies updated
- Follow principle of least privilege

### Infrastructure Security

- Enable MFA on AWS account
- Use IAM roles (not API keys)
- Encrypt all data (rest + transit)
- Enable CloudTrail logging
- Use VPC for database
- Implement WAF rules
- Regular security audits

### Operational Security

- Strong passwords (min 16 chars)
- MFA on all accounts (GitHub, AWS, Stripe)
- Separate dev/staging/prod environments
- No production access for developers (except emergencies)
- Change management process
- Regular backups

---

**Last Updated**: January 1, 2026
**Version**: 1.0
