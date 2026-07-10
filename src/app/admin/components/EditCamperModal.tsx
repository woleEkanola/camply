import React, { useState, useEffect } from "react";
import { api } from "../../../utils/api";

interface EditCamperModalProps {
  profileId: string | null;
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const EditCamperModal: React.FC<EditCamperModalProps> = ({
  profileId,
  organizationId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const isEdit = !!profileId;

  // Queries
  const { data: profile, isLoading: isProfileLoading } = api.camper.getById.useQuery(
    { id: profileId ?? "" },
    { enabled: isOpen && isEdit }
  );

  const { data: parents } = api.user.getParentsWithCamperCounts.useQuery(
    { organizationId },
    { enabled: isOpen && !isEdit }
  );

  const { data: campuses } = api.campus.getByOrganization.useQuery(
    { organizationId },
    { enabled: isOpen }
  );

  // Mutations
  const updateMutation = api.camper.update.useMutation();
  const createMutation = api.camper.create.useMutation();

  // Form States
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [homeCampusId, setHomeCampusId] = useState<string | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isEdit && profile) {
      setName(profile.name || "");
      setActive(profile.active);
      setHomeCampusId((profile as any).homeCampusId);
      setDateOfBirth(profile.dateOfBirth ? new Date(profile.dateOfBirth).toISOString().split("T")[0] : "");
      setGender(profile.gender || "");
      setUserId(profile.user?.id || "");
    } else if (!isEdit) {
      setName("");
      setActive(true);
      setHomeCampusId(null);
      setDateOfBirth("");
      setGender("");
      setUserId("");
    }
  }, [profile, isEdit]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (isEdit && profileId) {
        await updateMutation.mutateAsync({
          id: profileId,
          profile: {
            name,
            active,
            homeCampusId: homeCampusId ?? undefined,
            dateOfBirth: dateOfBirth || undefined,
            gender: gender || undefined,
          },
        });
      } else {
        if (!userId) {
          setError("Please select a parent user");
          return;
        }
        await createMutation.mutateAsync({
          profile: {
            name,
            userId,
            organizationId,
            homeCampusId: homeCampusId ?? undefined,
            active,
            dateOfBirth: dateOfBirth || undefined,
            gender: gender || undefined,
          },
          fieldValues: [], // Empty dynamic values during quick-add
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save camper");
    }
  };

  if (!isOpen) return null;

  const isLoading = isEdit && isProfileLoading;
  const isSaving = updateMutation.status === "pending" || createMutation.status === "pending";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">
          {isEdit ? "Edit Camper" : "Add Camper"}
        </h2>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="py-4 text-center text-sm text-neutral-500">Loading...</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                type="text"
                className="w-full rounded border px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Camper's Full Name"
              />
            </div>

            {!isEdit && (
              <div>
                <label className="block text-sm font-medium mb-1">Parent *</label>
                <select
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  required
                >
                  <option value="">Select a Parent</option>
                  {parents?.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Home Campus</label>
              <select
                className="w-full rounded border px-3 py-2 text-sm"
                value={homeCampusId ?? ""}
                onChange={(e) => setHomeCampusId(e.target.value || null)}
              >
                <option value="">Select a Campus (Optional)</option>
                {campuses?.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Date of Birth</label>
                <input
                  type="date"
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Gender</label>
                <select
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="">Select Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                className="w-full rounded border px-3 py-2 text-sm"
                value={active ? "active" : "inactive"}
                onChange={(e) => setActive(e.target.value === "active")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="flex justify-end mt-6 gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                className="rounded bg-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-300"
                onClick={onClose}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default EditCamperModal;
