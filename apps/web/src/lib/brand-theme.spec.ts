import { describe, it, expect } from 'vitest';
import { brandTokens, brandCss, parseHex, contrast } from './brand-theme';

/**
 * A college gives us one colour and we have to make it work on a near-white
 * page and a near-black one. Used as given it fails half the time — a deep
 * maroon vanishes on the dark theme, a bright yellow on the light one — so
 * these tests check the thing that actually matters: can you read the link.
 */

/**
 * The ground each link actually sits on.
 *
 * The page background is now derived from the college's colour too, so
 * measuring against the platform's old fixed navy would be checking a
 * contrast the browser never renders. Read it back out of the tokens instead.
 */
const groundOf = (value: string) => {
  const [r = 0, g = 0, b = 0] = value
    .replace(/^rgb\(|\)$/g, '')
    .trim()
    .split(/\s+/)
    .map(Number);
  return { r, g, b };
};

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
      expect(contrast(light, groundOf(tokens.light['--fca-bg']!))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark, groundOf(tokens.dark['--fca-bg']!))).toBeGreaterThanOrEqual(4.5);
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

describe('the whole palette, not just the highlights', () => {
  const t = brandTokens('#4a0e1a')!;

  it('repaints the brand and call-to-action scales', () => {
    // These are what `bg-brand-500` and the CTA buttons read through. Leaving
    // them on the platform's blue and orange is what made a branded college
    // look like a tint applied to somebody else's product.
    expect(t.light['--fca-brand-500']).toBeTruthy();
    expect(t.light['--fca-accent-500']).toBeTruthy();
    expect(t.dark['--fca-brand-500']).toBe(t.light['--fca-brand-500']);
  });

  it('emits the ramps as channels, so opacity utilities keep working', () => {
    // `bg-brand-400/15` compiles to rgb(var(--fca-brand-400) / 0.15); a hex
    // here would silently produce no background at all.
    expect(t.light['--fca-brand-400']).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
    expect(t.light['--fca-accent-500']).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
  });

  it('tints the page itself', () => {
    const plainLight = groundOf(brandTokens('#808080')!.light['--fca-bg']!);
    const maroonLight = groundOf(t.light['--fca-bg']!);
    expect(maroonLight).not.toEqual(plainLight);
  });

  it('keeps the page light in light mode and dark in dark mode', () => {
    // The tint moves the hue, never the lightness — otherwise a dark brand
    // would turn the light theme into a second dark one.
    for (const colour of ['#4a0e1a', '#facc15', '#111111', '#fafafa']) {
      const tokens = brandTokens(colour)!;
      const light = groundOf(tokens.light['--fca-bg']!);
      const dark = groundOf(tokens.dark['--fca-bg']!);
      expect(light.r + light.g + light.b, `${colour} light bg`).toBeGreaterThan(690);
      expect(dark.r + dark.g + dark.b, `${colour} dark bg`).toBeLessThan(120);
    }
  });

  it('keeps body text readable on the tinted page', () => {
    // Ink and background both move now, so the pair has to be checked together
    // rather than either alone.
    for (const colour of Object.values(BRANDS)) {
      const tokens = brandTokens(colour)!;
      for (const theme of ['light', 'dark'] as const) {
        const ink = groundOf(tokens[theme]['--fca-ink']!);
        const bg = groundOf(tokens[theme]['--fca-bg']!);
        expect(contrast(ink, bg), `${colour} ${theme}`).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it('gives the button a colour of its own without leaving the family', () => {
    // Identical to the brand and the CTA stops standing out; opposite it, and
    // a maroon college gets green buttons.
    expect(t.light['--fca-accent-500']).not.toBe(t.light['--fca-brand-500']);
  });
});
