import React, { useState, useEffect, useRef } from "react";
import { api } from "@/utils/trpc";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import {
  UserIcon,
  PhoneIcon,
  HeartIcon,
  AcademicCapIcon,
  TrashIcon,
  CheckCircleIcon,
  CameraIcon,
  HomeModernIcon,
} from "@heroicons/react/24/outline";

interface EditCamperModalProps {
  profileId: string | null;
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  photoOnly?: boolean;
}

type TabType = "personal" | "contact" | "medical" | "education" | "allocation" | "danger";

export default function EditCamperModal({
  profileId,
  organizationId,
  isOpen,
  onClose,
  onSuccess,
  photoOnly = false,
}: EditCamperModalProps) {
  const isEdit = !!profileId;
  const [activeTab, setActiveTab] = useState<TabType>("personal");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: profile, isLoading: isProfileLoading } = api.camper.getById.useQuery(
    { id: profileId ?? "" },
    { enabled: isOpen && isEdit }
  );

  const { data: parents } = api.user.getParentsWithCamperCounts.useQuery(
    { organizationId },
    { enabled: isOpen && !isEdit && !photoOnly }
  );

  const { data: campuses } = api.campus.getByOrganization.useQuery(
    { organizationId },
    { enabled: isOpen && !photoOnly }
  );

  const activeReg = profile?.registrations?.[0];

  // Allocation queries
  const { data: tribes } = api.tribe.listByCamp.useQuery(
    { campId: (activeReg as any)?.campId ?? "" },
    { enabled: isOpen && isEdit && !photoOnly && !!(activeReg as any)?.campId }
  );

  // Mutations
  const updateMutation = api.camper.update.useMutation();
  const createMutation = api.camper.create.useMutation();
  const deleteMutation = api.camper.delete.useMutation();

  const assignTribeMutation = api.tribe.assign.useMutation();
  const assignBedMutation = api.accommodation.assignCamperToBed.useMutation();
  const unassignBedMutation = api.accommodation.unassignCamperFromBed.useMutation();
  const assignRoomMutation = api.accommodation.assignCamperToRoomOnly.useMutation();

  // Form States - Personal Info
  const [name, setName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [homeCampusId, setHomeCampusId] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [dobApproved, setDobApproved] = useState(false);
  const [userId, setUserId] = useState("");

  // Form States - Contact & Address
  const [parentPhone, setParentPhone] = useState("");
  const [teenPhone, setTeenPhone] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [homeAddressStreet, setHomeAddressStreet] = useState("");
  const [homeAddressCity, setHomeAddressCity] = useState("");
  const [homeAddressState, setHomeAddressState] = useState("");
  const [homeAddressZip, setHomeAddressZip] = useState("");

  // Form States - Medical & Dietary
  const [allergies, setAllergies] = useState("");
  const [medicalConditions, setMedicalConditions] = useState("");
  const [medications, setMedications] = useState("");
  const [dietaryRestrictions, setDietaryRestrictions] = useState("");

  // Form States - Education & Church
  const [school, setSchool] = useState("");
  const [currentClass, setCurrentClass] = useState("");
  const [church, setChurch] = useState("");
  const [pastor, setPastor] = useState("");

  // Form States - Allocation
  const [tribeId, setTribeId] = useState("");

  const [error, setError] = useState("");
  const [parentError, setParentError] = useState("");

  useEffect(() => {
    if (isEdit && profile) {
      setName(profile.name || "");
      setFirstName(profile.firstName || "");
      setMiddleName(profile.middleName || "");
      setLastName(profile.lastName || "");
      setPreferredName(profile.preferredName || "");
      setDateOfBirth(profile.dateOfBirth ? new Date(profile.dateOfBirth).toISOString().split("T")[0] : "");
      setGender(profile.gender || "");
      setPhotoUrl(profile.photoUrl || "");
      setHomeCampusId((profile as any).homeCampusId || null);
      setActive(profile.active);
      setDobApproved(profile.dobApproved ?? false);
      setUserId(profile.user?.id || "");

      // Contact
      setParentPhone(profile.parentPhone || "");
      setTeenPhone(profile.teenPhone || "");
      setEmergencyContactName(profile.emergencyContactName || "");
      setEmergencyContactPhone(profile.emergencyContactPhone || "");
      setRelationship(profile.relationship || "");
      setHomeAddressStreet(profile.homeAddressStreet || "");
      setHomeAddressCity(profile.homeAddressCity || "");
      setHomeAddressState(profile.homeAddressState || "");
      setHomeAddressZip(profile.homeAddressZip || "");

      // Medical
      setAllergies(profile.allergies || "");
      setMedicalConditions(profile.medicalConditions || "");
      setMedications(profile.medications || "");
      setDietaryRestrictions(profile.dietaryRestrictions || "");

      // Education & Church
      setSchool(profile.school || "");
      setCurrentClass(profile.currentClass || "");
      setChurch(profile.church || "");
      setPastor(profile.pastor || "");

      // Allocation
      const reg = profile.registrations?.[0];
      setTribeId(reg?.tribe?.id || "");
    } else if (!isEdit) {
      setName("");
      setFirstName("");
      setMiddleName("");
      setLastName("");
      setPreferredName("");
      setDateOfBirth("");
      setGender("");
      setPhotoUrl("");
      setHomeCampusId(null);
      setActive(true);
      setDobApproved(false);
      setUserId("");

      setParentPhone("");
      setTeenPhone("");
      setEmergencyContactName("");
      setEmergencyContactPhone("");
      setRelationship("");
      setHomeAddressStreet("");
      setHomeAddressCity("");
      setHomeAddressState("");
      setHomeAddressZip("");

      setAllergies("");
      setMedicalConditions("");
      setMedications("");
      setDietaryRestrictions("");

      setSchool("");
      setCurrentClass("");
      setChurch("");
      setPastor("");
      setTribeId("");
    }
    setError("");
    setParentError("");
    setActiveTab("personal");
    setConfirmDeleteOpen(false);
  }, [profile, isEdit, isOpen]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setError("Please select a valid image file.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhotoUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setParentError("");

    try {
      if (photoOnly && isEdit && profileId) {
        // Teacher / Volunteer photo update mode
        await updateMutation.mutateAsync({
          id: profileId,
          profile: {
            photoUrl: photoUrl,
          },
        });
        onSuccess();
        onClose();
        return;
      }

      const computedFullName = (firstName || lastName)
        ? [firstName, middleName, lastName].filter(Boolean).join(" ")
        : name;

      if (isEdit && profileId) {
        await updateMutation.mutateAsync({
          id: profileId,
          profile: {
            name: computedFullName || name,
            firstName: firstName || undefined,
            middleName: middleName || undefined,
            lastName: lastName || undefined,
            preferredName: preferredName || undefined,
            active,
            homeCampusId: homeCampusId ?? undefined,
            dateOfBirth: dateOfBirth || undefined,
            gender: gender || undefined,
            dobApproved,
            photoUrl: photoUrl,
            parentPhone: parentPhone || undefined,
            teenPhone: teenPhone || undefined,
            emergencyContactName: emergencyContactName || undefined,
            emergencyContactPhone: emergencyContactPhone || undefined,
            relationship: relationship || undefined,
            homeAddressStreet: homeAddressStreet || undefined,
            homeAddressCity: homeAddressCity || undefined,
            homeAddressState: homeAddressState || undefined,
            homeAddressZip: homeAddressZip || undefined,
            allergies: allergies || undefined,
            medicalConditions: medicalConditions || undefined,
            medications: medications || undefined,
            dietaryRestrictions: dietaryRestrictions || undefined,
            school: school || undefined,
            currentClass: currentClass || undefined,
            church: church || undefined,
            pastor: pastor || undefined,
          },
        });

        // Handle tribe assignment update if active registration exists
        const reg = profile?.registrations?.[0];
        if (reg && tribeId !== (reg.tribe?.id || "")) {
          await assignTribeMutation.mutateAsync({
            registrationId: reg.id,
            tribeId: tribeId,
          });
        }
      } else {
        if (!userId) {
          setParentError("Please select a parent user");
          setActiveTab("personal");
          return;
        }
        await createMutation.mutateAsync({
          profile: {
            name: computedFullName || name,
            userId,
            organizationId,
            homeCampusId: homeCampusId ?? undefined,
            active,
            dateOfBirth: dateOfBirth || undefined,
            gender: gender || undefined,
          },
          fieldValues: [],
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save camper profile");
    }
  };

  const handleDelete = async () => {
    if (!profileId) return;
    try {
      await deleteMutation.mutateAsync({ id: profileId });
      setConfirmDeleteOpen(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to delete camper");
    }
  };

  const isLoading = isEdit && isProfileLoading;
  const isSaving =
    updateMutation.status === "pending" ||
    createMutation.status === "pending" ||
    assignTribeMutation.status === "pending";

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: "personal", label: "Personal Info", icon: <UserIcon className="h-4 w-4" /> },
    { key: "contact", label: "Contact & Address", icon: <PhoneIcon className="h-4 w-4" /> },
    { key: "medical", label: "Medical & Health", icon: <HeartIcon className="h-4 w-4" /> },
    { key: "education", label: "School & Church", icon: <AcademicCapIcon className="h-4 w-4" /> },
    ...(isEdit && activeReg ? [{ key: "allocation" as TabType, label: "Camp Allocation", icon: <HomeModernIcon className="h-4 w-4" /> }] : []),
    ...(isEdit ? [{ key: "danger" as TabType, label: "Danger Zone", icon: <TrashIcon className="h-4 w-4 text-rose-500" /> }] : []),
  ];

  return (
    <>
      <Dialog
        open={isOpen}
        onClose={onClose}
        title={photoOnly ? `Update Camper Photo: ${name || "Camper"}` : isEdit ? `Edit Profile: ${name || "Camper"}` : "Add New Camper"}
        size={photoOnly ? "md" : "lg"}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            {activeTab !== "danger" && (
              <Button type="submit" form="edit-camper-form" loading={isSaving}>
                Save Changes
              </Button>
            )}
          </>
        }
      >
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700 font-medium">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-txt-muted">
            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-accent-600 border-t-transparent mr-2" />
            Loading camper details...
          </div>
        ) : photoOnly ? (
          /* PHOTO ONLY MODE FOR TEACHERS / VOLUNTEERS */
          <form id="edit-camper-form" onSubmit={handleSave} className="space-y-6 py-2">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative h-32 w-32 rounded-full overflow-hidden border-2 border-border-default bg-accent-500/10 shadow-inner">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-accent-500 font-bold text-4xl uppercase">
                    {(name[0] || "C").toUpperCase()}
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-bold text-lg text-txt-primary">{name || "Camper"}</h3>
                <p className="text-xs text-txt-muted mt-0.5">Upload or take a new picture for this teenager</p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <CameraIcon className="mr-1.5 h-4 w-4 text-accent-500" />
                  {photoUrl ? "Change Photo" : "Upload / Take Photo"}
                </Button>
                {photoUrl && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setPhotoUrl("")}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </form>
        ) : (
          /* FULL EDIT MODE FOR ADMINS */
          <div className="space-y-5">
            {/* Header Profile Photo Bar */}
            <div className="flex items-center gap-4 p-3.5 rounded-2xl border border-border-default bg-surface-raised">
              <div className="relative h-16 w-16 shrink-0 rounded-full overflow-hidden border border-border-default bg-accent-500/10">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-accent-500 font-bold text-2xl uppercase">
                    {(name[0] || "C").toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-base text-txt-primary truncate">{name || "New Camper Profile"}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge tone={active ? "success" : "neutral"} className="text-xs">
                    {active ? "Active Profile" : "Inactive"}
                  </Badge>
                  {dobApproved && (
                    <Badge tone="info" className="text-xs inline-flex items-center gap-1">
                      <CheckCircleIcon className="h-3.5 w-3.5 text-sky-500" />
                      DOB Verified
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <CameraIcon className="mr-1.5 h-4 w-4 text-accent-500" />
                  Upload Photo
                </Button>
                {photoUrl && (
                  <button
                    type="button"
                    onClick={() => setPhotoUrl("")}
                    className="block text-center text-[11px] text-rose-500 hover:underline mt-1 w-full font-medium"
                  >
                    Remove Photo
                  </button>
                )}
              </div>
            </div>

            {/* Tab Bar */}
            <div className="flex items-center gap-1 border-b border-border-default overflow-x-auto no-scrollbar pb-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap",
                    activeTab === t.key
                      ? "bg-accent-500/15 text-accent-400 border border-accent-500/30"
                      : "text-txt-muted hover:text-txt-primary hover:bg-surface-raised"
                  )}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            <form id="edit-camper-form" onSubmit={handleSave} className="space-y-4 pt-1">
              {/* TAB 1: PERSONAL INFO */}
              {activeTab === "personal" && (
                <div className="space-y-4 animate-in fade-in-50 duration-150">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      label="First Name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="e.g. John"
                    />
                    <Input
                      label="Last Name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="e.g. Doe"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      label="Middle Name"
                      value={middleName}
                      onChange={(e) => setMiddleName(e.target.value)}
                      placeholder="Optional"
                    />
                    <Input
                      label="Preferred Name"
                      value={preferredName}
                      onChange={(e) => setPreferredName(e.target.value)}
                      placeholder="e.g. Johnny"
                    />
                  </div>

                  <Input
                    label="Full Name (Primary Display)"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Camper's Full Display Name"
                  />

                  {!isEdit && (
                    <Select
                      label="Parent User Account"
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
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Select
                      id="edit-camper-home-campus"
                      label="Home Campus"
                      value={homeCampusId ?? ""}
                      onChange={(e) => setHomeCampusId(e.target.value || null)}
                    >
                      <option value="">Select Home Campus</option>
                      {campuses?.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>

                    <Select
                      label="Profile Status"
                      value={active ? "active" : "inactive"}
                      onChange={(e) => setActive(e.target.value === "active")}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </Select>
                  </div>

                  {isEdit && (
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-border-default bg-surface-raised">
                      <input
                        type="checkbox"
                        id="dobApproved"
                        checked={dobApproved}
                        onChange={(e) => setDobApproved(e.target.checked)}
                        className="h-4 w-4 rounded border-input-border text-accent-600 focus:ring-accent-500 cursor-pointer"
                      />
                      <label htmlFor="dobApproved" className="text-xs font-semibold text-txt-primary cursor-pointer">
                        Date of Birth Verified (DOB Approved)
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: CONTACT & ADDRESS */}
              {activeTab === "contact" && (
                <div className="space-y-4 animate-in fade-in-50 duration-150">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      label="Parent Phone Number"
                      value={parentPhone}
                      onChange={(e) => setParentPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                    />
                    <Input
                      label="Teen Phone Number"
                      value={teenPhone}
                      onChange={(e) => setTeenPhone(e.target.value)}
                      placeholder="Optional teen contact phone"
                    />
                  </div>

                  <div className="border-t border-border-subtle pt-3">
                    <h4 className="font-semibold text-xs text-txt-muted uppercase mb-3">Emergency Contact</h4>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <Input
                        label="Contact Name"
                        value={emergencyContactName}
                        onChange={(e) => setEmergencyContactName(e.target.value)}
                        placeholder="Emergency Contact Name"
                      />
                      <Input
                        label="Contact Phone"
                        value={emergencyContactPhone}
                        onChange={(e) => setEmergencyContactPhone(e.target.value)}
                        placeholder="Emergency Contact Phone"
                      />
                      <Input
                        label="Relationship"
                        value={relationship}
                        onChange={(e) => setRelationship(e.target.value)}
                        placeholder="e.g. Mother, Father, Guardian"
                      />
                    </div>
                  </div>

                  <div className="border-t border-border-subtle pt-3">
                    <h4 className="font-semibold text-xs text-txt-muted uppercase mb-3">Home Address</h4>
                    <Input
                      label="Street Address"
                      value={homeAddressStreet}
                      onChange={(e) => setHomeAddressStreet(e.target.value)}
                      placeholder="123 Main Street"
                    />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mt-3">
                      <Input
                        label="City"
                        value={homeAddressCity}
                        onChange={(e) => setHomeAddressCity(e.target.value)}
                        placeholder="City"
                      />
                      <Input
                        label="State / Province"
                        value={homeAddressState}
                        onChange={(e) => setHomeAddressState(e.target.value)}
                        placeholder="State"
                      />
                      <Input
                        label="ZIP / Postal Code"
                        value={homeAddressZip}
                        onChange={(e) => setHomeAddressZip(e.target.value)}
                        placeholder="Postal Code"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: MEDICAL & HEALTH */}
              {activeTab === "medical" && (
                <div className="space-y-4 animate-in fade-in-50 duration-150">
                  <Textarea
                    label="Allergies"
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    placeholder="List all food, medication, or environmental allergies..."
                    rows={2}
                  />

                  <Textarea
                    label="Medical Conditions & History"
                    value={medicalConditions}
                    onChange={(e) => setMedicalConditions(e.target.value)}
                    placeholder="Describe any ongoing health conditions, asthma, diabetes, etc..."
                    rows={2}
                  />

                  <Textarea
                    label="Current Medications"
                    value={medications}
                    onChange={(e) => setMedications(e.target.value)}
                    placeholder="List any daily or emergency medications..."
                    rows={2}
                  />

                  <Textarea
                    label="Dietary Restrictions"
                    value={dietaryRestrictions}
                    onChange={(e) => setDietaryRestrictions(e.target.value)}
                    placeholder="Vegetarian, Halal, Kosher, Gluten-Free, Lactose Intolerant, etc..."
                    rows={2}
                  />
                </div>
              )}

              {/* TAB 4: SCHOOL & CHURCH */}
              {activeTab === "education" && (
                <div className="space-y-4 animate-in fade-in-50 duration-150">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      label="School Name"
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      placeholder="Camper's School"
                    />
                    <Input
                      label="Current Class / Grade"
                      value={currentClass}
                      onChange={(e) => setCurrentClass(e.target.value)}
                      placeholder="e.g. Grade 10, JSS 2"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                      label="Church Name"
                      value={church}
                      onChange={(e) => setChurch(e.target.value)}
                      placeholder="Home Church"
                    />
                    <Input
                      label="Pastor's Name"
                      value={pastor}
                      onChange={(e) => setPastor(e.target.value)}
                      placeholder="Pastor Name"
                    />
                  </div>
                </div>
              )}

              {/* TAB 5: CAMP ALLOCATION (TRIBE, ROOM, BED) */}
              {activeTab === "allocation" && activeReg && (
                <div className="space-y-4 animate-in fade-in-50 duration-150">
                  <div className="p-3.5 rounded-xl border border-border-default bg-surface-raised space-y-1">
                    <div className="text-xs font-semibold text-txt-muted uppercase">Active Registration</div>
                    <div className="text-sm font-bold text-txt-primary">{(activeReg as any).registrationNumber || activeReg.id}</div>
                    <div className="text-xs text-txt-secondary">
                      Campus: <strong>{(activeReg as any).campus?.name || "—"}</strong>
                    </div>
                  </div>

                  <Select
                    label="Assigned Tribe"
                    value={tribeId}
                    onChange={(e) => setTribeId(e.target.value)}
                    helpText="Select tribe assignment for active camp"
                  >
                    <option value="">Unassigned Tribe</option>
                    {tribes?.map((t: any) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>

                  <div className="p-3 rounded-xl border border-border-default bg-surface-raised/50 text-xs text-txt-secondary space-y-1">
                    <div className="font-semibold text-txt-primary">Current Room & Bed</div>
                    <div>Room: <strong>{(activeReg as any).room?.name || "Unassigned"}</strong></div>
                    <div>Bed: <strong>{(activeReg as any).bed?.label || "Unassigned"}</strong></div>
                    <div className="text-[11px] text-txt-muted mt-1">
                      (To reassign specific hostels, rooms, or beds in detail, use the Accommodation Manager under Org Settings)
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 6: DANGER ZONE */}
              {activeTab === "danger" && isEdit && (
                <div className="p-4 rounded-2xl border border-rose-200/80 bg-rose-50/50 space-y-3 animate-in fade-in-50 duration-150">
                  <h4 className="font-bold text-sm text-rose-800">Delete Camper Profile</h4>
                  <p className="text-xs text-rose-700 leading-relaxed">
                    Soft deleting this camper will archive their record and associated registrations. This action can be reversed by a Super Admin from the trash page within 60 days.
                  </p>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmDeleteOpen(true)}
                  >
                    <TrashIcon className="mr-1.5 h-4 w-4" />
                    Delete Camper Profile
                  </Button>
                </div>
              )}
            </form>
          </div>
        )}
      </Dialog>

      {/* CONFIRM DELETE DIALOG */}
      <Dialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Confirm Camper Profile Deletion"
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deleteMutation.status === "pending"}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleteMutation.status === "pending"}
              onClick={handleDelete}
            >
              Confirm Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-txt-secondary leading-relaxed">
          Are you sure you want to delete <strong className="text-txt-primary">{name}</strong>? This profile and any registrations will be safely moved to trash.
        </p>
      </Dialog>
    </>
  );
}
