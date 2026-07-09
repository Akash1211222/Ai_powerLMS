import { describe, it, expect } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Data Analytics 101')).toBe('data-analytics-101');
  });
  it('strips punctuation and collapses separators', () => {
    expect(slugify('Python & Pandas: Deep-Dive!!')).toBe('python-pandas-deep-dive');
  });
  it('trims leading/trailing separators', () => {
    expect(slugify('  --Hello--  ')).toBe('hello');
  });
});
