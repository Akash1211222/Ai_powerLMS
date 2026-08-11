import { describe, it, expect } from 'vitest';
import { outputMatches, correctnessRatio, isRunnable, type TestOutcome } from './test-runner';

const outcome = (passed: boolean): TestOutcome => ({
  testCaseId: 'x',
  passed,
  actualOutput: '',
  stderr: null,
  timedOut: false,
});

describe('outputMatches', () => {
  it('accepts an exact match', () => {
    expect(outputMatches('42', '42')).toBe(true);
  });

  it('forgives whitespace a student cannot reasonably control', () => {
    // Trailing newline from print(), CRLF from a Windows paste, trailing spaces.
    expect(outputMatches('42\n', '42')).toBe(true);
    expect(outputMatches('42', '42\n')).toBe(true);
    expect(outputMatches('a\r\nb', 'a\nb')).toBe(true);
    expect(outputMatches('a   \nb\t', 'a\nb')).toBe(true);
    expect(outputMatches('done\n\n\n', 'done')).toBe(true);
  });

  it('still fails on differences that are real mistakes', () => {
    expect(outputMatches('42', '43')).toBe(false);
    expect(outputMatches('', '42')).toBe(false);
    // A blank line in the middle is a formatting bug, not noise.
    expect(outputMatches('a\n\nb', 'a\nb')).toBe(false);
    // Leading whitespace is meaningful — it is often the thing being tested.
    expect(outputMatches('  a', 'a')).toBe(false);
    // Case and interior spacing matter.
    expect(outputMatches('Hello World', 'hello world')).toBe(false);
    expect(outputMatches('a  b', 'a b')).toBe(false);
  });

  it('compares multi-line output line by line', () => {
    expect(outputMatches('1\n2\n3\n', '1\n2\n3')).toBe(true);
    expect(outputMatches('1\n3\n2', '1\n2\n3')).toBe(false);
  });
});

describe('correctnessRatio', () => {
  it('is the share of passing cases', () => {
    expect(correctnessRatio([outcome(true), outcome(true)])).toBe(1);
    expect(correctnessRatio([outcome(true), outcome(false)])).toBe(0.5);
    expect(correctnessRatio([outcome(false)])).toBe(0);
  });

  it('is null when the assignment has no cases, rather than a misleading zero', () => {
    // A written assignment has nothing to run; scoring it 0% for correctness
    // would fail every essay.
    expect(correctnessRatio([])).toBeNull();
  });
});

describe('isRunnable', () => {
  it('accepts the compiled and interpreted languages', () => {
    for (const l of ['PYTHON', 'JAVASCRIPT', 'TYPESCRIPT', 'JAVA', 'C', 'CPP']) {
      expect(isRunnable(l)).toBe(true);
    }
  });

  it('rejects the ones with no stdout to compare', () => {
    // SQL and WEB produce a result set or a rendered page, not program output.
    expect(isRunnable('SQL')).toBe(false);
    expect(isRunnable('WEB')).toBe(false);
    expect(isRunnable('NONE')).toBe(false);
  });
});
