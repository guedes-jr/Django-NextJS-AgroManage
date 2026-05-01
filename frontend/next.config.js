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
};

module.exports = nextConfig;