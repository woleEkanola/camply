import React, { useState } from "react";
import { api } from "@/utils/trpc";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";

interface BaseUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date;
  organizationId?: string | null;
  camperProfileCount: number;
}

interface BaseUserProfilesAccordionProps {
  users: BaseUser[];
}

const calculateAge = (dobString: string | Date | null | undefined): string => {
  if (!dobString) return "-";
  const dob = new Date(dobString);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return `${age} yrs`;
};

export const BaseUserProfilesAccordion: React.FC<BaseUserProfilesAccordionProps> = ({ users }) => {
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-neutral-200">
        <thead className="bg-neutral-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Account Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Parent Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Created Date
            </th>
            <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Campers
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {users.map((user) => (
            <React.Fragment key={user.id}>
              <tr
                className={`hover:bg-neutral-50 cursor-pointer transition-colors ${
                  openUserId === user.id ? "bg-accent-50/40" : ""
                }`}
                onClick={() => setOpenUserId(openUserId === user.id ? null : user.id)}
              >
                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-neutral-900">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-400 text-xs">
                      {openUserId === user.id ? "▼" : "▶"}
                    </span>
                    {user.email}
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-600">
                  {user.firstName || user.lastName
                    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
                    : <span className="text-neutral-400 italic">Not set</span>}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-500">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-center text-sm font-semibold text-neutral-700">
                  <Badge tone={user.camperProfileCount > 0 ? "success" : "neutral"}>
                    {user.camperProfileCount}
                  </Badge>
                </td>
              </tr>
              {openUserId === user.id && (
                <tr>
                  <td colSpan={4} className="bg-neutral-50/70 p-4 border-b border-neutral-200">
                    <ProfilesList userId={user.id} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={4} className="py-8 text-center text-sm text-neutral-400">
                No parent accounts found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const ProfilesList: React.FC<{ userId: string }> = ({ userId }) => {
  const { data, isLoading, error } = api.camperProfile.getByUser.useQuery({ userId });

  if (isLoading) {
    return <div className="text-center py-4 text-sm text-neutral-500">Loading camper profiles...</div>;
  }
  if (error) {
    return <div className="text-center py-4 text-sm text-danger-600">Error loading profiles: {error.message}</div>;
  }
  if (!data || data.length === 0) {
    return <div className="text-center py-4 text-sm text-neutral-400">No camper profiles linked to this account.</div>;
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-inner max-w-2xl mx-auto">
      <span className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
        Linked Campers ({data.length})
      </span>
      <table className="min-w-full divide-y divide-neutral-100 text-sm">
        <thead>
          <tr className="text-neutral-500 text-xs">
            <th className="px-4 py-2 text-left font-medium">Camper Name</th>
            <th className="px-4 py-2 text-left font-medium">Calculated Age</th>
            <th className="px-4 py-2 text-left font-medium">Gender</th>
            <th className="px-4 py-2 text-left font-medium">Camp Centre</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {data.map((profile: any) => {
            const age = calculateAge(profile.dateOfBirth);
            const locationName = profile.location?.name || "None assigned";
            
            return (
              <tr key={profile.id} className="hover:bg-neutral-50/50">
                <td className="px-4 py-2 font-medium text-neutral-900">
                  <Link
                    href={`/admin/camper-profile/${profile.id}`}
                    className="text-accent-600 hover:text-accent-700 hover:underline"
                  >
                    {profile.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-600">{age}</td>
                <td className="px-4 py-2 text-neutral-500 capitalize">{profile.gender || "-"}</td>
                <td className="px-4 py-2">
                  <Badge tone={profile.location ? "info" : "neutral"}>
                    {locationName}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default BaseUserProfilesAccordion;
