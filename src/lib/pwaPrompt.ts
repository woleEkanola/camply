/**
 * Global management of the PWA `beforeinstallprompt` event.
 *
 * Ensures the event is captured immediately upon page initialization,
 * before individual UI components mount or route changes occur.
 */

declare global {
  interface Window {
    __deferredPwaPrompt?: any;
  }
}

let promptEvent: any = null;

if (typeof window !== "undefined") {
  // Capture event if it fired before this module was imported
  if (window.__deferredPwaPrompt) {
    promptEvent = window.__deferredPwaPrompt;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    promptEvent = e;
    window.__deferredPwaPrompt = e;
    window.dispatchEvent(new CustomEvent("camply:pwa-prompt-available", { detail: e }));
  });

  window.addEventListener("appinstalled", () => {
    promptEvent = null;
    window.__deferredPwaPrompt = null;
    window.dispatchEvent(new CustomEvent("camply:pwa-installed"));
  });
}

export function getDeferredPwaPrompt(): any {
  if (typeof window === "undefined") return null;
  return promptEvent || window.__deferredPwaPrompt || null;
}

export function clearDeferredPwaPrompt(): void {
  promptEvent = null;
  if (typeof window !== "undefined") {
    window.__deferredPwaPrompt = null;
  }
}

export async function triggerNativePwaInstall(): Promise<{
  triggered: boolean;
  outcome?: "accepted" | "dismissed";
}> {
  const prompt = getDeferredPwaPrompt();
  if (!prompt) {
    return { triggered: false };
  }

  try {
    prompt.prompt();
    const choiceResult = await prompt.userChoice;
    clearDeferredPwaPrompt();
    return {
      triggered: true,
      outcome: choiceResult?.outcome,
    };
  } catch (err) {
    console.error("Failed to trigger PWA prompt:", err);
    clearDeferredPwaPrompt();
    return { triggered: false };
  }
}
