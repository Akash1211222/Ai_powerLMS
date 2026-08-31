/**
 * Turns one brand colour into accents that stay readable on both grounds.
 *
 * A college gives us a single colour. Used as-is it fails half the time: a deep
 * maroon is invisible on the dark theme, a bright yellow is invisible on the
 * light one. So the hue is kept — that is what makes it theirs — and the
 * lightness is moved into a band that clears contrast against each background.
 *
 * Only a handful of tokens move. The rest of the palette stays ours, which is
 * what keeps a branded LMS looking like a product rather than a customer's
 * stylesheet.
 */

/** Page backgrounds these accents have to survive, from globals.css. */
const LIGHT_BG = { r: 0xf5, g: 0xf8, b: 0xfd };
const DARK_BG = { r: 0x07, g: 0x0e, b: 0x1c };

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Accepts #rgb and #rrggbb. Anything else is not a colour we will paint with. */
export function parseHex(input: string): Rgb | null {
  const hex = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function toHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const hn = h / 360;
  return {
    r: Math.round(f(hn + 1 / 3) * 255),
    g: Math.round(f(hn) * 255),
    b: Math.round(f(hn - 1 / 3) * 255),
  };
}

const channel = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance. */
function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours, 1–21. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const hex = ({ r, g, b }: Rgb) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/**
 * Walks the lightness towards whichever end clears the target contrast.
 *
 * Clamping to a fixed band is not enough: 4.5:1 against near-white needs a much
 * darker colour for yellow than for blue, because contrast follows luminance,
 * not lightness.
 */
function readable(h: number, s: number, l: number, bg: Rgb, target: number, towards: 0 | 1): Rgb {
  let best = hslToRgb(h, s, l);
  if (contrast(best, bg) >= target) return best;
  for (let step = 1; step <= 100; step++) {
    const next = towards === 1 ? Math.min(1, l + step / 100) : Math.max(0, l - step / 100);
    best = hslToRgb(h, s, next);
    if (contrast(best, bg) >= target) return best;
  }
  return best;
}

export interface BrandTokens {
  light: Record<string, string>;
  dark: Record<string, string>;
}

/**
 * The shape of the platform's own ramps, as saturation and lightness per stop.
 *
 * Taken from the blue and orange scales the product ships with, which were
 * tuned by eye — a college's colour is dropped into this shape rather than a
 * ramp being generated from scratch, so their palette inherits work that has
 * already been done rather than coming out evenly-spaced and lifeless.
 */
const BRAND_SHAPE: Array<[stop: number, s: number, l: number]> = [
  [50, 1.0, 0.97],
  [100, 0.94, 0.93],
  [200, 0.93, 0.87],
  [300, 0.93, 0.78],
  [400, 0.93, 0.68],
  [500, 0.83, 0.53],
  [600, 0.76, 0.48],
  [700, 0.81, 0.44],
  [800, 0.64, 0.33],
  [900, 0.6, 0.15],
];

const ACCENT_SHAPE: Array<[stop: number, s: number, l: number]> = [
  [50, 1.0, 0.96],
  [100, 1.0, 0.92],
  [300, 0.97, 0.72],
  [400, 0.96, 0.61],
  [500, 0.95, 0.53],
  [600, 0.9, 0.48],
  [700, 0.88, 0.4],
];

/**
 * How far the call-to-action hue sits from the brand hue.
 *
 * The platform's own palette puts them almost opposite — a blue product with
 * orange buttons. Applying that split to a customer's colour would hand a
 * maroon college green buttons, which is not what "our colour" means to
 * anybody. A short step keeps the button a sibling of the brand: clearly the
 * same family, still distinct enough to be the thing you press.
 */
const ACCENT_HUE_SHIFT = 24;

const channels = ({ r, g, b }: Rgb) => `${r} ${g} ${b}`;

function ramp(
  name: string,
  shape: Array<[number, number, number]>,
  h: number,
  saturation: number,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [stop, s, l] of shape) {
    // The college's own saturation scales the shape's, so a muted brand stays
    // muted across the whole ramp instead of being forced bright.
    out[`--fca-${name}-${stop}`] = channels(hslToRgb(h, Math.min(1, s * saturation), l));
  }
  return out;
}

/** A surface: the hue at a fixed lightness, barely saturated. */
const surface = (h: number, s: number, l: number, tint: number) =>
  channels(hslToRgb(h, Math.min(s, tint), l));

/** Text-sized accents need AA. */
const TEXT_CONTRAST = 4.5;

export function brandTokens(input: string | null | undefined): BrandTokens | null {
  if (!input) return null;
  const rgb = parseHex(input);
  if (!rgb) return null;

  const { h, s: rawS, l } = toHsl(rgb);
  // A near-grey brand colour stays near-grey; forcing saturation onto it would
  // invent a colour the college did not choose.
  const s = Math.max(rawS, rawS > 0.05 ? 0.35 : rawS);

  // Relative to the platform's own blue, whose 500 sits at 83% saturation.
  const saturation = s / 0.83;
  const accentHue = (h + ACCENT_HUE_SHIFT) % 360;

  const ramps = {
    ...ramp('brand', BRAND_SHAPE, h, saturation),
    ...ramp('accent', ACCENT_SHAPE, accentHue, saturation),
    // The secondary cool accent trails the brand the other way, so the three
    // scales read as one family fanned out rather than three decisions.
    ...ramp('aqua', ACCENT_SHAPE, (h - ACCENT_HUE_SHIFT + 360) % 360, saturation),
  };

  // The page itself. A wash of the college's hue rather than a flat neutral —
  // this is the largest area on screen, and leaving it grey is what made
  // branding read as a tint on somebody else's product. The lightness is
  // pinned, so the tint can never darken the page into unreadability; only the
  // hue moves.
  const lightBg = { h, l: 0.975, tint: 0.55 };
  const darkBg = { h, l: 0.055, tint: 0.45 };

  const lightLink = readable(h, s, l, hslToRgb(h, Math.min(s, lightBg.tint), lightBg.l), TEXT_CONTRAST, 0);
  const darkLink = readable(h, s, l, hslToRgb(h, Math.min(s, darkBg.tint), darkBg.l), TEXT_CONTRAST, 1);

  const wash = (a: number) => `hsl(${h.toFixed(0)} ${Math.round(s * 100)}% 55% / ${a})`;

  return {
    light: {
      ...ramps,
      '--fca-bg': `rgb(${surface(h, s, lightBg.l, lightBg.tint)})`,
      '--fca-panel': `hsl(${h.toFixed(0)} ${Math.round(Math.min(s, 0.5) * 100)}% 99% / 0.92)`,
      '--fca-card': `hsl(${h.toFixed(0)} ${Math.round(Math.min(s, 0.5) * 100)}% 100% / 0.96)`,
      // Ink and hairlines carry the hue too, but only just — text is read, not
      // admired, and a strongly coloured body copy is tiring before it is
      // branded.
      '--fca-ink': `rgb(${surface(h, s, 0.14, 0.62)})`,
      '--fca-faint': `rgb(${surface(h, s, 0.4, 0.28)})`,
      '--fca-hair': `rgb(${surface(h, s, 0.9, 0.5)})`,
      '--fca-link': hex(lightLink),
      '--fca-chip': wash(0.1),
      '--fca-soft': wash(0.06),
      '--fca-track': wash(0.14),
    },
    dark: {
      ...ramps,
      '--fca-bg': `rgb(${surface(h, s, darkBg.l, darkBg.tint)})`,
      '--fca-panel': `hsl(${h.toFixed(0)} ${Math.round(Math.min(s, 0.45) * 100)}% 17% / 0.94)`,
      '--fca-card': `hsl(${h.toFixed(0)} ${Math.round(Math.min(s, 0.45) * 100)}% 20% / 0.96)`,
      '--fca-ink': `rgb(${surface(h, s, 0.97, 0.5)})`,
      '--fca-faint': `rgb(${surface(h, s, 0.84, 0.3)})`,
      '--fca-hair': `hsl(${h.toFixed(0)} ${Math.round(Math.min(s, 0.6) * 100)}% 70% / 0.22)`,
      '--fca-link': hex(darkLink),
      '--fca-chip': wash(0.2),
      '--fca-soft': wash(0.12),
      '--fca-track': wash(0.24),
    },
  };
}

/** The tokens as a stylesheet the shell can drop into the page. */
export function brandCss(input: string | null | undefined): string | null {
  const tokens = brandTokens(input);
  if (!tokens) return null;
  const block = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([k, v]) => `${k}:${v};`)
      .join('');
  return `:root{${block(tokens.light)}}.dark{${block(tokens.dark)}}`;
}
