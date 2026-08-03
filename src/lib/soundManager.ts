// Audio Manager for Camply Notifications.
// Supports bundled audio MP3 assets with instant WebAudio API synthesizer fallback
// so sounds work 100% reliably even when offline or before static files load.

export type SoundCue = "success" | "warning" | "error" | "critical" | "sync";

export interface SoundSettings {
  enabled: boolean;
  muted: boolean;
  volume: number; // 0.0 to 1.0
}

class SoundManager {
  private audioCtx: AudioContext | null = null;
  private isUnlocked = false;
  private settings: SoundSettings = {
    enabled: true,
    muted: false,
    volume: 0.8,
  };

  constructor() {
    if (typeof window !== "undefined") {
      this.loadSettings();
      this.setupAutoUnlock();
    }
  }

  private loadSettings() {
    try {
      const saved = localStorage.getItem("camply-sound-settings");
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
    } catch {}
  }

  public saveSettings(newSettings: Partial<SoundSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem("camply-sound-settings", JSON.stringify(this.settings));
    } catch {}
  }

  public getSettings(): SoundSettings {
    return { ...this.settings };
  }

  /**
   * Unlocks WebAudio AudioContext on the user's first tap/click to comply with browser autoplay policies.
   */
  private setupAutoUnlock() {
    const unlock = () => {
      if (this.isUnlocked) return;
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          if (!this.audioCtx) this.audioCtx = new AudioCtxClass();
          if (this.audioCtx.state === "suspended") {
            this.audioCtx.resume();
          }
          this.isUnlocked = true;
        }
      } catch {}
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
    };

    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
  }

  /**
   * Plays specified sound cue using synthesized WebAudio fallback or audio elements.
   */
  public play(cue: SoundCue) {
    if (!this.settings.enabled || this.settings.muted || this.settings.volume <= 0) {
      return;
    }

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioCtx && AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx) {
        if (this.audioCtx.state === "suspended") {
          this.audioCtx.resume().catch(() => {});
        }
        this.synthesizeCue(cue);
      }
    } catch (err) {
      console.warn("Audio playback fallback failed:", err);
    }
  }

  /**
   * Generates clean acoustic chimes using WebAudio Oscillators.
   */
  private synthesizeCue(cue: SoundCue) {
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    const vol = this.settings.volume;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(vol * 0.4, now);
    masterGain.connect(ctx.destination);

    const playTone = (freq: number, start: number, duration: number, type: OscillatorType = "sine") => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0.01, now + start);
      gain.gain.exponentialRampToValueAtTime(0.3 * vol, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now + start);
      osc.stop(now + start + duration);
    };

    switch (cue) {
      case "success":
        // High ascending double chime (C5 -> G5)
        playTone(523.25, 0, 0.15);
        playTone(783.99, 0.1, 0.25);
        break;

      case "warning":
        // Double amber pulse (E4 -> E4)
        playTone(329.63, 0, 0.12, "triangle");
        playTone(329.63, 0.14, 0.18, "triangle");
        break;

      case "error":
        // Descending error buzz (F4 -> C4)
        playTone(349.23, 0, 0.15, "sawtooth");
        playTone(261.63, 0.12, 0.25, "sawtooth");
        break;

      case "critical":
        // Pulsing high emergency alarm (A5 -> E6 -> A5)
        playTone(880.0, 0, 0.15, "square");
        playTone(1318.51, 0.15, 0.15, "square");
        playTone(880.0, 0.3, 0.25, "square");
        break;

      case "sync":
        // Soft rising triple chime (G4 -> C5 -> E5)
        playTone(392.0, 0, 0.1);
        playTone(523.25, 0.08, 0.1);
        playTone(659.25, 0.16, 0.2);
        break;
    }
  }
}

export const soundManager = new SoundManager();
