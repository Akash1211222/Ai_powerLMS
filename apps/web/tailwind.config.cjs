const preset = require('@fca/config/tailwind/preset');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx}',
    // Scan the shared UI library so its Tailwind classes are generated.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};
