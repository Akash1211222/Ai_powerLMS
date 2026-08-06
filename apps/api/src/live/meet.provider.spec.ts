import { describe, expect, it } from 'vitest';
import {
  attendanceFromPercent,
  parseDurationToSeconds,
  parseMeetAttendanceCsv,
} from './meet.provider';

describe('meet attendance helpers', () => {
  it('maps 50% duration to LATE (partial credit)', () => {
    expect(attendanceFromPercent(50)).toBe('LATE');
    expect(attendanceFromPercent(75)).toBe('PRESENT');
    expect(attendanceFromPercent(39)).toBe('ABSENT');
  });

  it('parses H:MM:SS and minute durations', () => {
    expect(parseDurationToSeconds('1:00:00')).toBe(3600);
    expect(parseDurationToSeconds('60')).toBe(3600);
    expect(parseDurationToSeconds('90 minutes')).toBe(5400);
  });

  it('parses Meet attendance CSV and supports 50% of a 2h class', () => {
    const csv = [
      'Name,Email,Duration',
      'Sam Learner,student@futurecorpacademy.in,1:00:00',
      'Ghost User,ghost@example.com,0:30:00',
    ].join('\n');
    const rows = parseMeetAttendanceCsv(csv);
    expect(rows).toHaveLength(2);
    const first = rows[0]!;
    expect(first.email).toBe('student@futurecorpacademy.in');
    expect(first.durationSec).toBe(3600);

    const classDurationSec = 2 * 3600;
    const pct = Math.round((first.durationSec / classDurationSec) * 1000) / 10;
    expect(pct).toBe(50);
    expect(attendanceFromPercent(pct)).toBe('LATE');
  });
});
