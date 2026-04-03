import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeoMeta {
  contentKey: string;        // "collection/id"
  metaTitle?: string;        // custom <title> override
  metaDescription?: string;  // custom meta description
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;          // absolute URL
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
  noFollow?: boolean;
  structuredData?: string;   // raw JSON-LD string
  focusKeyword?: string;     // for readability analysis
  updatedAt: string;
}

interface SeoSettings {
  siteName: string;
  defaultOgImage: string;
  twitterCard: "summary" | "summary_large_image";
  googleVerification: string;
  bingVerification: string;
  robotsTxtExtra: string;    // appended to auto-generated robots.txt
}

interface ContentItem {
  id: string;
  title?: string;
  excerpt?: string;
  slug?: string;
  status?: string;
  collection?: string;
  featuredImage?: { url: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function contentKey(collection: string, id: string) {
  return `${collection}/${id}`;
}

/** Very lightweight keyword density + readability score (0–100). */
function analyzeSeo(
  title: string,
  description: string,
  keyword: string,
): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;

  // Title checks
  if (!title) { issues.push("Missing meta title"); score -= 20; }
  else if (title.length < 30) { issues.push("Meta title is too short (< 30 chars)"); score -= 10; }
  else if (title.length > 60) { issues.push("Meta title is too long (> 60 chars)"); score -= 5; }

  // Description checks
  if (!description) { issues.push("Missing meta description"); score -= 20; }
  else if (description.length < 70) { issues.push("Meta description is too short (< 70 chars)"); score -= 10; }
  else if (description.length > 160) { issues.push("Meta description is too long (> 160 chars)"); score -= 5; }

  // Keyword checks
  if (keyword) {
    const kw = keyword.toLowerCase();
    if (title && !title.toLowerCase().includes(kw)) {
      issues.push(`Focus keyword "${keyword}" not found in title`); score -= 10;
    }
    if (description && !description.toLowerCase().includes(kw)) {
      issues.push(`Focus keyword "${keyword}" not found in description`); score -= 5;
    }
  }

  return { score: Math.max(0, score), issues };
}

function scoreBadge(score: number): string {
  if (score >= 80) return "good";
  if (score >= 50) return "warning";
  return "error";
}

function buildMetaTags(
  content: ContentItem,
  meta: Partial<SeoMeta>,
  settings: Partial<SeoSettings>,
  pluginOptions: Record<string, unknown>,
): Record<string, string> {
  const siteName =
    (pluginOptions.siteName as string) || settings.siteName || "";
  const defaultOgImage =
    (pluginOptions.defaultOgImage as string) || settings.defaultOgImage || "";
  const twitterCard =
    (pluginOptions.twitterCard as string) ||
    settings.twitterCard ||
    "summary_large_image";

  const title =
    meta.metaTitle ||
    (siteName ? `${content.title} | ${siteName}` : content.title || "");
  const description = meta.metaDescription || content.excerpt || "";
  const ogImage =
    meta.ogImage || content.featuredImage?.url || defaultOgImage;

  return {
    title,
    description,
    "og:title": meta.ogTitle || title,
    "og:description": meta.ogDescription || description,
    "og:image": ogImage,
    "og:type": "article",
    "twitter:card": twitterCard,
    "twitter:title": meta.twitterTitle || title,
    "twitter:description": meta.twitterDescription || description,
    "twitter:image": meta.twitterImage || ogImage,
    ...(meta.canonicalUrl ? { canonical: meta.canonicalUrl } : {}),
    ...(meta.noIndex ? { robots: "noindex" } : {}),
    ...(settings.googleVerification
      ? { "google-site-verification": settings.googleVerification }
      : {}),
    ...(settings.bingVerification
      ? { "msvalidate.01": settings.bingVerification }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default definePlugin({
  hooks: {
    // ------------------------------------------------------------------
    // Auto-populate SEO meta from content title/excerpt on first save
    // ------------------------------------------------------------------
    "content:afterSave": {
      handler: async (event: any, ctx: PluginContext) => {
        const { collection, content } = event as {
          collection: string;
          content: ContentItem;
        };

        // Only process published content
        if (content.status !== "published") return;

        const key = contentKey(collection, content.id);
        const existing = await ctx.storage.seoMeta.get(key);

        // Only write defaults if there's no custom meta yet
        if (!existing) {
          const defaultMeta: SeoMeta = {
            contentKey: key,
            metaTitle: content.title || "",
            metaDescription: content.excerpt || "",
            focusKeyword: "",
            noIndex: false,
            noFollow: false,
            updatedAt: new Date().toISOString(),
          };
          await ctx.storage.seoMeta.put(key, defaultMeta);
          ctx.log.info(`[emdash-seo] initialised meta for ${key}`);
        }
      },
    },

    // ------------------------------------------------------------------
    // Remove orphaned SEO meta when content is deleted
    // ------------------------------------------------------------------
    "content:afterDelete": {
      handler: async (event: any, ctx: PluginContext) => {
        const { collection, contentId } = event as {
          collection: string;
          contentId: string;
        };
        const key = contentKey(collection, contentId);
        await ctx.storage.seoMeta.delete(key);
        ctx.log.info(`[emdash-seo] removed meta for ${key}`);
      },
    },

    // ------------------------------------------------------------------
    // Seed default settings on install
    // ------------------------------------------------------------------
    "plugin:install": {
      handler: async (_event: any, ctx: PluginContext) => {
        const defaults: SeoSettings = {
          siteName: "",
          defaultOgImage: "",
          twitterCard: "summary_large_image",
          googleVerification: "",
          bingVerification: "",
          robotsTxtExtra: "",
        };
        await ctx.storage.seoSettings.put("global", defaults);
        ctx.log.info("[emdash-seo] installed with default settings");
      },
    },
  },

  routes: {
    // ------------------------------------------------------------------
    // GET  /_emdash/api/plugins/emdash-seo/meta?collection=posts&id=abc
    // Returns resolved meta tags for a given piece of content
    // ------------------------------------------------------------------
    meta: {
      handler: async (routeCtx: any, ctx: PluginContext) => {
        const url = new URL(routeCtx.request.url);
        const collection = url.searchParams.get("collection") || "";
        const id = url.searchParams.get("id") || "";

        if (!collection || !id) {
          return { error: "collection and id are required" };
        }

        const key = contentKey(collection, id);
        const meta =
          (await ctx.storage.seoMeta.get(key)) as Partial<SeoMeta> | null;
        const settings =
          (await ctx.storage.seoSettings.get("global")) as Partial<SeoSettings> | null;

        // Fetch the actual content item so we can fall back to its fields
        let content: ContentItem = { id };
        if (ctx.content) {
          const result = await ctx.content.get(collection, id);
          if (result) content = result as ContentItem;
        }

        const tags = buildMetaTags(
          content,
          meta ?? {},
          settings ?? {},
          ctx.plugin as unknown as Record<string, unknown>,
        );

        const analysis = analyzeSeo(
          tags.title,
          tags.description,
          meta?.focusKeyword || "",
        );

        return {
          contentKey: key,
          tags,
          meta: meta ?? {},
          analysis,
        };
      },
    },

    // ------------------------------------------------------------------
    // PUT  /_emdash/api/plugins/emdash-seo/meta
    // Body: { collection, id, ...SeoMeta fields }
    // Save per-content SEO overrides
    // ------------------------------------------------------------------
    "meta/save": {
      handler: async (routeCtx: any, ctx: PluginContext) => {
        const {
          collection,
          id,
          ...fields
        } = routeCtx.input as { collection: string; id: string } & Partial<SeoMeta>;

        if (!collection || !id) {
          return { success: false, error: "collection and id are required" };
        }

        const key = contentKey(collection, id);
        const existing =
          ((await ctx.storage.seoMeta.get(key)) as Partial<SeoMeta>) ?? {};

        const updated: SeoMeta = {
          ...existing,
          ...fields,
          contentKey: key,
          updatedAt: new Date().toISOString(),
        } as SeoMeta;

        await ctx.storage.seoMeta.put(key, updated);
        return { success: true, meta: updated };
      },
    },

    // ------------------------------------------------------------------
    // GET  /_emdash/api/plugins/emdash-seo/sitemap
    // Returns a sitemap XML string of all published content
    // ------------------------------------------------------------------
    sitemap: {
      public: true,
      handler: async (routeCtx: any, ctx: PluginContext) => {
        const settings =
          (await ctx.storage.seoSettings.get("global")) as Partial<SeoSettings> | null;

        if (!ctx.content) {
          return new Response("<urlset/>", {
            headers: { "Content-Type": "application/xml" },
          });
        }

        // Fetch all published posts (extend to other collections as needed)
        const result = await ctx.content.list("posts", {
          limit: 1000,
        });
        const posts = result.items;

        const url = new URL(routeCtx.request.url);
        const baseUrl = `${url.protocol}//${url.host}`;

        const urlTags = posts
          .filter((p: any) => p.status === "published") // filter in-memory as list() doesn't support filter
          .map((p: any) => {
            const loc = `${baseUrl}/${p.slug || p.id}`;
            return `  <url><loc>${loc}</loc><lastmod>${p.updatedAt || p.createdAt || ""}</lastmod></url>`;
          })
          .join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlTags}
</urlset>`;

        return new Response(xml, {
          headers: { "Content-Type": "application/xml" },
        });
      },
    },

    // ------------------------------------------------------------------
    // GET  /_emdash/api/plugins/emdash-seo/robots
    // Returns a robots.txt
    // ------------------------------------------------------------------
    robots: {
      public: true,
      handler: async (routeCtx: any, ctx: PluginContext) => {
        const settings =
          (await ctx.storage.seoSettings.get("global")) as Partial<SeoSettings> | null;

        const url = new URL(routeCtx.request.url);
        const baseUrl = `${url.protocol}//${url.host}`;

        const lines = [
          "User-agent: *",
          "Allow: /",
          `Sitemap: ${baseUrl}/_emdash/api/plugins/emdash-seo/sitemap`,
          "",
          settings?.robotsTxtExtra || "",
        ].join("\n");

        return new Response(lines.trim(), {
          headers: { "Content-Type": "text/plain" },
        });
      },
    },

    // ------------------------------------------------------------------
    // Block Kit admin handler — powers the /seo admin page and dashboard
    // widget via a single route following EmDash convention
    // ------------------------------------------------------------------
    admin: {
      handler: async (routeCtx: any, ctx: PluginContext) => {
        const interaction = routeCtx.input as {
          type: string;
          page?: string;
          widgetId?: string;
          action?: string;
          values?: Record<string, unknown>;
        };

        // ---- Dashboard widget: SEO Health ----
        if (
          interaction.type === "widget_load" &&
          interaction.widgetId === "seo-score"
        ) {
          // Sample the last 50 published items and average their scores
          let avgScore = 0;
          let issueCount = 0;
          let checkedCount = 0;

          const allMeta = await ctx.storage.seoMeta.query({ limit: 50 });
          for (const item of allMeta.items) {
            const m = item.data as SeoMeta;
            const { score, issues } = analyzeSeo(
              m.metaTitle || "",
              m.metaDescription || "",
              m.focusKeyword || "",
            );
            avgScore += score;
            issueCount += issues.length;
            checkedCount++;
          }

          const finalScore =
            checkedCount > 0 ? Math.round(avgScore / checkedCount) : 0;

          return {
            blocks: [
              {
                type: "stat",
                label: "Average SEO Score",
                value: `${finalScore}/100`,
                badge: scoreBadge(finalScore),
              },
              {
                type: "stat",
                label: "Pages Analysed",
                value: String(checkedCount),
              },
              {
                type: "stat",
                label: "Total Issues",
                value: String(issueCount),
                badge: issueCount > 0 ? "warning" : "good",
              },
              {
                type: "button",
                label: "View Full SEO Report",
                action: "navigate",
                value: "/seo",
              },
            ],
          };
        }

        // ---- Admin page: /seo (content list with scores) ----
        if (
          interaction.type === "page_load" &&
          interaction.page === "/seo"
        ) {
          const allMeta = await ctx.storage.seoMeta.query({
            orderBy: { updatedAt: "desc" },
            limit: 100,
          });

          const rows = allMeta.items.map((item: any) => {
            const m = item.data as SeoMeta;
            const { score, issues } = analyzeSeo(
              m.metaTitle || "",
              m.metaDescription || "",
              m.focusKeyword || "",
            );
            return {
              contentKey: m.contentKey,
              metaTitle: m.metaTitle || "(not set)",
              focusKeyword: m.focusKeyword || "—",
              score: `${score}/100`,
              scoreBadge: scoreBadge(score),
              issues: issues.length,
              noIndex: m.noIndex ? "Yes" : "No",
              updatedAt: m.updatedAt,
            };
          });

          return {
            blocks: [
              { type: "header", text: "SEO Manager" },
              { type: "text", text: "Edit per-content meta, review scores, and manage global settings." },
              {
                type: "tabs",
                tabs: [
                  { id: "content", label: "Content" },
                  { id: "settings", label: "Global Settings" },
                  { id: "sitemap", label: "Sitemap" },
                ],
                activeTab: "content",
              },
              {
                type: "table",
                blockId: "seo-table",
                columns: [
                  { key: "contentKey", label: "Content", format: "text" },
                  { key: "metaTitle", label: "Meta Title", format: "text" },
                  { key: "focusKeyword", label: "Keyword", format: "text" },
                  { key: "score", label: "Score", format: "badge", badgeKey: "scoreBadge" },
                  { key: "issues", label: "Issues", format: "number" },
                  { key: "noIndex", label: "No Index", format: "text" },
                  { key: "updatedAt", label: "Updated", format: "relative_time" },
                ],
                rows,
                rowAction: { action: "edit_seo", keyField: "contentKey" },
              },
            ],
          };
        }

        // ---- Admin page: /seo/sitemap ----
        if (
          interaction.type === "page_load" &&
          interaction.page === "/seo/sitemap"
        ) {
          return {
            blocks: [
              { type: "header", text: "Sitemap" },
              {
                type: "text",
                text: "Your sitemap is auto-generated from all published content. Submit it to Google Search Console and Bing Webmaster Tools.",
              },
              {
                type: "code",
                language: "text",
                value: "/_emdash/api/plugins/emdash-seo/sitemap",
              },
              {
                type: "button",
                label: "Preview Sitemap XML",
                action: "open_url",
                value: "/_emdash/api/plugins/emdash-seo/sitemap",
              },
              {
                type: "button",
                label: "Preview robots.txt",
                action: "open_url",
                value: "/_emdash/api/plugins/emdash-seo/robots",
              },
            ],
          };
        }

        // ---- Edit SEO for a specific content item ----
        if (interaction.type === "action" && interaction.action === "edit_seo") {
          const key = interaction.values?.contentKey as string;
          const meta =
            ((await ctx.storage.seoMeta.get(key)) as Partial<SeoMeta>) ?? {};
          const [collection, id] = key.split("/");

          return {
            blocks: [
              { type: "header", text: `Edit SEO — ${key}` },
              {
                type: "form",
                formId: "edit-seo-form",
                submitAction: "save_seo",
                fields: [
                  { key: "collection", type: "hidden", value: collection },
                  { key: "id", type: "hidden", value: id },
                  {
                    key: "focusKeyword",
                    label: "Focus Keyword",
                    type: "text",
                    value: meta.focusKeyword || "",
                    hint: "Primary keyword you want this page to rank for",
                  },
                  {
                    key: "metaTitle",
                    label: "Meta Title",
                    type: "text",
                    value: meta.metaTitle || "",
                    hint: "Ideal length: 30–60 characters",
                    maxLength: 60,
                    showCount: true,
                  },
                  {
                    key: "metaDescription",
                    label: "Meta Description",
                    type: "textarea",
                    value: meta.metaDescription || "",
                    hint: "Ideal length: 70–160 characters",
                    maxLength: 160,
                    showCount: true,
                  },
                  {
                    key: "ogImage",
                    label: "OG Image URL",
                    type: "url",
                    value: meta.ogImage || "",
                    hint: "Used for Facebook, LinkedIn, Slack previews",
                  },
                  {
                    key: "canonicalUrl",
                    label: "Canonical URL",
                    type: "url",
                    value: meta.canonicalUrl || "",
                    hint: "Leave blank to use the default URL",
                  },
                  {
                    key: "noIndex",
                    label: "Hide from search engines (noindex)",
                    type: "checkbox",
                    value: meta.noIndex ? "true" : "false",
                  },
                  {
                    key: "structuredData",
                    label: "Structured Data (JSON-LD)",
                    type: "code",
                    language: "json",
                    value: meta.structuredData || "",
                    hint: "Advanced: paste a full JSON-LD schema block",
                  },
                ],
                submitLabel: "Save SEO",
              },
            ],
          };
        }

        // ---- Save SEO form submission ----
        if (interaction.type === "action" && interaction.action === "save_seo") {
          const vals = interaction.values as Record<string, string>;
          const key = contentKey(vals.collection, vals.id);

          const updated: Partial<SeoMeta> = {
            focusKeyword: vals.focusKeyword,
            metaTitle: vals.metaTitle,
            metaDescription: vals.metaDescription,
            ogImage: vals.ogImage,
            canonicalUrl: vals.canonicalUrl,
            noIndex: vals.noIndex === "true",
            structuredData: vals.structuredData,
          };

          const existing =
            ((await ctx.storage.seoMeta.get(key)) as Partial<SeoMeta>) ?? {};
          await ctx.storage.seoMeta.put(key, {
            ...existing,
            ...updated,
            contentKey: key,
            updatedAt: new Date().toISOString(),
          });

          const { score, issues } = analyzeSeo(
            vals.metaTitle,
            vals.metaDescription,
            vals.focusKeyword,
          );

          return {
            blocks: [
              {
                type: "alert",
                variant: "success",
                text: `SEO saved. Score: ${score}/100`,
              },
              ...(issues.length > 0
                ? [
                    {
                      type: "list",
                      variant: "warning",
                      items: issues,
                      title: "Suggestions",
                    },
                  ]
                : []),
              {
                type: "button",
                label: "← Back to SEO Manager",
                action: "navigate",
                value: "/seo",
              },
            ],
          };
        }

        // ---- Global settings form ----
        if (
          interaction.type === "action" &&
          interaction.action === "open_settings"
        ) {
          const settings =
            ((await ctx.storage.seoSettings.get("global")) as Partial<SeoSettings>) ??
            {};

          return {
            blocks: [
              { type: "header", text: "Global SEO Settings" },
              {
                type: "form",
                formId: "global-settings-form",
                submitAction: "save_settings",
                fields: [
                  {
                    key: "siteName",
                    label: "Site Name",
                    type: "text",
                    value: settings.siteName || "",
                    hint: "Appended to all page titles, e.g. Post Title | Site Name",
                  },
                  {
                    key: "defaultOgImage",
                    label: "Default OG Image URL",
                    type: "url",
                    value: settings.defaultOgImage || "",
                    hint: "Fallback image when content has no featured image",
                  },
                  {
                    key: "twitterCard",
                    label: "Twitter Card Type",
                    type: "select",
                    value: settings.twitterCard || "summary_large_image",
                    options: [
                      { value: "summary_large_image", label: "Summary with Large Image" },
                      { value: "summary", label: "Summary" },
                    ],
                  },
                  {
                    key: "googleVerification",
                    label: "Google Search Console Verification",
                    type: "text",
                    value: settings.googleVerification || "",
                    hint: "Paste the 'content' value from the meta tag Google provides",
                  },
                  {
                    key: "bingVerification",
                    label: "Bing Webmaster Verification",
                    type: "text",
                    value: settings.bingVerification || "",
                  },
                  {
                    key: "robotsTxtExtra",
                    label: "Extra robots.txt Rules",
                    type: "textarea",
                    value: settings.robotsTxtExtra || "",
                    hint: "Appended to the auto-generated robots.txt",
                  },
                ],
                submitLabel: "Save Settings",
              },
            ],
          };
        }

        // ---- Save global settings ----
        if (
          interaction.type === "action" &&
          interaction.action === "save_settings"
        ) {
          const vals = interaction.values as Partial<SeoSettings>;
          await ctx.storage.seoSettings.put("global", {
            siteName: vals.siteName || "",
            defaultOgImage: vals.defaultOgImage || "",
            twitterCard: vals.twitterCard || "summary_large_image",
            googleVerification: vals.googleVerification || "",
            bingVerification: vals.bingVerification || "",
            robotsTxtExtra: vals.robotsTxtExtra || "",
          });

          return {
            blocks: [
              {
                type: "alert",
                variant: "success",
                text: "Global SEO settings saved.",
              },
            ],
          };
        }

        return { blocks: [] };
      },
    },
  },
});
