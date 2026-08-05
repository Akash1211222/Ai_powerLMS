import { createHash } from 'node:crypto';

/**
 * Meeting-link provider. Default stub generates a deterministic Google Meet–style
 * URL so demos work without OAuth. When GOOGLE_MEET_MODE=api is wired later,
 * swap this for Calendar API event creation.
 */
export function createGoogleMeetLink(seed: string): { meetingUrl: string; provider: 'GOOGLE_MEET' } {
  const hex = createHash('sha256').update(`fca-meet:${seed}`).digest('hex');
  const a = hex.slice(0, 3);
  const b = hex.slice(3, 7);
  const c = hex.slice(7, 10);
  return {
    meetingUrl: `https://meet.google.com/${a}-${b}-${c}`,
    provider: 'GOOGLE_MEET',
  };
}

/** Map watched seconds → attendance status for a live session. */
export function attendanceFromWatchTime(watchedSec: number, durationSec: number): 'PRESENT' | 'LATE' | 'ABSENT' {
  if (durationSec <= 0) return watchedSec > 0 ? 'PRESENT' : 'ABSENT';
  const pct = (watchedSec / durationSec) * 100;
  if (pct >= 75) return 'PRESENT';
  if (pct >= 40) return 'LATE';
  return 'ABSENT';
}

export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
