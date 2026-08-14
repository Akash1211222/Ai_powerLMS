import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * The WEB code lab renders whatever a student writes, scripts and all, inside
 * an iframe on this origin's page. The only thing standing between that code
 * and the signed-in session around it is the sandbox attribute.
 *
 * `allow-scripts` without `allow-same-origin` puts the frame on an opaque
 * origin: the student's JavaScript runs, and can reach neither the parent
 * document, nor cookies, nor storage. Adding `allow-same-origin` alongside
 * `allow-scripts` collapses that wall completely — the combination is
 * equivalent to no sandbox at all, and is easy to add while chasing some
 * unrelated bug about a preview not working.
 *
 * Asserted against the source rather than a render because this is a claim
 * about what is written down: the component pulls in CodeMirror, and mounting
 * that in jsdom would test the editor rather than the boundary.
 */
const source = readFileSync(join(__dirname, 'code-workspace.tsx'), 'utf8');

describe('the student code preview iframe', () => {
  it('runs student scripts on an opaque origin', () => {
    expect(source).toContain('sandbox="allow-scripts"');
  });

  it('never grants same-origin access to student code', () => {
    // With both flags set, student JS can read the session it is rendered
    // beside. There is no legitimate reason for the preview to have it.
    expect(source).not.toContain('allow-same-origin');
  });

  it('does not hand the frame the other escapes out of a sandbox', () => {
    // Each of these lets the frame act outside its box: navigating the parent,
    // opening windows, or running its own nested frames as a way back up.
    for (const escape of ['allow-top-navigation', 'allow-popups', 'allow-modals']) {
      expect(source).not.toContain(escape);
    }
  });

  it('renders the preview from srcDoc, not a URL the student controls', () => {
    // srcDoc keeps the content inline and inert; pointing src at a
    // student-supplied URL would make the LMS fetch arbitrary locations.
    expect(source).toContain('srcDoc=');
  });
});
