import { describe, it, expect } from 'vitest';
import { readCookie, stripCookie } from './ide.proxy';

describe('IDE proxy cookies', () => {
  it('reads a cookie whose value contains "="', () => {
    expect(readCookie('a=1; fca_ide=x.y=z; b=2', 'fca_ide')).toBe('x.y=z');
    expect(readCookie('a=1', 'fca_ide')).toBeUndefined();
    expect(readCookie(undefined, 'fca_ide')).toBeUndefined();
  });

  // The workbench and a learner's own dev server (via /absproxy) receive the
  // forwarded Cookie header; our credential is not theirs to see.
  it('strips only our credential before forwarding', () => {
    expect(stripCookie('a=1; fca_ide=secret; b=2', 'fca_ide')).toBe('a=1; b=2');
    expect(stripCookie('fca_ide=secret', 'fca_ide')).toBeUndefined();
    expect(stripCookie('fca_ide_other=1', 'fca_ide')).toBe('fca_ide_other=1');
  });
});
