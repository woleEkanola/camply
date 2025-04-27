import React, { useState } from "react";
import { api } from "@/utils/trpc";

interface BaseUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  organizationId?: string;
  camperProfileCount: number;
}

interface BaseUserProfilesAccordionProps {
  users: BaseUser[];
}

export const BaseUserProfilesAccordion: React.FC<BaseUserProfilesAccordionProps> = ({ users }) => {
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border border-gray-200 rounded shadow">
        <thead>
          <tr>
            <th className="px-4 py-2 border-b">Email</th>
            <th className="px-4 py-2 border-b">First Name</th>
            <th className="px-4 py-2 border-b">Last Name</th>
            <th className="px-4 py-2 border-b">Created At</th>
            <th className="px-4 py-2 border-b">Camper Profiles</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <React.Fragment key={user.id}>
              <tr
                className={`hover:bg-gray-50 cursor-pointer ${openUserId === user.id ? "bg-blue-50" : ""}`}
                onClick={() => setOpenUserId(openUserId === user.id ? null : user.id)}
              >
                <td className="px-4 py-2 border-b">{user.email}</td>
                <td className="px-4 py-2 border-b">{user.firstName}</td>
                <td className="px-4 py-2 border-b">{user.lastName}</td>
                <td className="px-4 py-2 border-b">{new Date(user.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-2 border-b text-center font-semibold">{user.camperProfileCount}</td>
              </tr>
              {openUserId === user.id && (
                <tr>
                  <td colSpan={5} className="p-0 bg-blue-50">
                    <ProfilesList userId={user.id} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ProfilesList: React.FC<{ userId: string }> = ({ userId }) => {
  const { data, isLoading, error } = api.camperProfile.getByUser.useQuery({ userId });

  if (isLoading) return <div className="p-4">Loading profiles...</div>;
  if (error) return <div className="p-4 text-red-600">Error loading profiles: {error.message}</div>;
  if (!data || data.length === 0) return <div className="p-4 text-gray-500">No profiles found.</div>;

  return (
    <div className="p-4">
      <h4 className="font-semibold mb-2">Profiles</h4>
      <table className="min-w-full border bg-white rounded">
        <thead>
          <tr>
            <th className="px-4 py-2 border-b">Name</th>
            <th className="px-4 py-2 border-b">Age</th>
            <th className="px-4 py-2 border-b">Location</th>
          </tr>
        </thead>
        <tbody>
          {data.map((profile: any) => {
            // Try to get age from a field value, fallback to '-'
            const ageField = profile.fieldValues?.find((fv: any) => fv.field?.name?.toLowerCase() === "age");
            const age = ageField ? ageField.value : "-";
            const locationName = profile.location?.name || "-";
            return (
              <tr key={profile.id}>
                <td className="px-4 py-2 border-b">{profile.name}</td>
                <td className="px-4 py-2 border-b">{age}</td>
                <td className="px-4 py-2 border-b">{locationName}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default BaseUserProfilesAccordion;
