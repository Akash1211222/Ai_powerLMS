/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@fca/shared', '@fca/ui'],
  eslint: {
    // Lint is run explicitly via `pnpm lint`; don't fail production builds on it.
    ignoreDuringBuilds: false,
  },
  async headers() {
    // Baseline security headers (§39). CSP is tightened in a later milestone
    // once the full asset origin set is known.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
