"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/utils/trpc";
import { useToast } from "@/components/ui/Toast";
import { MegaphoneIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";

interface AdminBroadcastModalProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}

export function AdminBroadcastModal({
  open,
  onClose,
  organizationId,
}: AdminBroadcastModalProps) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"INFO" | "SUCCESS" | "WARNING" | "CRITICAL">("INFO");
  const [targetAudience, setTargetAudience] = useState<"ALL" | "CAMPUS" | "STATION" | "ROLE">("ALL");
  const [actionUrl, setActionUrl] = useState("");

  const broadcastMutation = api.push.broadcast.useMutation({
    onSuccess: (data) => {
      toast.success(`Broadcast sent to ${data.recipientsCount} active subscriptions!`);
      setTitle("");
      setMessage("");
      setActionUrl("");
      onClose();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to send broadcast.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    broadcastMutation.mutate({
      organizationId,
      title: title.trim(),
      message: message.trim(),
      priority,
      targetAudience,
      actionUrl: actionUrl.trim() || undefined,
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Send Web Push Broadcast">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-txt-secondary uppercase tracking-wider block mb-1">
            Notification Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Camp-wide Emergency Announcement"
            required
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-txt-secondary uppercase tracking-wider block mb-1">
            Message Body
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. All volunteers report to the Main Auditorium immediately."
            rows={3}
            className="w-full rounded-lg border border-border-default bg-bg-surface p-3 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-txt-secondary uppercase tracking-wider block mb-1">
            Priority Level
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(["INFO", "SUCCESS", "WARNING", "CRITICAL"] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setPriority(lvl)}
                className={`py-2 text-xs font-bold rounded-lg border transition ${
                  priority === lvl
                    ? lvl === "CRITICAL"
                      ? "bg-red-600 text-white border-red-600"
                      : lvl === "WARNING"
                      ? "bg-amber-500 text-white border-amber-500"
                      : lvl === "SUCCESS"
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-teal-600 text-white border-teal-600"
                    : "border-border-default bg-bg-surface text-txt-secondary"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-txt-secondary uppercase tracking-wider block mb-1">
            Action URL (Optional)
          </label>
          <Input
            value={actionUrl}
            onChange={(e) => setActionUrl(e.target.value)}
            placeholder="e.g. /volunteer/qr-scan"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-12 text-base"
          icon={<PaperAirplaneIcon className="h-5 w-5" />}
          loading={broadcastMutation.isPending}
        >
          Send Push Notification
        </Button>
      </form>
    </BottomSheet>
  );
}
