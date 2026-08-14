import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useExamIntegrity } from './use-exam-integrity';

/**
 * These counts end up in front of a trainer deciding whether a student cheated,
 * so the arithmetic matters more than most UI code: an inflated blur count
 * accuses somebody of something they did once, and a dropped flush loses the
 * evidence entirely.
 */

type Signals = { blur: number; paste: number; awayMs: number };

// hoisted, because vi.mock's factory is lifted above the file's own consts.
const { reportIntegrity } = vi.hoisted(() => ({
  reportIntegrity: vi.fn(async (_attemptId: string, _signals: Signals) => undefined),
}));
vi.mock('./lms-learning-api', () => ({ assessmentsApi: { reportIntegrity } }));

/** Drives the browser signals a tab switch actually produces. */
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** The nth batch of signals sent, failing loudly if it was never sent. */
function reportAt(index: number): Signals {
  const call = reportIntegrity.mock.calls[index];
  if (!call) throw new Error(`expected a report at index ${index}, but none was sent`);
  return call[1];
}

beforeEach(() => {
  vi.useFakeTimers();
  reportIntegrity.mockClear();
  setVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useExamIntegrity — when it watches', () => {
  it('watches nothing until an attempt is actually in progress', () => {
    renderHook(() => useExamIntegrity(null, true));
    document.dispatchEvent(new Event('paste'));
    vi.advanceTimersByTime(60_000);

    expect(reportIntegrity).not.toHaveBeenCalled();
  });

  it('watches nothing once the attempt is no longer active', () => {
    renderHook(() => useExamIntegrity('attempt-1', false));
    document.dispatchEvent(new Event('paste'));
    vi.advanceTimersByTime(60_000);

    expect(reportIntegrity).not.toHaveBeenCalled();
  });

  it('stops listening after the component goes away', () => {
    const { unmount } = renderHook(() => useExamIntegrity('attempt-1', true));
    unmount();
    reportIntegrity.mockClear();

    document.dispatchEvent(new Event('paste'));
    vi.advanceTimersByTime(60_000);
    expect(reportIntegrity).not.toHaveBeenCalled();
  });
});

describe('useExamIntegrity — counting', () => {
  it('counts each paste once and batches them into one report', () => {
    renderHook(() => useExamIntegrity('attempt-1', true));

    document.dispatchEvent(new Event('paste'));
    document.dispatchEvent(new Event('paste'));
    document.dispatchEvent(new Event('paste'));
    vi.advanceTimersByTime(20_000);

    expect(reportIntegrity).toHaveBeenCalledTimes(1);
    expect(reportAt(0)).toMatchObject({ paste: 3 });
  });

  it('counts one tab switch as one blur', () => {
    // A real tab switch fires BOTH visibilitychange and blur, and the hook
    // listens for both. If each increments the counter, a student who looked
    // away once is reported to their trainer as having done it twice.
    renderHook(() => useExamIntegrity('attempt-1', true));

    setVisibility('hidden');
    window.dispatchEvent(new Event('blur'));

    vi.advanceTimersByTime(20_000);
    expect(reportAt(0)).toMatchObject({ blur: 1 });
  });

  it('notices the student switching to another application', () => {
    // Alt-tabbing to a messaging app does not hide the tab, so
    // visibilitychange never fires — only the window blurs. That is exactly
    // the moment worth recording, and it used to be recorded as nothing.
    renderHook(() => useExamIntegrity('attempt-1', true));

    window.dispatchEvent(new Event('blur')); // tab still visible
    vi.advanceTimersByTime(20_000);

    expect(reportAt(0)).toMatchObject({ blur: 1 });
  });

  it('records how long the student was away', () => {
    renderHook(() => useExamIntegrity('attempt-1', true));

    setVisibility('hidden');
    vi.advanceTimersByTime(5_000);
    setVisibility('visible'); // returning flushes immediately

    expect(reportAt(0).awayMs).toBeGreaterThanOrEqual(5_000);
  });

  it('reports on return, so a student who closes the tab is still recorded', () => {
    renderHook(() => useExamIntegrity('attempt-1', true));

    setVisibility('hidden');
    vi.advanceTimersByTime(1_000);
    setVisibility('visible');

    // Without waiting for the 20s timer.
    expect(reportIntegrity).toHaveBeenCalledTimes(1);
  });

  it('does not lose what it has collected when the exam view unmounts', () => {
    const { unmount } = renderHook(() => useExamIntegrity('attempt-1', true));

    document.dispatchEvent(new Event('paste'));
    unmount();

    expect(reportIntegrity).toHaveBeenCalledTimes(1);
    expect(reportAt(0)).toMatchObject({ paste: 1 });
  });

  it('starts each batch from zero rather than resending old counts', () => {
    renderHook(() => useExamIntegrity('attempt-1', true));

    document.dispatchEvent(new Event('paste'));
    vi.advanceTimersByTime(20_000);
    document.dispatchEvent(new Event('paste'));
    vi.advanceTimersByTime(20_000);

    expect(reportAt(0)).toMatchObject({ paste: 1 });
    expect(reportAt(1)).toMatchObject({ paste: 1 });
  });
});

describe('useExamIntegrity — staying out of the way', () => {
  it('sends nothing when the student did nothing', () => {
    // A quiet exam should be silent, not a heartbeat of empty reports every
    // 20 seconds from every student in the room.
    renderHook(() => useExamIntegrity('attempt-1', true));
    vi.advanceTimersByTime(120_000);

    expect(reportIntegrity).not.toHaveBeenCalled();
  });

  it('never lets a failed report interrupt the exam', async () => {
    reportIntegrity.mockRejectedValueOnce(new Error('network down'));
    renderHook(() => useExamIntegrity('attempt-1', true));

    document.dispatchEvent(new Event('paste'));
    expect(() => vi.advanceTimersByTime(20_000)).not.toThrow();
    // Let the rejected promise settle. Not runAllTimersAsync: the hook holds a
    // repeating interval, so "all timers" never runs out.
    await Promise.resolve();
    expect(reportIntegrity).toHaveBeenCalledTimes(1);
  });
});
