import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://agromanage.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/recursos", "/planos", "/contato", "/termos", "/privacidade"].map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" as const : "monthly" as const,
    priority: path === "" ? 1 : 0.7,
  }));
}
