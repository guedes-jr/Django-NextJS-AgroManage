/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  allowedDevOrigins: [
    '192.168.1.64',
    'retrace-epileptic-varsity.ngrok-free.dev',
  ],

  async rewrites() {
    // Determinar URL do backend
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';

    return [
      // 🔹 API - Proxy reverso para o backend
      {
        source: '/api/v1/:path*',
        destination: `${backendUrl}/api/v1/:path*`,
      },

      // 🔹 MEDIA - Servir imagens/arquivos do Django
      {
        source: '/media/:path*',
        destination: `${backendUrl}/media/:path*`,
      },

      // 🔹 STATIC - Arquivos estáticos do Django (opcional)
      {
        source: '/static/:path*',
        destination: `${backendUrl}/static/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;