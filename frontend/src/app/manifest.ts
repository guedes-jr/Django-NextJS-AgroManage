import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fazenda Mais",
    short_name: "Fazenda Mais",
    description: "Gestão completa da fazenda, produção, rebanhos, estoque e finanças.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7faf5",
    theme_color: "#176b3a",
    lang: "pt-BR",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/pwa-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
