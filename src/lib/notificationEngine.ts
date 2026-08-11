// Unified Notification Engine for Camply.
// Handles Local Event Notifications & Web Push Notifications with unified priority UI, audio, and vibration.

import { soundManager } from "./soundManager";
import { vibrationManager } from "./vibrationManager";
import { initDb } from "./offlineDb";

export type NotificationPriority = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
export type NotificationType = "LOCAL" | "PUSH";

export interface AppNotification {
  id: string;
  icon?: string;
  title: string;
  message: string;
  timestamp: string; // ISO string
  type: NotificationType;
  priority: NotificationPriority;
  source: string;
  read: boolean;
  acknowledged?: boolean;
  actionUrl?: string;
}

class NotificationEngine {
  private listeners: Set<(notifications: AppNotification[]) => void> = new Set();
  private memoryCache: AppNotification[] = [];

  constructor() {
    if (typeof window !== "undefined") {
      this.loadNotifications();
      this.setupOnlineListeners();
    }
  }

  private setupOnlineListeners() {
    window.addEventListener("online", () => {
      this.notify({
        title: "Internet Restored",
        message: "Connectivity has returned. Pending offline scans will sync automatically.",
        priority: "SUCCESS",
        source: "Network Monitor",
        icon: "🌐",
      });
    });

    window.addEventListener("offline", () => {
      this.notify({
        title: "Offline Mode Enabled",
        message: "Network connection lost. QR scanning and search continue working offline.",
        priority: "WARNING",
        source: "Network Monitor",
        icon: "📡",
      });
    });
  }

  public subscribe(listener: (notifications: AppNotification[]) => void) {
    this.listeners.add(listener);
    listener(this.memoryCache);
    return () => this.listeners.delete(listener);
  }

  private notifySubscribers() {
    this.updateAppBadge();
    for (const listener of this.listeners) {
      listener([...this.memoryCache]);
    }
  }

  private async updateAppBadge() {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    const unreadCount = this.memoryCache.filter((n) => !n.read).length;
    try {
      if ("setAppBadge" in navigator) {
        if (unreadCount > 0) {
          await (navigator as any).setAppBadge(unreadCount);
        } else {
          await (navigator as any).clearAppBadge();
        }
      }
    } catch {}
  }

  public async loadNotifications(): Promise<AppNotification[]> {
    if (typeof window === "undefined") return [];

    try {
      const db = await initDb();
      if (!db) return [];

      const tx = db.transaction("syncMeta", "readonly");
      const store = tx.objectStore("syncMeta");
      const req = store.get("app_notifications_history");

      return new Promise((resolve) => {
        req.onsuccess = () => {
          const loaded: AppNotification[] = req.result?.value || [];
          this.memoryCache = loaded;
          this.notifySubscribers();
          resolve(loaded);
        };
        req.onerror = () => resolve([]);
      });
    } catch (err) {
      return [];
    }
  }

  private async saveNotifications() {
    if (typeof window === "undefined") return;

    try {
      const db = await initDb();
      if (!db) return;

      const tx = db.transaction("syncMeta", "readwrite");
      const store = tx.objectStore("syncMeta");
      store.put({ key: "app_notifications_history", value: this.memoryCache });
    } catch {}
  }

  /**
   * Main Dispatcher: Creates a notification, plays sensory cues, and saves to history.
   */
  public notify(payload: {
    title: string;
    message: string;
    priority?: NotificationPriority;
    type?: NotificationType;
    source?: string;
    icon?: string;
    actionUrl?: string;
  }): AppNotification {
    const priority = payload.priority || "INFO";
    const type = payload.type || "LOCAL";

    const newNotification: AppNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      title: payload.title,
      message: payload.message,
      timestamp: new Date().toISOString(),
      type,
      priority,
      source: payload.source || (type === "LOCAL" ? "System" : "Broadcast"),
      icon: payload.icon || this.getDefaultIcon(priority),
      read: false,
      acknowledged: priority !== "CRITICAL",
      actionUrl: payload.actionUrl,
    };

    // 1. Add to top of memory cache (max 100 items)
    this.memoryCache = [newNotification, ...this.memoryCache.slice(0, 99)];
    this.saveNotifications();
    this.notifySubscribers();

    // 2. Play Audio Cue
    switch (priority) {
      case "SUCCESS":
        soundManager.play("success");
        vibrationManager.vibrate("success");
        break;

      case "WARNING":
        soundManager.play("warning");
        vibrationManager.vibrate("warning");
        break;

      case "CRITICAL":
        soundManager.play("critical");
        vibrationManager.vibrate("critical");
        break;

      case "INFO":
      default:
        soundManager.play("sync");
        break;
    }

    return newNotification;
  }

  public markAsRead(id: string) {
    this.memoryCache = this.memoryCache.map((n) => (n.id === id ? { ...n, read: true } : n));
    this.saveNotifications();
    this.notifySubscribers();
  }

  public markAllAsRead() {
    this.memoryCache = this.memoryCache.map((n) => ({ ...n, read: true }));
    this.saveNotifications();
    this.notifySubscribers();
  }

  public clearAll() {
    this.memoryCache = [];
    this.saveNotifications();
    this.notifySubscribers();
  }

  private getDefaultIcon(priority: NotificationPriority): string {
    switch (priority) {
      case "SUCCESS":
        return "✅";
      case "WARNING":
        return "⚠️";
      case "CRITICAL":
        return "🚨";
      case "INFO":
      default:
        return "🔔";
    }
  }
}

export const notificationEngine = new NotificationEngine();
