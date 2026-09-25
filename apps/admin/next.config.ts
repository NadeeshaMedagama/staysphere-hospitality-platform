import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Emits a minimal self-contained server for the container image; Vercel
  // ignores this and uses its own build output.
  output: 'standalone',
  poweredByHeader: false,
  transpilePackages: ['@staysphere/contracts', '@staysphere/ui', '@staysphere/app-core'],
  // Fails the build on a link to a route that does not exist.
  typedRoutes: true,
  // Linting is a dedicated CI job over the whole workspace; running Next's
  // own pass here would duplicate it with a different config.
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
