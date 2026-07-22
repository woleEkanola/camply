"use client";

import { api } from "@/utils/trpc";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PhoneIcon, EnvelopeIcon, MapPinIcon, CalendarIcon, BriefcaseIcon, HeartIcon, UserGroupIcon } from "@heroicons/react/24/outline";

interface StaffOverviewTabProps {
  staffId: string;
}

export function StaffOverviewTab({ staffId }: StaffOverviewTabProps) {
  const { data: profile } = api.staff.getById.useQuery({ id: staffId });

  if (!profile) return null;

  const details: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    { icon: <EnvelopeIcon className="h-4 w-4" />, label: "Email", value: profile.email || "—" },
    { icon: <PhoneIcon className="h-4 w-4" />, label: "Phone", value: profile.phone || "—" },
    { icon: <MapPinIcon className="h-4 w-4" />, label: "Preferred campus", value: profile.preferredCampus?.name || "—" },
    { icon: <UserGroupIcon className="h-4 w-4" />, label: "Church", value: profile.church || "—" },
    { icon: <BriefcaseIcon className="h-4 w-4" />, label: "Skills", value: (profile.skills || []).join(", ") || "—" },
    { icon: <CalendarIcon className="h-4 w-4" />, label: "Submitted", value: new Date(profile.createdAt).toLocaleDateString() },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs md:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Profile Details</h2>
          <StatusBadge status={profile.status} />
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          {details.map((d) => (
            <div key={d.label} className="flex items-start gap-3">
              <div className="mt-0.5 text-accent-600">{d.icon}</div>
              <div>
                <dt className="text-xs font-medium text-txt-muted">{d.label}</dt>
                <dd className="text-sm font-medium text-neutral-900">{d.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">Camp &amp; Experience</h2>
        <dl className="space-y-3">
          <div>
            <dt className="text-xs font-medium text-txt-muted">Previous experience</dt>
            <dd className="text-sm font-medium text-neutral-900">{profile.previousCampExperience || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-txt-muted">Areas of strength</dt>
            <dd className="text-sm font-medium text-neutral-900">{profile.areasOfStrength || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-txt-muted">Preferred age group</dt>
            <dd className="text-sm font-medium text-neutral-900">{profile.preferredAgeGroup || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-txt-muted">Availability</dt>
            <dd className="text-sm font-medium text-neutral-900">{profile.availability || "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs md:col-span-3">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          <HeartIcon className="h-4 w-4" /> Emergency &amp; Medical
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <dt className="text-xs font-medium text-txt-muted">Emergency contact</dt>
            <dd className="text-sm font-medium text-neutral-900">{profile.emergencyContactName || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-txt-muted">Emergency phone</dt>
            <dd className="text-sm font-medium text-neutral-900">{profile.emergencyContactPhone || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-txt-muted">Medical conditions</dt>
            <dd className="text-sm font-medium text-neutral-900">{profile.medicalConditions || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-txt-muted">Allergies</dt>
            <dd className="text-sm font-medium text-neutral-900">{profile.allergies || "—"}</dd>
          </div>
        </dl>
      </div>

      {profile.fieldValues && profile.fieldValues.length > 0 && (
        <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs md:col-span-3">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">Additional Information</h2>
          <dl className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {profile.fieldValues.map((fv: any) => (
              <div key={fv.id}>
                <dt className="text-xs font-medium text-txt-muted">{fv.field?.label}</dt>
                <dd className="text-sm font-medium text-neutral-900">
                  {Array.isArray(fv.value) ? fv.value.join(", ") : fv.value || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
