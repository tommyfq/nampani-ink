// POS + Admin app. The browser calls /api on this app; Next.js forwards it to the API,
// so the login cookie stays first-party and no CORS is needed.
const API = process.env.API_INTERNAL_URL || 'http://localhost:4000';

const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Caddy compresses responses; compressing here too would buffer the live event stream.
  compress: false,
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API}/api/:path*` },
      { source: '/uploads/:path*', destination: `${API}/uploads/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
