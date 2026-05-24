'use client';

/**
 * Tiny chime helper for the new-order alert. We avoid bundling an audio
 * asset (and the URL juggling that comes with it) by synthesising a brief
 * two-tone beep through the Web Audio API. The result is ~600ms of "ding,
 * ding" — loud enough to grab attention in a noisy shop, short enough to
 * not annoy.
 *
 * Browsers gate AudioContext behind a user gesture; if the page never had a
 * click/keypress the chime silently no-ops. The toast still fires, so the
 * operator gets visual feedback either way.
 */
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const AC =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    return ctx;
  } catch {
    return null;
  }
}

export function playNewOrderChime(): void {
  const ac = getContext();
  if (!ac) return;
  if (ac.state === 'suspended') {
    ac.resume().catch(() => undefined);
  }
  const now = ac.currentTime;
  // Two short notes, ~200ms each, with a 50ms gap. Tuned around 880Hz/660Hz
  // so they cut through ambient noise without sounding alarmy.
  playNote(ac, 880, now, 0.18);
  playNote(ac, 660, now + 0.22, 0.18);
}

function playNote(ac: AudioContext, freq: number, startAt: number, duration: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  // Soft attack/release envelope so we don't pop the speakers.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.35, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}
