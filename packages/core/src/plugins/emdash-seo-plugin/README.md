# @emdash-plugin/seo

A full-featured SEO plugin for [EmDash CMS](https://emdashcms.com). Drop it in and every piece of content gets a meta editor, Open Graph tags, Twitter Cards, structured data (JSON-LD), auto-generated sitemap, robots.txt, and a live SEO score.

## Features

- **Per-content meta editor** — custom title, description, OG image, canonical URL, noindex, JSON-LD
- **SEO score & suggestions** — keyword density, title/description length, missing fields
- **Open Graph + Twitter Cards** — auto-populated from content, fully overridable
- **Auto sitemap** (`/api/plugins/emdash-seo/sitemap`) — all published content, ready for Google Search Console
- **robots.txt** (`/api/plugins/emdash-seo/robots`) — auto-generated with your sitemap URL
- **Global settings** — site name, default OG image, verification codes for Google & Bing
- **SEO Health dashboard widget** — average score + issue count across all content
- **Sandboxed** — runs with only `read:content` capability; can't touch anything else

## Install

```bash
npm install @emdash-plugin/seo
```

```ts
// astro.config.mjs
import { seoPlugin } from "@emdash-plugin/seo";

export default defineConfig({
  integrations: [
    emdash({
      sandboxed: [
        seoPlugin({
          siteName: "My Blog",
          twitterCard: "summary_large_image",
          defaultOgImage: "https://myblog.com/og-default.png",
          googleVerification: "abc123",
        }),
      ],
    }),
  ],
});
```

## Using the Meta Tags in Your Astro Theme

Fetch resolved tags in any Astro page and render them in `<head>`:

```astro
---
// src/pages/[slug].astro
const { slug } = Astro.params;
const post = await getEmDashCollection("posts").find(p => p.slug === slug);

// Fetch resolved SEO tags from the plugin API
const seoRes = await fetch(
  `/_emdash/api/plugins/emdash-seo/meta?collection=posts&id=${post.id}`
);
const { tags } = await seoRes.json();
---

<html>
  <head>
    <title>{tags.title}</title>
    <meta name="description" content={tags.description} />
    <meta property="og:title" content={tags["og:title"]} />
    <meta property="og:description" content={tags["og:description"]} />
    <meta property="og:image" content={tags["og:image"]} />
    <meta name="twitter:card" content={tags["twitter:card"]} />
    <meta name="twitter:title" content={tags["twitter:title"]} />
    <meta name="twitter:description" content={tags["twitter:description"]} />
    <meta name="twitter:image" content={tags["twitter:image"]} />
    {tags.canonical && <link rel="canonical" href={tags.canonical} />}
    {tags.robots && <meta name="robots" content={tags.robots} />}
  </head>
  ...
</html>
```

## Admin UI

Navigate to **SEO** in the EmDash admin sidebar. From there you can:

1. Browse all content with SEO scores at a glance
2. Click any row to open the full meta editor
3. Switch to **Global Settings** to configure site-wide defaults
4. Switch to **Sitemap** for your sitemap URL to submit to search engines

## Plugin Options

| Option | Type | Default | Description |
|---|---|---|---|
| `siteName` | `string` | `""` | Appended to titles: `"Post Title \| My Blog"` |
| `twitterCard` | `"summary" \| "summary_large_image"` | `"summary_large_image"` | Default Twitter card type |
| `defaultOgImage` | `string` | `""` | Fallback OG image URL |
| `googleVerification` | `string` | `""` | Google Search Console verification code |
| `bingVerification` | `string` | `""` | Bing Webmaster Tools verification code |

## API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/_emdash/api/plugins/emdash-seo/meta?collection=X&id=Y` | Admin | Get resolved meta tags + SEO score |
| `POST` | `/_emdash/api/plugins/emdash-seo/meta/save` | Admin | Save per-content meta overrides |
| `GET` | `/_emdash/api/plugins/emdash-seo/sitemap` | Public | XML sitemap |
| `GET` | `/_emdash/api/plugins/emdash-seo/robots` | Public | robots.txt |

## Capabilities Requested

| Capability | Why |
|---|---|
| `read:content` | Read content title, excerpt, and slug to auto-populate defaults |

That's it. The plugin cannot write content, access user data, send email, or make network requests.

## License

MIT
