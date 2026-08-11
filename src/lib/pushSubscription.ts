// Web Push Subscription Helper using standard VAPID W3C Push API.

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerPushSubscription(vapidPublicKey: string): Promise<PushSubscription | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("Web Push is not supported in this browser environment.");
    return null;
  }

  // Request browser notification permission explicitly
  if ("Notification" in window) {
    if (Notification.permission === "denied") {
      console.warn("Notification permission was denied by the user.");
      return null;
    }
    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.warn("Notification permission was not granted.");
        return null;
      }
    }
  }

  try {
    // Race serviceWorker.ready with a 3-second timeout so it never hangs indefinitely
    const swPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));

    const registration = await Promise.race([swPromise, timeoutPromise]);
    if (!registration) {
      console.warn("Service Worker is not ready or active in this environment.");
      return null;
    }

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey,
      });
    }

    return subscription;
  } catch (err) {
    console.error("Failed to register Web Push subscription:", err);
    return null;
  }
}

export async function unregisterPushSubscription(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      return true;
    }
  } catch (err) {
    console.error("Failed to unregister push subscription:", err);
  }
  return false;
}
