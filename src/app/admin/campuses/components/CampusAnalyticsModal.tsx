"use client";

import React, { useState, useEffect } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { ProgressBar } from "@/components/ui/ProgressBar";
import StatCard from "../../components/StatCard";
import LineChart from "../../components/LineChart";
import { ChartBarIcon, UserGroupIcon, ClockIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

export interface CampusAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  campusName: string;
  stats?: {
    registrationsCount: number;
    campersCount: number;
    approvedCount: number;
    quota: number | null;
    percentUsed: number;
    quotaFullBehavior?: string;
    countsByStatus: Record<string, number>;
    trend?: { count: number }[];
  } | null;
  isLoading?: boolean;
}

export const CampusAnalyticsModal: React.FC<CampusAnalyticsModalProps> = ({
  isOpen,
  onClose,
  campusName,
  stats,
  isLoading = false,
}) => {
  const [accentColor, setAccentColor] = useState("#e67e22");

  useEffect(() => {
    if (typeof document !== "undefined") {
      const color = getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim();
      if (color) setAccentColor(color);
    }
  }, []);

  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      title={`Registration Analytics — ${campusName}`}
      width="lg"
    >
      {isLoading || !stats ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-accent-600" />
          <p className="text-xs text-txt-secondary font-medium">Loading analytics data...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* TOP SUMMARY CARDS */}
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
            <StatCard
              title="Total Registrations"
              value={stats.registrationsCount}
              icon="📝"
              color="blue"
              change={0}
            />
            <StatCard
              title="Unique Campers"
              value={stats.campersCount}
              icon="👤"
              color="green"
              change={0}
            />
            <StatCard
              title="Approved Campers"
              value={stats.approvedCount}
              icon="✅"
              color="purple"
              change={0}
            />
          </div>

          {/* QUOTA & CAPACITY BREAKDOWN */}
          {stats.quota !== null && (
            <div className="rounded-2xl border border-border-default bg-surface p-4 shadow-2xs space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-txt-secondary">
                Capacity Overview
              </h3>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-txt-primary">
                  {stats.approvedCount} approved {stats.quota > 0 ? `of ${stats.quota} capacity` : "(no limit)"}
                </span>
                {stats.quota > 0 && (
                  <span className="font-semibold text-accent-700">{stats.percentUsed}% filled</span>
                )}
              </div>

              {stats.quota > 0 && <ProgressBar percent={stats.percentUsed} className="h-3 rounded-full" />}

              <div className="text-xs text-txt-secondary pt-1">
                {stats.quota > 0 ? (
                  <span>
                    {Math.max(0, stats.quota - stats.approvedCount)} remaining capacity slots before limit triggers.
                  </span>
                ) : (
                  <span>This campus operates with unlimited registration capacity.</span>
                )}
              </div>
            </div>
          )}

          {/* STATUS BREAKDOWN GRID */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-txt-secondary">
              Registration Status Breakdown
            </h3>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Approved", key: "APPROVED", color: "border-success-200 status-success/40 text-success-800" },
                { label: "Pending Review", key: "PENDING", color: "border-warning-200 status-warning/40 text-warning-800" },
                { label: "Checked In", key: "CHECKED_IN", color: "border-success-200 status-success/40 text-success-800" },
                { label: "Waitlisted", key: "WAITLISTED", color: "border-attention-200 bg-attention-50/40 text-attention-800" },
                { label: "Draft", key: "DRAFT", color: "border-border-default bg-surface-raised/60 text-txt-secondary" },
                { label: "Requires Action", key: "REQUIRES_ACTION", color: "border-warning-200 status-warning/40 text-warning-800" },
                { label: "Rejected", key: "REJECTED", color: "border-danger-200 status-danger/40 text-danger-800" },
                { label: "Archived", key: "ARCHIVED", color: "border-border-default bg-surface-raised/60 text-txt-secondary" },
              ].map((item) => (
                <div key={item.key} className={`rounded-xl border p-3.5 transition-all ${item.color}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{item.label}</div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight">
                    {stats.countsByStatus[item.key] ?? 0}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TREND CHART */}
          {stats.trend && stats.trend.length > 0 && (
            <div className="rounded-2xl border border-border-default bg-surface p-4 shadow-2xs">
              <h3 className="font-semibold text-sm text-txt-primary mb-3">Registrations Trend</h3>
              <LineChart
                data={stats.trend.map((item) => item.count)}
                color={accentColor}
              />
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
};

export default CampusAnalyticsModal;
