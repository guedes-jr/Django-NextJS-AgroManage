import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    allowedDevOrigins: ["192.168.1.64"],
  },

};

export default nextConfig;
