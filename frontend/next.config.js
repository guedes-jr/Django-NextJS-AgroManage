/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  httpAgent: {
    keepAlive: true,
  },
};

module.exports = nextConfig;