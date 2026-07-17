-- BroadcastRecipient inbox tracking (read/unread + pin)
ALTER TABLE "BroadcastRecipient" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BroadcastRecipient" ADD COLUMN "readAt" TIMESTAMP(3);

CREATE INDEX "BroadcastRecipient_recipientId_readAt_idx" ON "BroadcastRecipient"("recipientId", "readAt");
CREATE INDEX "BroadcastRecipient_recipientId_pinned_idx" ON "BroadcastRecipient"("recipientId", "pinned");
