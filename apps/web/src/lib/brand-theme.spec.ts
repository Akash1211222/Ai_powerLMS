import { describe, it, expect } from 'vitest';
import { brandTokens, brandCss, parseHex, contrast } from './brand-theme';

/**
 * A college gives us one colour and we have to make it work on a near-white
 * page and a near-black one. Used as given it fails half the time — a deep
 * maroon vanishes on the dark theme, a bright yellow on the light one — so
 * these tests check the thing that actually matters: can you read the link.
 */

const LIGHT_BG = parseHex('#f5f8fd')!;
const DARK_BG = parseHex('#070e1c')!;

/** Colours a real college might hand over, including the awkward ends. */
const BRANDS = {
  'navy (typical)': '#1e3a8a',
  'maroon (very dark)': '#4a0e1a',
  'yellow (very light)': '#facc15',
  'bright green': '#22c55e',
  'near-black': '#111111',
  'near-white': '#fafafa',
  'mid grey': '#808080',
  shorthand: '#c33',
};

describe('accents stay readable on both grounds', () => {
  for (const [label, colour] of Object.entries(BRANDS)) {
    it(`${label} clears AA in light and dark`, () => {
      const tokens = brandTokens(colour)!;
      expect(tokens).toBeTruthy();

      const light = parseHex(tokens.light['--fca-link']!)!;
      const dark = parseHex(tokens.dark['--fca-link']!)!;

      // 4.5:1 is the readable-text threshold. Links are text.
      expect(contrast(light, LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark, DARK_BG)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('keeps the college’s hue rather than picking its own colour', () => {
    // The point of branding: navy should still look navy, not "our blue".
    const navy = brandTokens('#1e3a8a')!;
    const green = brandTokens('#22c55e')!;
    expect(navy.light['--fca-link']).not.toBe(green.light['--fca-link']);
    expect(navy.light['--fca-chip']).toContain('hsl(');
  });

  it('gives a dark colour a lighter treatment in dark mode', () => {
    // The failure this prevents: a maroon link on a near-black page.
    const t = brandTokens('#4a0e1a')!;
    const light = parseHex(t.light['--fca-link']!)!;
    const dark = parseHex(t.dark['--fca-link']!)!;
    const sum = (c: { r: number; g: number; b: number }) => c.r + c.g + c.b;
    expect(sum(dark)).toBeGreaterThan(sum(light));
  });
});

describe('what it refuses', () => {
  it('ignores anything that is not a hex colour', () => {
    // The value comes from a customer. It ends up inside a stylesheet, so
    // nothing but a colour may pass.
    for (const bad of [
      'red',
      'rgb(1,2,3)',
      '#12345',
      'javascript:alert(1)',
      '</style><script>',
      '#ggg',
      '',
      '   ',
    ]) {
      expect(brandTokens(bad)).toBeNull();
      expect(brandCss(bad)).toBeNull();
    }
  });

  it('treats a missing colour as no branding at all', () => {
    expect(brandTokens(null)).toBeNull();
    expect(brandTokens(undefined)).toBeNull();
    expect(brandCss(null)).toBeNull();
  });
});

describe('the stylesheet it produces', () => {
  it('themes both light and dark in one block', () => {
    const css = brandCss('#1e3a8a')!;
    expect(css).toMatch(/^:root\{/);
    expect(css).toContain('.dark{');
    expect(css).toContain('--fca-link:');
  });

  it('emits nothing that could close the style tag', () => {
    // Belt and braces: the input is already restricted to hex, but this is the
    // assertion that would fail loudly if that ever loosened.
    const css = brandCss('#c33')!;
    expect(css).not.toMatch(/[<>]/);
  });
});
