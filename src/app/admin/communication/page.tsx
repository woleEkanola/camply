"use client";

import React from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/utils/trpc";
import {
  EnvelopeIcon,
  DocumentTextIcon,
  SpeakerWaveIcon,
  PaintBrushIcon,
} from "@heroicons/react/24/outline";

const subPages = [
  {
    title: "Email Events",
    description: "Configure automated emails for registrations, authentication, and staff",
    href: "/admin/communication/events",
    icon: EnvelopeIcon,
    color: "bg-blue-50 text-blue-600",
  },
  {
    title: "Templates",
    description: "Design and manage email templates with the visual editor",
    href: "/admin/communication/templates",
    icon: DocumentTextIcon,
    color: "bg-purple-50 text-purple-600",
  },
  {
    title: "Broadcast",
    description: "Send one-time announcements to parents, teachers, and volunteers",
    href: "/admin/communication/broadcast",
    icon: SpeakerWaveIcon,
    color: "bg-green-50 text-green-600",
  },
  {
    title: "Branding",
    description: "Customize your organization's email colors, logo, and footer",
    href: "/admin/communication/branding",
    icon: PaintBrushIcon,
    color: "bg-orange-50 text-orange-600",
  },
];

export default function CommunicationOverviewPage() {
  const { data: events, isLoading, isError } = api.communication.eventList.useQuery();

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-5xl space-y-8">
        <PageHeader
          title="Communication"
          description="Manage email events, templates, broadcasts, and branding"
        />

        {/* Sub-page grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {subPages.map((page) => (
            <Link key={page.href} href={page.href}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardBody className="flex flex-col gap-3">
                  <div
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${page.color}`}
                  >
                    <page.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900">{page.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                      {page.description}
                    </p>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>

        {/* Recent Email Activity */}
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Recent Email Activity</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Overview of each email event and its current configuration
          </p>

          <div className="mt-4 space-y-3">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Card key={i}>
                  <CardBody className="flex items-center gap-4">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </CardBody>
                </Card>
              ))
            ) : isError ? (
              <Card>
                <CardBody>
                  <p className="text-sm text-danger-600">
                    Failed to load email event configuration. Please try again.
                  </p>
                </CardBody>
              </Card>
            ) : events && events.length > 0 ? (
              events.map((config) => (
                <Card key={config.id} className="rounded-xl">
                  <CardBody className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900">
                        {config.event
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-neutral-500">
                        Template: {config.template?.name ?? "None"}
                      </p>
                    </div>
                    <Badge tone={config.enabled !== false ? "success" : "neutral"}>
                      {config.enabled !== false ? "ON" : "OFF"}
                    </Badge>
                  </CardBody>
                </Card>
              ))
            ) : (
              <Card>
                <CardBody>
                  <p className="text-sm text-neutral-500">
                    No email events configured yet.
                  </p>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
