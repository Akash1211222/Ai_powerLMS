import { createHash } from 'node:crypto';

/**
 * Deterministic Meet-style URL for demos (mentorship / legacy).
 * Live classes require a trainer-pasted real Meet link.
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

/** Map attended % of class duration → attendance status. */
export function attendanceFromPercent(pct: number): 'PRESENT' | 'LATE' | 'ABSENT' {
  if (pct >= 75) return 'PRESENT';
  if (pct >= 40) return 'LATE';
  return 'ABSENT';
}

/** Map watched seconds → attendance status for a live session. */
export function attendanceFromWatchTime(watchedSec: number, durationSec: number): 'PRESENT' | 'LATE' | 'ABSENT' {
  if (durationSec <= 0) return watchedSec > 0 ? 'PRESENT' : 'ABSENT';
  const pct = (watchedSec / durationSec) * 100;
  return attendanceFromPercent(pct);
}

export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Accept meet.google.com links (with optional query). */
export function isGoogleMeetUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'meet.google.com' || u.hostname.endsWith('.meet.google.com');
  } catch {
    return false;
  }
}

/**
 * Parse duration from Meet attendance CSV cells.
 * Supports: "45", "45.5", "1:30:00", "1:30", "01h 30m", "90 minutes".
 */
export function parseDurationToSeconds(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  const hms = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (hms) {
    const a = Number(hms[1]);
    const b = Number(hms[2]);
    const c = hms[3] != null ? Number(hms[3]) : null;
    if (c != null) return a * 3600 + b * 60 + c;
    // mm:ss vs h:mm — if first part > 59 treat as hours? Meet usually H:MM:SS or M:SS.
    // Prefer H:MM when only two parts and first is small; M:SS when first > 3 hours unlikely.
    // Google often exports "1:05:32" or minutes as decimal. Two-part: treat as H:MM if a < 24 and no seconds.
    return a * 3600 + b * 60;
  }

  const hm = s.match(/^(\d+)\s*h(?:ours?)?\s*(\d+)\s*m(?:in(?:utes?)?)?$/);
  if (hm) return Number(hm[1]) * 3600 + Number(hm[2]) * 60;

  const minsOnly = s.match(/^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes)?$/);
  if (minsOnly) return Math.round(Number(minsOnly[1]) * 60);

  const secsOnly = s.match(/^(\d+)\s*(?:s|sec|secs|seconds)$/);
  if (secsOnly) return Number(secsOnly[1]);

  return null;
}

export interface MeetAttendanceRow {
  email: string;
  name?: string;
  durationSec: number;
}

/**
 * Parse Google Meet attendance CSV text.
 * Looks for Email / Duration columns (case-insensitive). Duration may be Time in call / Duration.
 */
export function parseMeetAttendanceCsv(csvText: string): MeetAttendanceRow[] {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  };

  const headerLine = lines[0];
  if (!headerLine) return [];
  const header = parseLine(headerLine).map((h) => h.toLowerCase());
  const emailIdx = header.findIndex((h) => h === 'email' || h.includes('email'));
  const durationIdx = header.findIndex(
    (h) =>
      h.includes('duration') ||
      h.includes('time in call') ||
      h.includes('time in meeting') ||
      h === 'attended' ||
      h.includes('total duration'),
  );
  const nameIdx = header.findIndex((h) => h === 'name' || h.includes('display name') || h === 'participant');

  if (emailIdx < 0 || durationIdx < 0) {
    throw new Error(
      'CSV must include Email and Duration (or Time in call) columns — export from Google Meet attendance report.',
    );
  }

  const rows: MeetAttendanceRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseLine(line);
    const email = (cells[emailIdx] ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) continue;
    const durationSec = parseDurationToSeconds(cells[durationIdx] ?? '');
    if (durationSec == null || durationSec < 0) continue;
    rows.push({
      email,
      name: nameIdx >= 0 ? cells[nameIdx] : undefined,
      durationSec,
    });
  }
  return rows;
}
