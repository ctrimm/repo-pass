# Deployment Guide

This guide covers deploying your Astro + React + Tailwind CSS application to various hosting platforms.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Vercel](#vercel)
- [Netlify](#netlify)
- [Cloudflare Pages](#cloudflare-pages)
- [GitHub Pages](#github-pages)
- [AWS Amplify](#aws-amplify)
- [Traditional Hosting](#traditional-hosting)
- [Docker](#docker)

## Prerequisites

Before deploying, make sure to:

1. Update the `site` field in `astro.config.js` with your production URL
2. Update `robots.txt` with your production sitemap URL
3. Configure environment variables (copy `.env.example` to `.env`)
4. Test your build locally: `npm run build && npm run preview`

---

## Vercel

### Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/yourrepo)

### Manual Deployment

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

3. Follow the prompts to configure your project

### Configuration

Vercel auto-detects Astro projects. No additional configuration needed.

**Environment Variables:**
- Add environment variables in the Vercel dashboard under Settings > Environment Variables
- Make sure to set `SITE_URL` to your production URL

**Build Settings (auto-detected):**
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

---

## Netlify

### Quick Deploy

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start)

### Manual Deployment

1. Install Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```

2. Build your project:
   ```bash
   npm run build
   ```

3. Deploy:
   ```bash
   netlify deploy --prod
   ```

### Configuration

Create a `netlify.toml` file in your project root:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/404.html"
  status = 404
```

**Environment Variables:**
- Add environment variables in Netlify dashboard under Site settings > Environment variables
- Set `SITE_URL` to your production URL

---

## Cloudflare Pages

### Deployment via Dashboard

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Go to Pages > Create a project
3. Connect your Git repository
4. Configure build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variables: Add your variables

### Deployment via Wrangler CLI

1. Install Wrangler:
   ```bash
   npm install -g wrangler
   ```

2. Build and deploy:
   ```bash
   npm run build
   wrangler pages deploy dist
   ```

---

## GitHub Pages

### Prerequisites

- Repository must be public (for free plan)
- Enable GitHub Pages in repository settings

### Using GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

**Update `astro.config.js`:**

```javascript
export default defineConfig({
  site: 'https://yourusername.github.io',
  base: '/your-repo-name', // Only if not using custom domain
  // ... rest of config
});
```

---

## AWS Amplify

### Deployment via Console

1. Log in to [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Click "New app" > "Host web app"
3. Connect your Git repository
4. Configure build settings:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

### Environment Variables

Add in Amplify Console > App settings > Environment variables:
- `SITE_URL`: Your production URL
- Any other custom environment variables

---

## Traditional Hosting

For traditional hosting (cPanel, shared hosting, VPS):

### 1. Build the Project Locally

```bash
npm run build
```

### 2. Upload Files

Upload the contents of the `dist/` directory to your web server:

**Via FTP/SFTP:**
- Upload all files from `dist/` to your `public_html` or `www` directory

**Via SSH:**
```bash
scp -r dist/* user@yourserver.com:/path/to/webroot/
```

### 3. Configure Server

**Apache (.htaccess):**

Create `.htaccess` in your web root:

```apache
# Enable gzip compression
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
</IfModule>

# Enable browser caching
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/jpg "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
  ExpiresByType text/css "access plus 1 month"
  ExpiresByType application/javascript "access plus 1 month"
</IfModule>

# Custom 404 page
ErrorDocument 404 /404.html
```

**Nginx:**

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /path/to/dist;
    index index.html;

    # Enable gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Custom 404
    error_page 404 /404.html;

    # Fallback to index.html for client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Docker

### Dockerfile

Create a `Dockerfile` in your project root:

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### nginx.conf

Create `nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server {
        listen 80;
        server_name localhost;
        root /usr/share/nginx/html;
        index index.html;

        gzip on;
        gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

        location / {
            try_files $uri $uri/ /index.html;
        }

        error_page 404 /404.html;
    }
}
```

### Build and Run

```bash
# Build the Docker image
docker build -t astro-app .

# Run the container
docker run -p 8080:80 astro-app
```

Visit `http://localhost:8080`

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  web:
    build: .
    ports:
      - "8080:80"
    environment:
      - SITE_URL=https://yourdomain.com
    restart: unless-stopped
```

Run with:
```bash
docker-compose up -d
```

---

## Post-Deployment Checklist

After deploying to any platform:

- [ ] Verify the site loads correctly
- [ ] Test all routes and pages
- [ ] Check responsive design on mobile devices
- [ ] Verify meta tags and SEO (use tools like [Meta Tags](https://metatags.io/))
- [ ] Test performance with [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [ ] Verify sitemap.xml is accessible at `/sitemap-index.xml`
- [ ] Check robots.txt is accessible at `/robots.txt`
- [ ] Test custom 404 page
- [ ] Verify environment variables are set correctly
- [ ] Set up analytics (if configured)
- [ ] Configure custom domain (if applicable)
- [ ] Enable HTTPS/SSL
- [ ] Set up monitoring/error tracking

---

## Troubleshooting

### Build Fails

1. Check Node.js version (should be 18 or higher):
   ```bash
   node --version
   ```

2. Clear cache and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. Check for TypeScript errors:
   ```bash
   npx tsc --noEmit
   ```

### 404 Errors on Refresh

This usually means the server isn't configured for client-side routing. See the server configuration sections above.

### Missing Environment Variables

Make sure all environment variables from `.env.example` are configured in your hosting platform's dashboard.

### Styles Not Loading

Check that your build output includes CSS files in the `_astro` directory and that your server is serving static assets correctly.

---

## Need Help?

- [Astro Deployment Docs](https://docs.astro.build/en/guides/deploy/)
- [Vercel Support](https://vercel.com/support)
- [Netlify Support](https://www.netlify.com/support/)
- [Cloudflare Support](https://support.cloudflare.com/)
