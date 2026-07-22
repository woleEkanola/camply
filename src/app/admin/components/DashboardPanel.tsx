"use client";

import { ReactNode } from "react";

interface DashboardPanelProps {
  title?: string;
  children: ReactNode;
  viewAllLink?: string;
}

export default function DashboardPanel({ title, children, viewAllLink }: DashboardPanelProps) {
  return (
    <div className="rounded-lg bg-surface p-6 shadow-sm">
      {(title || viewAllLink) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h3 className="text-lg font-medium text-gray-900">{title}</h3>}
          {viewAllLink && (
            <a
              href={viewAllLink}
              className="text-sm font-medium text-txt-secondary hover:text-gray-700"
            >
              View All
            </a>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
