export type ScanCueKind = "success" | "duplicate" | "critical";

/**
 * Distinct audio + haptic cues per result so a volunteer can tell what
 * happened without looking at the screen (bright sunlight, hands full).
 * Web Audio only — no asset files, matches the pattern the original
 * CameraScanner used for its single success beep.
 */
export function playScanCue(kind: ScanCueKind): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const tone = (freq: number, startAt: number, durationMs: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(freq, ctx.currentTime + startAt);
      gain.gain.setValueAtTime(0.05, ctx.currentTime + startAt);
      oscillator.start(ctx.currentTime + startAt);
      oscillator.stop(ctx.currentTime + startAt + durationMs / 1000);
    };

    if (kind === "success") {
      tone(880, 0, 0.12); // single high beep
    } else if (kind === "duplicate") {
      tone(660, 0, 0.1);
      tone(440, 0.12, 0.14); // two-tone, distinct from success
    } else {
      tone(330, 0, 0.09);
      tone(330, 0.12, 0.09);
      tone(330, 0.24, 0.12); // triple low tone for critical
    }

    setTimeout(() => ctx.close(), 600);
  } catch {
    // Web Audio unavailable/blocked — cue is a nice-to-have, never fatal.
  }
}

export function vibrateForCue(kind: ScanCueKind): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  if (kind === "success") navigator.vibrate(40);
  else if (kind === "duplicate") navigator.vibrate([30, 60, 30]);
  else navigator.vibrate([80, 60, 80, 60, 80]);
}
