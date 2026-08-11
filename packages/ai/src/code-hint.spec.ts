import { describe, it, expect } from 'vitest';
import {
  classifyFailure,
  parseErrorLine,
  codeHintHeuristic,
  type FailedCase,
  type CodeHintInput,
} from './code-hint';

const fail = (over: Partial<FailedCase> = {}): FailedCase => ({
  name: null,
  stdin: '',
  expectedOutput: '',
  actualOutput: '',
  stderr: null,
  timedOut: false,
  ...over,
});

describe('parseErrorLine', () => {
  it('finds the line in a Python traceback', () => {
    expect(parseErrorLine('  File "main.py", line 7\n    print(', 'PYTHON')).toBe(7);
  });

  it('finds the line in javac and gcc output', () => {
    expect(parseErrorLine('Main.java:12: error: cannot find symbol', 'JAVA')).toBe(12);
    expect(parseErrorLine('main.c:31:5: error: expected ;', 'C')).toBe(31);
  });

  it('returns null when there is nothing to go on', () => {
    expect(parseErrorLine(null, 'PYTHON')).toBeNull();
    expect(parseErrorLine('segmentation fault', 'C')).toBeNull();
  });
});

describe('classifyFailure', () => {
  it('puts a timeout ahead of everything else', () => {
    expect(classifyFailure(fail({ timedOut: true, stderr: 'SyntaxError' }))).toBe('timeout');
  });

  it('separates a compile error from a runtime crash', () => {
    expect(classifyFailure(fail({ stderr: 'SyntaxError: invalid syntax' }))).toBe('compile');
    expect(classifyFailure(fail({ stderr: 'Main.java:3: error: cannot find symbol' }))).toBe('compile');
    expect(classifyFailure(fail({ stderr: 'IndexError: list index out of range' }))).toBe('crash');
  });

  it('spots silence', () => {
    expect(classifyFailure(fail({ expectedOutput: '4', actualOutput: '' }))).toBe('no-output');
  });

  it('spots debug prints left in', () => {
    expect(
      classifyFailure(fail({ expectedOutput: '4', actualOutput: 'debugging...\n4' })),
    ).toBe('extra-output');
  });

  it('distinguishes an ordering bug from a wrong value', () => {
    // Same values, wrong sequence — the maths is fine.
    expect(classifyFailure(fail({ expectedOutput: '1\n2\n3', actualOutput: '3\n1\n2' }))).toBe(
      'wrong-order',
    );
    expect(classifyFailure(fail({ expectedOutput: '1\n2\n3', actualOutput: '1\n2\n9' }))).toBe(
      'value',
    );
  });

  it('distinguishes presentation from arithmetic', () => {
    expect(classifyFailure(fail({ expectedOutput: 'Hello World', actualOutput: 'hello  world' }))).toBe(
      'formatting',
    );
    expect(classifyFailure(fail({ expectedOutput: '10', actualOutput: '11' }))).toBe('value');
  });
});

describe('codeHintHeuristic', () => {
  const base: CodeHintInput = {
    language: 'PYTHON',
    instructions: 'Double the input.',
    source: 'n = int(input())\nprint(n + 1)\n',
    failures: [],
    passedCount: 0,
    totalCount: 2,
  };

  it('reports the line the runtime named', () => {
    const hint = codeHintHeuristic({
      ...base,
      failures: [fail({ stderr: 'File "main.py", line 2\nNameError: name x is not defined' })],
      totalCount: 1,
    });
    expect(hint.line).toBe(2);
    expect(hint.diagnosis).toMatch(/error while running/i);
    expect(hint.provider).toBe('heuristic');
  });

  it('says the approach is partly working when some cases pass', () => {
    const hint = codeHintHeuristic({
      ...base,
      failures: [fail({ expectedOutput: '6', actualOutput: '4' })],
      passedCount: 3,
      totalCount: 4,
    });
    expect(hint.explanation).toContain('3 of 4');
    expect(hint.explanation).toMatch(/partly right/i);
  });

  it('never hands over the answer', () => {
    const hint = codeHintHeuristic({
      ...base,
      failures: [fail({ name: 'two', stdin: '2\n', expectedOutput: '4', actualOutput: '3' })],
    });
    // A hint that contains code turns the attempt into a copy-paste.
    expect(hint.hint).not.toMatch(/```/);
    expect(hint.hint).not.toContain('n * 2');
    expect(hint.hint.length).toBeGreaterThan(20);
  });

  it('handles the all-passing case without inventing a fault', () => {
    const hint = codeHintHeuristic({ ...base, failures: [], passedCount: 2, totalCount: 2 });
    expect(hint.diagnosis).toMatch(/passed/i);
    expect(hint.line).toBeNull();
  });
});
