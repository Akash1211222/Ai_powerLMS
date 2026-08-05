/**
 * Futuristic soft chime via Web Audio — no external asset required.
 * Respects reduced-motion / missing AudioContext gracefully.
 */

let ctx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Call from a user gesture once so browsers allow subsequent chimes. */
export async function unlockNotificationAudio() {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') {
    try {
      await c.resume();
    } catch {
      /* ignore */
    }
  }
  unlocked = c.state === 'running';
}

export function playNotificationChime() {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const c = getCtx();
  if (!c) return;

  const run = () => {
    const now = c.currentTime;
    // Soft two-tone “signal ping”
    const tones: Array<{ f: number; t: number; g: number }> = [
      { f: 880, t: 0, g: 0.045 },
      { f: 1174.66, t: 0.09, g: 0.035 },
    ];
    for (const tone of tones) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = tone.f;
      gain.gain.setValueAtTime(0.0001, now + tone.t);
      gain.gain.exponentialRampToValueAtTime(tone.g, now + tone.t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.t + 0.32);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(now + tone.t);
      osc.stop(now + tone.t + 0.35);
    }
  };

  if (c.state === 'suspended') {
    c.resume()
      .then(() => {
        unlocked = true;
        run();
      })
      .catch(() => undefined);
    return;
  }
  if (!unlocked && c.state !== 'running') return;
  run();
}
