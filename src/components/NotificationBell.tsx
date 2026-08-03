"use client";

import { useEffect, useState } from "react";
import { notificationEngine, AppNotification, NotificationPriority } from "@/lib/notificationEngine";
import { NotificationSettingsModal } from "./notifications/NotificationSettingsModal";
import { useSession } from "next-auth/react";
import {
  BellIcon,
  XMarkIcon,
  Cog6ToothIcon,
  CheckIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

export default function NotificationBell() {
  const { data: session } = useSession();
  const organizationId = (session?.user as any)?.organizationId ?? "";

  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const unsubscribe = notificationEngine.subscribe((items) => {
      setNotifications(items);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filteredNotifications = notifications.filter((n) => {
    if (filterPriority !== "ALL" && n.priority !== filterPriority) return false;
    if (
      searchQuery.trim() &&
      !n.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !n.message.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const getPriorityStripe = (priority: NotificationPriority) => {
    switch (priority) {
      case "CRITICAL":
        return "border-l-4 border-l-red-600 bg-red-50/20";
      case "WARNING":
        return "border-l-4 border-l-amber-500 bg-amber-50/20";
      case "SUCCESS":
        return "border-l-4 border-l-emerald-600 bg-emerald-50/20";
      case "INFO":
      default:
        return "border-l-4 border-l-teal-600 bg-teal-50/20";
    }
  };

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative p-2 rounded-full hover:bg-surface-raised transition text-txt-secondary hover:text-txt-primary"
          aria-label="Open Notifications"
        >
          <BellIcon className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-sm">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Notification Center Slide-Over Panel */}
      {open && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-elevated shadow-2xl border-l border-elevated-border flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-elevated-border">
                <div className="flex items-center space-x-2">
                  <BellIcon className="h-5 w-5 text-teal-600" />
                  <h3 className="font-bold text-base text-txt-primary">Notification Center</h3>
                  {unreadCount > 0 && (
                    <span className="bg-teal-100 text-teal-800 text-xs font-bold px-2 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="p-1.5 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-surface-raised"
                    title="Notification Settings"
                  >
                    <Cog6ToothIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="p-1.5 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-surface-raised"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Toolbar: Search + Filter Tabs */}
              <div className="p-3 border-b border-elevated-border space-y-2 bg-bg-surface">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-txt-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search notifications..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border-default bg-bg-subtle focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex space-x-1 overflow-x-auto scrollbar-hide text-xs">
                    {(["ALL", "CRITICAL", "WARNING", "SUCCESS", "INFO"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setFilterPriority(p)}
                        className={`px-2 py-1 rounded-md font-semibold transition ${
                          filterPriority === p
                            ? "bg-teal-600 text-white"
                            : "text-txt-muted hover:text-txt-primary hover:bg-bg-subtle"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <div className="flex space-x-1">
                    <button
                      type="button"
                      onClick={() => notificationEngine.markAllAsRead()}
                      className="p-1 text-txt-muted hover:text-teal-600"
                      title="Mark all as read"
                    >
                      <CheckCircleIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => notificationEngine.clearAll()}
                      className="p-1 text-txt-muted hover:text-red-600"
                      title="Clear history"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Notification Items List */}
              <div className="flex-1 overflow-y-auto divide-y divide-border-subtle p-2 space-y-2">
                {filteredNotifications.length === 0 ? (
                  <div className="p-8 text-center text-sm text-txt-muted">
                    No notifications matching criteria.
                  </div>
                ) : (
                  filteredNotifications.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => notificationEngine.markAsRead(item.id)}
                      className={`p-3.5 rounded-xl transition cursor-pointer ${getPriorityStripe(
                        item.priority
                      )} ${item.read ? "opacity-75" : "shadow-xs font-medium"}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-lg">{item.icon}</span>
                          <span className="font-bold text-sm text-txt-primary">{item.title}</span>
                        </div>
                        <span className="text-[10px] text-txt-muted">
                          {new Date(item.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      <p className="text-xs text-txt-secondary mt-1.5 leading-relaxed">{item.message}</p>

                      <div className="flex items-center justify-between mt-2 pt-1 text-[10px] text-txt-muted border-t border-black/5">
                        <span>Source: {item.source}</span>
                        {item.actionUrl && (
                          <a
                            href={item.actionUrl}
                            className="text-teal-600 font-bold hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open Link →
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <NotificationSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        organizationId={organizationId}
      />
    </>
  );
}
