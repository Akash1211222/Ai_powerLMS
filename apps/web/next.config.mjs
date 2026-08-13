/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle so the runtime image only needs the
  // traced dependencies rather than the whole workspace node_modules.
  output: 'standalone',
  transpilePackages: ['@fca/shared', '@fca/ui'],
  eslint: {
    // Lint is run explicitly via `pnpm lint`; don't fail production builds on it.
    ignoreDuringBuilds: false,
  },
  async headers() {
    /**
     * Baseline security headers (§39).
     *
     * The CSP here is deliberately partial. `script-src` is the directive that
     * actually stops XSS, but Next inlines bootstrap scripts, so enforcing it
     * means issuing a per-request nonce through middleware — worth doing, and
     * too big to bolt on as a header.
     *
     * What is listed below needs no nonce and still closes real escalations:
     * an injected `<base>` tag silently repointing every relative URL, a form
     * rewritten to post credentials elsewhere, a plugin/object payload, and
     * framing of the app. Notably absent is `default-src`, which would also
     * apply to `frame-src` and break the code lab's sandboxed srcdoc preview.
     */
    const csp = [
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: csp },
          // Nothing in the LMS needs these; denying them means an injected
          // script cannot quietly ask for them either.
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(), microphone=(), camera=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
