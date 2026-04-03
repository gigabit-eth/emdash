import type { PluginDescriptor } from "emdash";

export type SeoPluginOptions = {
  /** Default site name appended to page titles, e.g. "My Blog" → "Post Title | My Blog" */
  siteName?: string;
  /** Default Twitter/X card type */
  twitterCard?: "summary" | "summary_large_image";
  /** Default OG image URL used when content has no featured image */
  defaultOgImage?: string;
  /** Verify ownership with Google Search Console — paste the content value */
  googleVerification?: string;
  /** Bing Webmaster Tools verification meta content value */
  bingVerification?: string;
};

export function seoPlugin(options: SeoPluginOptions = {}): PluginDescriptor<SeoPluginOptions> {
  return {
    id: "emdash-seo",
    version: "1.0.0",
    format: "standard",
    entrypoint: "@emdash-plugin/seo/sandbox",
    options,
    capabilities: ["read:content"],
    storage: {
      // Per-content SEO overrides keyed by "collection/id"
      seoMeta: {
        indexes: ["contentKey", "updatedAt"],
      },
      // Global settings (single record, key = "global")
      seoSettings: {
        indexes: [],
      },
    },
    adminPages: [
      { path: "/seo", label: "SEO", icon: "search" },
      { path: "/seo/sitemap", label: "Sitemap", icon: "sitemap" },
    ],
    adminWidgets: [
      { id: "seo-score", title: "SEO Health", size: "half" },
    ],
  };
}
