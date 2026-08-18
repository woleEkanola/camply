"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";

export interface RecentScan {
  registrationId: string;
  scanEventId?: string;
  name: string;
  registrationNumber: string;
  station: string;
  timestamp: number;
}

interface HistorySheetProps {
  open: boolean;
  onClose: () => void;
  scans: RecentScan[];
  timeTick: number;
  activeStation: string;
  allowsUndo: boolean;
  isUndoing: boolean;
  onUndo: (scan: RecentScan) => void;
}

export function HistorySheet({ open, onClose, scans, timeTick, allowsUndo, isUndoing, onUndo }: HistorySheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Session Scan History" snap="full">
      {scans.length === 0 ? (
        <p className="text-sm text-txt-muted py-6 text-center">No scans yet this session.</p>
      ) : (
        <div className="divide-y divide-border-subtle">
          {scans.map((scan) => {
            const elapsedSeconds = Math.floor((timeTick - scan.timestamp) / 1000);
            const isUndoable = allowsUndo && elapsedSeconds < 120; // 2 minutes grace period for instant undo
            const remainingSeconds = 120 - elapsedSeconds;
            return (
              <div key={`${scan.registrationId}-${scan.timestamp}`} className="py-3 flex items-center justify-between text-sm">
                <div>
                  <span className="font-bold text-txt-primary block">{scan.name}</span>
                  <span className="text-xs text-txt-muted">
                    {scan.registrationNumber} · {scan.station} at {new Date(scan.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {isUndoable && (
                  <Button size="sm" variant="secondary" loading={isUndoing} onClick={() => onUndo(scan)}>
                    Undo ({remainingSeconds}s)
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}
