import React, { useState, useEffect } from "react";
import { api } from "../../../utils/api";

interface EditCamperProfileModalProps {
  profileId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const EditCamperProfileModal: React.FC<EditCamperProfileModalProps> = ({ profileId, isOpen, onClose, onSuccess }) => {
  const { data: profile, isLoading } = api.camperProfile.getById.useQuery({ id: profileId }, { enabled: isOpen && !!profileId });
  const updateMutation = api.camperProfile.update.useMutation();

  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [locationId, setLocationId] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setActive(profile.active);
      setLocationId(profile.locationId);
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateMutation.mutateAsync({
      id: profileId,
      profile: {
        name,
        active,
        locationId: locationId ?? undefined,
      },
    });
    onSuccess();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-bold mb-4">Edit Camper Profile</h2>
        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <form onSubmit={handleSave}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                className="w-full rounded border px-3 py-2"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Active</label>
              <select
                className="w-full rounded border px-3 py-2"
                value={active ? "active" : "inactive"}
                onChange={e => setActive(e.target.value === "active")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            {/* Add location selector if needed */}
            <div className="flex justify-end mt-6 gap-2">
              <button
                type="button"
                className="rounded bg-gray-200 px-4 py-2"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                disabled={updateMutation.status === "pending"}
              >
                Save
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default EditCamperProfileModal;
