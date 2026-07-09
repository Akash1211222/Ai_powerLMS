export type AttendanceStatusLike = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface AttendanceSummary {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** Attendance rate as a whole percentage (0–100). Explainable (§14, §41). */
  rate: number;
}

/**
 * Deterministic attendance rate. EXCUSED sessions are removed from the
 * denominator (not counted for or against). LATE counts as attended.
 *   rate = round((present + late) / (total - excused) * 100)
 */
export function computeAttendanceRate(
  records: ReadonlyArray<{ status: AttendanceStatusLike }>,
): AttendanceSummary {
  let present = 0;
  let late = 0;
  let absent = 0;
  let excused = 0;
  for (const r of records) {
    switch (r.status) {
      case 'PRESENT':
        present++;
        break;
      case 'LATE':
        late++;
        break;
      case 'ABSENT':
        absent++;
        break;
      case 'EXCUSED':
        excused++;
        break;
    }
  }
  const total = records.length;
  const countable = total - excused;
  const rate = countable > 0 ? Math.round(((present + late) / countable) * 100) : 0;
  return { total, present, late, absent, excused, rate };
}
