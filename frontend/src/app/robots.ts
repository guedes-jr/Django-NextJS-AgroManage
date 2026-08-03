import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: ["/", "/recursos", "/planos", "/contato", "/termos", "/privacidade"], disallow: ["/home/", "/platform/", "/api/"] },
    ],
    sitemap: "/sitemap.xml",
  };
}
