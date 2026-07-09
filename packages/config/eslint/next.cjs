/**
 * Shared ESLint config for the Next.js web app.
 * `next/core-web-vitals` already provides the TypeScript parser + plugin and
 * sensible unused-vars handling; we only layer `prettier` on top.
 */
module.exports = {
  root: true,
  extends: ['next/core-web-vitals', 'prettier'],
  ignorePatterns: ['.next', 'node_modules', 'dist', '*.cjs'],
};
