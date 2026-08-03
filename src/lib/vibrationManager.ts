// Vibration Manager for Camply Haptic Feedback.
// Feature-detects navigator.vibrate() for Android Chrome PWA and safely skips on iOS Safari.

export type VibrationPattern = "success" | "warning" | "error" | "critical";

export interface VibrationSettings {
  enabled: boolean;
}

class VibrationManager {
  private settings: VibrationSettings = {
    enabled: true,
  };

  constructor() {
    if (typeof window !== "undefined") {
      this.loadSettings();
    }
  }

  private loadSettings() {
    try {
      const saved = localStorage.getItem("camply-vibration-settings");
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
    } catch {}
  }

  public saveSettings(newSettings: Partial<VibrationSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem("camply-vibration-settings", JSON.stringify(this.settings));
    } catch {}
  }

  public getSettings(): VibrationSettings {
    return { ...this.settings };
  }

  /**
   * Triggers haptic vibration based on specified pattern. Safely ignores unsupported devices (e.g. iOS).
   */
  public vibrate(pattern: VibrationPattern) {
    if (!this.settings.enabled) return;

    if (typeof window === "undefined" || typeof navigator === "undefined" || !("vibrate" in navigator)) {
      return; // Safe skip on iOS Safari or un-supported browsers
    }

    try {
      switch (pattern) {
        case "success":
          // Short 100ms pulse
          navigator.vibrate(100);
          break;

        case "warning":
          // Double pulse: 100ms, pause 100ms, 100ms
          navigator.vibrate([100, 100, 100]);
          break;

        case "error":
          // Long double pulse: 150ms, pause 80ms, 150ms
          navigator.vibrate([150, 80, 150]);
          break;

        case "critical":
          // Sustained 300ms pulse
          navigator.vibrate(300);
          break;
      }
    } catch (err) {
      // Ignore vibration errors gracefully
    }
  }
}

export const vibrationManager = new VibrationManager();
