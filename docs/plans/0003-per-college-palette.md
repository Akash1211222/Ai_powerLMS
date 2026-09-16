# Plan 0003 — Give a college the whole palette, not a tint

- Status: **Delivered** (`d0e7620`, deployed 2026-08-31)

## Context

Branding reached four tokens — `--fca-link`, `--fca-chip`, `--fca-soft`,
`--fca-track`. Everything with real area on the page stayed ours: blue hero,
orange buttons, blue badges, all written as hex in the Tailwind preset. A branded
college looked like our product with their colour dabbed on the links.

## Decisions taken

- Everything derives from the college's **one** colour — buttons, badges,
  gradients, links.
- Surfaces take the hue too, **lightly**, with contrast preserved.

## Approach

The `brand-*` and `accent-*` ramps became CSS variables. That is the whole lever:
ninety-odd files keep their `bg-brand-500` and `bg-grad-brand` classes and follow
the college without being touched.

Channel triplets (`96 165 250`) rather than hex, because `bg-brand-400/15` has to
keep composing opacity — Tailwind substitutes into `<alpha-value>`, which a
`var()` holding `#60a5fa` cannot accept.

A college's hex is dropped into the *shape* of the ramps already tuned by eye
(`BRAND_SHAPE`, `ACCENT_SHAPE`), so their palette inherits that work rather than
coming out evenly-spaced and lifeless. The CTA sits a short hue-step off the
brand (`ACCENT_HUE_SHIFT = 24`): applying our own blue/orange split would hand a
maroon college green buttons.

Surfaces take the hue but **lightness is pinned**, so no colour a college picks
can turn the light theme into a second dark one, and body text clears 7:1 against
the tinted page for every awkward brand in the test set.

Deliberately left alone: `grad-mint`, which distinguishes stat tiles rather than
saying who we are, and the success/warning/danger colours, which mean something.

## The bug this uncovered

The theme did not follow the switcher at all. `useActiveOrg` kept the chosen
college in **component-local state**, so every caller had its own copy: the
switcher moved and nothing else did.

The branding was the visible half. The half that matters is that the header could
name one college while the page beside it stayed scoped to another. Fixed with a
module-level store via `useSyncExternalStore`; a test renders two independent
consumers and asserts they agree after a switch.
