/** @type {import('next').NextConfig} */
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

console.log("[NEXT CONFIG] Backend proxy:", backendUrl);

const nextConfig = {
  reactStrictMode: true,

  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "*.ngrok-free.dev",
    "retrace-epileptic-varsity.ngrok-free.dev",
  ],

  async redirects() {
    return [{
        // The public "Planos" page became "Assinatura" (keeps old links, ads and search results).
        source: "/planos",
        destination: "/assinatura",
        permanent: true,
      },
      {
        // The veterinary clinic was replaced by the "Área do veterinário".
        source: "/home/clinico/:path*",
        destination: "/home/veterinario",
        permanent: false,
      },
      {
        source: "/home/clinico",
        destination: "/home/veterinario",
        permanent: false,
      },
      {
      source: "/home/rebanho/:path*",
      destination: "/home/seguimento/:path*",
      permanent: true,
    }];
  },

  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*/`,
      },
      {
        source: "/media/:path*",
        destination: `${backendUrl}/media/:path*`,
      },
      {
        source: "/static/:path*",
        destination: `${backendUrl}/static/:path*`,
      },
    ];
  },
  async headers() {
    return [{
      source: "/login",
      headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
    }];
  },
};

module.exports = nextConfig;
