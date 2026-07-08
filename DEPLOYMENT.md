# Deployment Guide

RepoPass is an Astro app running in **server (SSR) mode** with the `@astrojs/node` adapter in
`standalone` mode (see `astro.config.js`). It needs a running PostgreSQL database and a set of
environment variables (see `.env.example`) — it is **not** a static site, so static hosts
(GitHub Pages, plain S3, etc.) won't work without significant changes.

There are two supported deployment paths:

1. **AWS Lambda via SST** — the path this repo is actually configured for (`sst.config.ts`).
2. **Any Node.js host** — using the built-in standalone server, no extra adapter needed.

Deploying to Vercel or Netlify is possible but requires swapping `@astrojs/node` for their
platform-specific Astro adapter (`@astrojs/vercel` / `@astrojs/netlify`) — that swap is not done
in this repo today.

## Table of Contents

- [Prerequisites](#prerequisites)
- [AWS via SST (recommended)](#aws-via-sst-recommended)
- [Any Node.js Host](#any-nodejs-host)
- [Docker](#docker)
- [Vercel / Netlify (requires adapter swap)](#vercel--netlify-requires-adapter-swap)
- [Post-Deployment Checklist](#post-deployment-checklist)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying:

1. Provision a PostgreSQL database (Neon, RDS, Supabase, or self-hosted) and run migrations:
   `npm run db:migrate`
2. Set every variable from `.env.example` in your hosting platform (see
   [docs/SETUP.md](./docs/SETUP.md) for what each one does)
3. Update `SITE_URL` to your production URL, and update your GitHub OAuth App's
   **Authorization callback URL** to `https://<your-domain>/api/auth/github/callback`
4. Test the production build locally: `npm run build && npm run preview`

## AWS via SST (recommended)

This repo ships with `sst.config.ts` (SST v3 / Ion), which deploys the Astro SSR app to AWS
Lambda behind CloudFront, with secrets managed via `sst.Secret`.

```bash
# One-time: set every secret referenced in sst.config.ts
npx sst secret set DatabaseUrl "postgresql://..."
npx sst secret set JwtSecret "$(openssl rand -base64 32)"
npx sst secret set SessionSecret "$(openssl rand -base64 32)"
npx sst secret set GitHubClientSecret "..."
npx sst secret set GitHubPAT "..."
npx sst secret set StripeSecretKey "..."
npx sst secret set StripeWebhookSecret "..."
npx sst secret set ResendApiKey "..."
npx sst secret set AdminEmail "..."
npx sst secret set PostHogApiKey "..."   # optional

# Deploy
npx sst deploy --stage production
```

`sst.config.ts` currently points at `repopass.io` for the production custom domain via Cloudflare
DNS (`sst.cloudflare.dns()`) — update this to your own domain, or remove the `domain` block to
deploy without one. See [TODO.md](./TODO.md) for the full secrets/setup checklist.

## Any Node.js Host

Because the adapter is `@astrojs/node` in `standalone` mode, the build output is a self-contained
Node server — no platform-specific adapter required. This works on a VPS, Railway, Fly.io,
Render, or similar:

```bash
npm ci
npm run build
node ./dist/server/entry.mjs
```

The server listens on `PORT` (default `4321`, matches `.env.example`). Put it behind a reverse
proxy (nginx, Caddy) for TLS termination, and make sure the process manager (systemd, pm2) has
every environment variable from `.env.example` set.

## Docker

There's no `Dockerfile` in this repo yet. A minimal one for the Node adapter:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
```

```bash
docker build -t repopass .
docker run -p 4321:4321 --env-file .env repopass
```

You'll still need a reachable PostgreSQL instance — `docker-compose.yml` in this repo provides
one for **local development only** (Postgres + MailDev); it is not a production deployment
manifest.

## Vercel / Netlify (requires adapter swap)

Astro auto-detects some platforms, but only if the matching adapter is installed. To deploy here
you would need to:

1. `npm install @astrojs/vercel` (or `@astrojs/netlify`)
2. Swap the `adapter: node(...)` line in `astro.config.js` for the platform adapter
3. Configure every `.env.example` variable in the platform's dashboard
4. Provision PostgreSQL separately (Vercel/Netlify don't host a database) — Neon or Supabase work well

This repo does not currently ship with either adapter installed, so treat this path as a starting
point, not a "just works" deploy target.

## Post-Deployment Checklist

- [ ] Site loads and the marketing homepage renders
- [ ] `npm run db:migrate` has been run against the production database
- [ ] GitHub OAuth callback URL matches the production domain exactly
- [ ] `stripe listen`-style webhook is replaced with a real webhook endpoint pointed at
      `https://<your-domain>/api/webhooks/stripe` (and the equivalent for any other provider a
      user connects) with the matching signing secret in your env
- [ ] Test a real purchase end-to-end (test mode is fine) and confirm the GitHub collaborator is
      added and the confirmation email arrives
- [ ] `sitemap-index.xml` is reachable (from `@astrojs/sitemap`)
- [ ] HTTPS is enforced

## Troubleshooting

### Build fails

```bash
node --version   # should be >=22.12 (see package.json "engines")
rm -rf node_modules package-lock.json && npm install
npx tsc --noEmit
```

### 500 errors after deploy

Almost always a missing/invalid environment variable — `src/lib/env.ts` validates the full set
at startup with Zod and throws a descriptive error naming the missing key. Check your process
logs for `Missing or invalid environment variables: ...`.

### OAuth callback fails

The GitHub OAuth App's **Authorization callback URL** must exactly match
`{SITE_URL}/api/auth/github/callback`. A mismatch here is the most common cause of login failures
after moving to a new domain.

---

## Need Help?

- [Astro Deployment Docs](https://docs.astro.build/en/guides/deploy/)
- [SST Documentation](https://sst.dev/docs)
- [Neon PostgreSQL](https://neon.tech/docs)
