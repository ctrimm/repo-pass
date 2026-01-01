# Astro + React + shadcn/ui + Tailwind + TypeScript Template

A modern, feature-rich starter template combining the power of Astro with React components, shadcn/ui component library, Tailwind CSS styling, and TypeScript type safety.

> **Important**: This is a template repository. Do not push directly to this repository. Instead, use the "Use this template" button on GitHub to create a new repository based on this template. The template button can be found at the top of the repository page:

![Template Button Location](template-dropdown.png)

For more information about template repositories, see the [GitHub documentation](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository).

## Features

- ⚡️ **[Astro](https://astro.build/)** - A modern static site builder with exceptional performance
- ⚛️ **[React](https://reactjs.org/)** - UI component library integration
- 🎨 **[shadcn/ui](https://ui.shadcn.com/)** - Beautiful and accessible component library
- 🎯 **[TypeScript](https://www.typescriptlang.org/)** - Type safety and enhanced developer experience
- 🎨 **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- 📦 **Modern Stack** - Latest versions of all major dependencies
- 🚀 **Performance Focused** - Optimized for speed and efficiency
- 📱 **Responsive Design** - Mobile-first approach
- ✨ **Interactive Examples** - Includes demo components (like confetti effects!)
- 🔍 **SEO Optimized** - Built-in SEO component with meta tags, Open Graph, and Twitter Cards
- 🗺️ **Sitemap Generation** - Automatic sitemap.xml generation for better search engine indexing
- 🤖 **robots.txt** - Pre-configured robots.txt for search engine crawlers
- ❌ **Custom Error Pages** - Beautiful 404 page with navigation
- 🌍 **Deployment Ready** - Comprehensive guides for Vercel, Netlify, Cloudflare, and more

## Quick Start

1. Click the "Use this template" button above to create a new repository based on this template.

2. Clone your new repository:
```bash
git clone https://github.com/automatearmy/astro-react-shad-tailwind-template-repo.git
cd your-new-repo-name
```

3. Install dependencies:
```bash
npm install
```

4. Start the development server:
```bash
npm run dev
```

Visit `http://localhost:4321` to see your site!

## Configuration

### Environment Variables

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Update the values in `.env` with your configuration:
- `SITE_URL` - Your production URL (required for SEO)
- `SITE_NAME` - Your site name
- `SITE_DESCRIPTION` - Your site description
- Add any additional API keys or configuration as needed

### Site Configuration

Update `astro.config.js` with your production URL:

```javascript
export default defineConfig({
  site: 'https://yourdomain.com', // Update this!
  // ... rest of config
});
```

Update `public/robots.txt` with your sitemap URL:

```
Sitemap: https://yourdomain.com/sitemap-index.xml
```

## SEO Usage

This template includes a built-in SEO component that you can use on any page:

```astro
---
import Layout from '../layouts/main.astro';
---

<Layout
  title="Your Page Title"
  description="Your page description for search engines"
  image="/og-image.png"
  type="website"
>
  <!-- Your content -->
</Layout>
```

The SEO component automatically generates:
- Meta title and description
- Open Graph tags for social media
- Twitter Card tags
- Canonical URLs
- robots meta tags

## Available Commands

- `npm run dev` - Start development server
- `npm run build` - Build your production site
- `npm run preview` - Preview your build locally
- `npm run astro` - Run Astro commands

## Deployment

This template is ready to deploy to various platforms. See [DEPLOYMENT.md](./DEPLOYMENT.md) for comprehensive guides on deploying to:

- **Vercel** - One-click deployment with automatic preview URLs
- **Netlify** - Simple Git-based deployment
- **Cloudflare Pages** - Fast edge deployment
- **GitHub Pages** - Free hosting with GitHub Actions
- **AWS Amplify** - Scalable AWS infrastructure
- **Traditional Hosting** - Apache/Nginx configuration
- **Docker** - Containerized deployment

Quick deploy to Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/yourrepo)

## Project Structure

```
/
├── public/
│   ├── favicon.svg
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── ui/
│   │   │   └── button.tsx
│   │   └── SEO.astro
│   ├── layouts/
│   │   └── main.astro
│   ├── lib/
│   │   └── utils.ts
│   ├── pages/
│   │   ├── index.astro
│   │   ├── 404.astro
│   │   └── markdown-page.md
│   └── styles/
│       └── global.css
├── .env.example
├── astro.config.js
├── components.json
├── tailwind.config.mjs
├── tsconfig.json
├── DEPLOYMENT.md
└── README.md
```

## Dependencies

- Astro v5.16+ with MDX and React integrations
- React v19+ and React DOM
- Tailwind CSS v4+ with Vite plugin
- TypeScript with strict mode
- shadcn/ui components (Radix UI primitives)
- Sitemap generation (@astrojs/sitemap)
- Additional utilities like `clsx`, `tailwind-merge`, `class-variance-authority`, and `canvas-confetti`

## Adding More shadcn/ui Components

This template is configured with shadcn/ui. To add more components:

```bash
npx shadcn@latest add [component-name]
```

For example:
```bash
npx shadcn@latest add card
npx shadcn@latest add dialog
npx shadcn@latest add form
```

Available components: https://ui.shadcn.com/docs/components

## License

MIT License - feel free to use this template for your own projects!

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
