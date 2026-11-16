/** @type {import('next').NextConfig} */

// Two build modes:
// - Server (default, Docker): Next.js server that proxies /api and /uploads to NestJS.
// - Static (STATIC_EXPORT=1, GitHub Pages): plain HTML/CSS/JS in `out/`, content
//   read from api/content/studio.json at build time, served under BASE_PATH.
const STATIC = process.env.STATIC_EXPORT === '1';

// Where the Next.js server reaches the NestJS API (inside Docker: http://api:4000).
// Rewrites are fixed at build time, so this is passed as a Docker build argument.
const API = process.env.API_INTERNAL_URL || 'http://localhost:4000';

const staticConfig = {
  output: 'export',
  basePath: process.env.BASE_PATH || '',
  trailingSlash: true,
  images: { unoptimized: true },
};

const serverConfig = {
  output: 'standalone',

  // The browser only talks to this site; /api and /uploads are proxied to NestJS.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API}/api/:path*` },
      { source: '/uploads/:path*', destination: `${API}/uploads/:path*` },
    ];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  env: { NEXT_PUBLIC_STATIC_EXPORT: STATIC ? '1' : '' },
  ...(STATIC ? staticConfig : serverConfig),
};

export default nextConfig;
