import React, { useState, useEffect } from "react";
import { api } from "@/utils/trpc";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

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
  const [parentError, setParentError] = useState("");

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
    setError("");
    setParentError("");
  }, [profile, isEdit, isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setParentError("");

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
          setParentError("Please select a parent user");
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

  const isLoading = isEdit && isProfileLoading;
  const isSaving = updateMutation.status === "pending" || createMutation.status === "pending";

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit Camper" : "Add Camper"}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" form="edit-camper-form" loading={isSaving}>
            Save
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-md status-danger p-3 text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-4 text-center text-sm text-txt-secondary">Loading...</div>
      ) : (
        <form id="edit-camper-form" onSubmit={handleSave} className="space-y-4">
          <Input
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Camper's Full Name"
          />

          {!isEdit && (
            <Select
              label="Parent"
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              error={parentError}
            >
              <option value="">Select a Parent</option>
              {parents?.map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName} ({u.email})
                </option>
              ))}
            </Select>
          )}

          <Select
            label="Home Campus"
            helpText="Optional"
            value={homeCampusId ?? ""}
            onChange={(e) => setHomeCampusId(e.target.value || null)}
          >
            <option value="">Select a Campus</option>
            {campuses?.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Date of Birth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />

            <Select
              label="Gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="">Select Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Select>
          </div>

          <Select
            label="Status"
            value={active ? "active" : "inactive"}
            onChange={(e) => setActive(e.target.value === "active")}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </form>
      )}
    </Dialog>
  );
};

export default EditCamperModal;
