"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/utils/trpc";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const utils = api.useUtils();
  const { data: unreadCount } = api.notification.unreadCount.useQuery(undefined, { refetchInterval: 30000 });
  const { data: notifications, refetch } = api.notification.listMine.useQuery(undefined, { enabled: open });

  function onReadMutated() {
    refetch();
    utils.notification.unreadCount.invalidate();
  }
  const markRead = api.notification.markRead.useMutation({ onSuccess: onReadMutated });
  const markAllRead = api.notification.markAllRead.useMutation({ onSuccess: onReadMutated });

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 rounded-full hover:bg-gray-100">
        🔔
        {!!unreadCount && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full px-1.5">{unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-[-60px] sm:right-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 bg-white rounded-lg shadow-lg border z-50 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between p-3 border-b">
            <span className="font-medium text-sm">Notifications</span>
            <button className="text-xs text-blue-600" onClick={() => markAllRead.mutate()}>Mark all read</button>
          </div>
          {(notifications ?? []).length === 0 && <div className="p-4 text-sm text-gray-500">No notifications yet.</div>}
          {(notifications ?? []).map((n) => (
            <div
              key={n.id}
              className={`p-3 border-b text-sm cursor-pointer ${n.readAt ? "" : "bg-blue-50"}`}
              onClick={() => !n.readAt && markRead.mutate({ id: n.id })}
            >
              <div className="font-medium">{n.title}</div>
              <div className="text-gray-600">{n.body}</div>
              <div className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
