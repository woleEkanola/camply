"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { StaffGate } from "@/components/staff/StaffGate";
import { EnvelopeOpenIcon, EnvelopeIcon } from "@heroicons/react/24/outline";

function formatDate(date: string | Date | null) {
  if (!date) return null;
  return new Date(date).toLocaleString();
}

function InboxContent() {
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "pinned">("all");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const utils = api.useUtils();

  const { data: items = [] } = api.communication.inboxMine.useQuery({
    unreadOnly: activeTab === "unread",
    pinnedOnly: activeTab === "pinned",
  });

  const markRead = api.communication.markInboxRead.useMutation({
    onSuccess: () => {
      utils.communication.inboxMine.invalidate();
    },
  });
  const markUnread = api.communication.markInboxUnread.useMutation({
    onSuccess: () => {
      utils.communication.inboxMine.invalidate();
    },
  });
  const pin = api.communication.pinInboxItem.useMutation({
    onSuccess: () => utils.communication.inboxMine.invalidate(),
  });
  const unpin = api.communication.unpinInboxItem.useMutation({
    onSuccess: () => utils.communication.inboxMine.invalidate(),
  });

  const unreadCount = items.filter((i: any) => !i.readAt).length;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-neutral-200">
        {[
          { id: "all", label: `All (${items.length})` },
          { id: "unread", label: `Unread (${unreadCount})` },
          { id: "pinned", label: "Pinned" },
        ].map((tab) => (
          <button
            key={tab.id}
            data-testid={`inbox-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id as any)}
            className={`border-b-2 px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-500 ${
              activeTab === tab.id
                ? "border-accent-600 text-accent-700"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState title="No messages" description="Your inbox is empty." />
      ) : (
        <div className="space-y-3">
          {items.map((item: any) => {
            const isRead = !!item.readAt;
            const isPinned = item.pinned;
            return (
              <Card key={item.id} className={isRead ? "opacity-90" : "border-l-4 border-l-accent-500"}>
                <CardBody>
                  <div className="flex items-start justify-between gap-4">
                    <button
                      onClick={() => {
                        setSelectedItem(item);
                        if (!isRead) markRead.mutate({ id: item.id });
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        {isRead ? (
                          <EnvelopeOpenIcon className="h-4 w-4 text-neutral-400" />
                        ) : (
                          <EnvelopeIcon className="h-4 w-4 text-accent-600" />
                        )}
                        <h3 className={`truncate text-sm font-medium ${isRead ? "text-neutral-700" : "text-neutral-900"}`}>
                          {item.broadcast.title}
                        </h3>
                        {!isRead && <Badge tone="info">New</Badge>}
                        {isPinned && <Badge data-testid="pinned-badge" tone="warning">Pinned</Badge>}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-neutral-500">{item.broadcast.subject}</p>
                      <p className="mt-1 text-xs text-neutral-400">{formatDate(item.broadcast.sentAt) ?? formatDate(item.createdAt)}</p>
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid={isPinned ? "unpin-button" : "pin-button"}
                        onClick={() => {
                          if (isPinned) {
                            unpin.mutate({ id: item.id });
                          } else {
                            pin.mutate({ id: item.id });
                          }
                        }}
                        title={isPinned ? "Unpin" : "Pin"}
                      >
                        {isPinned ? "Unpin" : "Pin"}
                      </Button>
                      {isRead ? (
                        <Button size="sm" variant="ghost" onClick={() => markUnread.mutate({ id: item.id })} title="Mark unread">
                          Mark unread
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => markRead.mutate({ id: item.id })} title="Mark read">
                          Mark read
                        </Button>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedItem} onClose={() => setSelectedItem(null)} title={selectedItem?.broadcast.title} size="lg">
        {selectedItem && (
          <div className="space-y-4">
            <div className="text-sm text-neutral-500">{selectedItem.broadcast.subject}</div>
            {selectedItem.broadcast.body && (
              <div className="prose prose-sm max-w-none rounded-md border border-neutral-200 bg-neutral-50 p-4">
                <TipTapBody body={selectedItem.broadcast.body} />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button data-testid="inbox-close-button" variant="secondary" onClick={() => setSelectedItem(null)}>Close</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function TipTapBody({ body }: { body: any }) {
  if (!body) return null;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return <p>{body}</p>;
    }
  }
  if (body.content && Array.isArray(body.content)) {
    return (
      <div>
        {body.content.map((node: any, i: number) => {
          if (node.type === "paragraph") {
            return (
              <p key={i} className="mb-2">
                {node.content?.map((c: any, j: number) => <span key={j}>{c.text}</span>)}
              </p>
            );
          }
          return null;
        })}
      </div>
    );
  }
  return <pre className="text-xs">{JSON.stringify(body, null, 2)}</pre>;
}

export default function TeacherInboxPage() {
  const router = useRouter();
  useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  return (
    <AppShell area="teacher">
      <PageHeader title="Inbox" />
      <StaffGate>{() => <InboxContent />}</StaffGate>
    </AppShell>
  );
}
