'use client';

/**
 * Synthesised chime for the new-delivery alert. Web Audio API → no asset
 * to bundle, no URL juggling. ~600ms of "ding, ding" — loud enough to
 * grab attention while the driver is moving around, short enough to not
 * be obnoxious if multiple offers arrive in a row.
 *
 * Browsers gate AudioContext behind a user gesture; if the driver hasn't
 * interacted with the page yet, the chime silently no-ops (the visual
 * dialog still fires, so they don't miss the offer).
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

export function playNewDeliveryChime(): void {
  const ac = getContext();
  if (!ac) return;
  if (ac.state === 'suspended') {
    ac.resume().catch(() => undefined);
  }
  const now = ac.currentTime;
  // Three notes, ascending so it reads as "you got an offer" rather than
  // "something bad happened". 660 → 880 → 1040 Hz, ~150ms each.
  playNote(ac, 660, now, 0.15);
  playNote(ac, 880, now + 0.17, 0.15);
  playNote(ac, 1040, now + 0.34, 0.2);
}

function playNote(ac: AudioContext, freq: number, startAt: number, duration: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.4, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}
