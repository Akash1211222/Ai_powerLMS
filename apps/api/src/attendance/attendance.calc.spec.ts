import { describe, it, expect } from 'vitest';
import { computeAttendanceRate } from './attendance.calc';

describe('computeAttendanceRate', () => {
  it('returns 0 for no records', () => {
    expect(computeAttendanceRate([]).rate).toBe(0);
  });

  it('counts LATE as attended', () => {
    const s = computeAttendanceRate([{ status: 'PRESENT' }, { status: 'LATE' }, { status: 'ABSENT' }]);
    expect(s.present).toBe(1);
    expect(s.late).toBe(1);
    expect(s.rate).toBe(67); // 2/3
  });

  it('excludes EXCUSED from the denominator', () => {
    const s = computeAttendanceRate([
      { status: 'PRESENT' },
      { status: 'ABSENT' },
      { status: 'EXCUSED' },
    ]);
    expect(s.excused).toBe(1);
    expect(s.rate).toBe(50); // 1 present / (3 - 1 excused)
  });

  it('is 100 when all excused (no countable sessions -> 0)', () => {
    expect(computeAttendanceRate([{ status: 'EXCUSED' }]).rate).toBe(0);
  });

  it('is 100 when all present', () => {
    expect(computeAttendanceRate([{ status: 'PRESENT' }, { status: 'PRESENT' }]).rate).toBe(100);
  });
});
