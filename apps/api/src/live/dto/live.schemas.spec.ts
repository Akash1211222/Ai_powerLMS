import { describe, it, expect } from 'vitest';
import { scheduleLiveClassSchema } from './live.schemas';

const base = {
  batchId: 'b1',
  title: 'Live class',
  startsAt: new Date(Date.now() + 3_600_000).toISOString(),
  endsAt: new Date(Date.now() + 7_200_000).toISOString(),
};
const parse = (meetingUrl: string) => scheduleLiveClassSchema.parse({ ...base, meetingUrl });

describe('scheduleLiveClassSchema — meeting link', () => {
  it('accepts the link exactly as Google Meet displays it (no scheme)', () => {
    // The reported bug: this is what a trainer copies out of Meet, and it was
    // rejected with an unexplained "Validation failed".
    expect(parse('meet.google.com/tmf-ksur-jbf').meetingUrl).toBe(
      'https://meet.google.com/tmf-ksur-jbf',
    );
  });

  it('accepts a full https link unchanged', () => {
    expect(parse('https://meet.google.com/abc-defg-hij').meetingUrl).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
  });

  it('trims stray whitespace from a paste', () => {
    expect(parse('  meet.google.com/abc-defg-hij  ').meetingUrl).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
  });

  it('still rejects links that are not Google Meet', () => {
    for (const bad of [
      'zoom.us/j/123456',
      'https://evil.example.com/meet.google.com',
      'https://meet.google.com.attacker.test/abc',
      'not a url at all',
      '',
    ]) {
      expect(() => parse(bad), bad).toThrow();
    }
  });

  it('rejects a non-http scheme even on the right host', () => {
    expect(() => parse('javascript://meet.google.com/x')).toThrow();
  });

  it('still enforces the time ordering', () => {
    expect(() =>
      scheduleLiveClassSchema.parse({
        ...base,
        meetingUrl: 'meet.google.com/abc-defg-hij',
        startsAt: base.endsAt,
        endsAt: base.startsAt,
      }),
    ).toThrow();
  });
});
