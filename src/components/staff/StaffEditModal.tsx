"use client";

import React, { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import {
  UserIcon,
  BuildingOfficeIcon,
  HeartIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";

export interface StaffEditModalProps {
  open: boolean;
  onClose: () => void;
  staffId: string;
  organizationId: string;
  campId?: string;
  onSuccess?: () => void;
}

export function StaffEditModal({
  open,
  onClose,
  staffId,
  organizationId,
  campId,
  onSuccess,
}: StaffEditModalProps) {
  const toast = useToast();
  const utils = api.useUtils();

  const { data: profile, isLoading } = api.staff.getById.useQuery(
    { id: staffId },
    { enabled: open && !!staffId }
  );

  const { data: formFields = [] } = api.formField.list.useQuery(
    {
      organizationId,
      campId: campId ?? profile?.campId ?? "",
      audience: profile?.type === "TEACHER" ? "TEACHER" : "VOLUNTEER",
    },
    { enabled: open && !!organizationId && !!profile?.type }
  );

  // Form State
  const [activeTab, setActiveTab] = useState<"personal" | "church" | "medical" | "custom">("personal");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  const [church, setChurch] = useState("");
  const [churchDepartment, setChurchDepartment] = useState("");
  const [yearsServing, setYearsServing] = useState("");
  const [workerStatus, setWorkerStatus] = useState("");

  const [preferredAgeGroup, setPreferredAgeGroup] = useState("");
  const [areasOfStrength, setAreasOfStrength] = useState("");
  const [volunteerCategory, setVolunteerCategory] = useState("");
  const [skills, setSkills] = useState("");
  const [previousCampExperience, setPreviousCampExperience] = useState("");

  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medicalConditions, setMedicalConditions] = useState("");

  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || "");
      setLastName(profile.lastName || "");
      setPreferredName(profile.preferredName || "");
      setEmail(profile.email || "");
      setPhone(profile.phone || "");
      setGender(profile.gender || "");
      setDateOfBirth(
        profile.dateOfBirth
          ? new Date(profile.dateOfBirth).toISOString().slice(0, 10)
          : ""
      );

      setChurch(profile.church || "");
      setChurchDepartment(profile.churchDepartment || "");
      setYearsServing(profile.yearsServing || "");
      setWorkerStatus(profile.workerStatus || "");

      setPreferredAgeGroup(profile.preferredAgeGroup || "");
      setAreasOfStrength(profile.areasOfStrength || "");
      setVolunteerCategory(profile.volunteerCategory || "");
      setSkills((profile.skills || []).join(", "));
      setPreviousCampExperience(profile.previousCampExperience || "");

      setEmergencyContactName(profile.emergencyContactName || "");
      setEmergencyContactPhone(profile.emergencyContactPhone || "");
      setEmergencyContactRelationship(profile.emergencyContactRelationship || "");
      setAllergies(profile.allergies || "");
      setMedicalConditions(profile.medicalConditions || "");

      const fvMap: Record<string, string> = {};
      (profile.fieldValues || []).forEach((fv: any) => {
        fvMap[fv.fieldId] = fv.value;
      });
      setCustomFieldValues(fvMap);
    }
  }, [profile]);

  const updateMutation = api.staff.adminUpdateProfile.useMutation({
    onSuccess: () => {
      toast.success("Staff profile updated successfully.");
      utils.staff.getById.invalidate({ id: staffId });
      utils.staff.adminList.invalidate();
      onSuccess?.();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First name and Last name are required.");
      return;
    }

    const fieldValuesArray = Object.entries(customFieldValues).map(([fieldId, value]) => ({
      fieldId,
      value,
    }));

    updateMutation.mutate({
      id: staffId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      preferredName: preferredName.trim() || null,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      gender: gender || null,
      dateOfBirth: dateOfBirth ? dateOfBirth : null,
      church: church.trim() || null,
      churchDepartment: churchDepartment.trim() || null,
      yearsServing: yearsServing.trim() || null,
      workerStatus: workerStatus.trim() || null,
      preferredAgeGroup: preferredAgeGroup.trim() || null,
      areasOfStrength: areasOfStrength.trim() || null,
      volunteerCategory: volunteerCategory.trim() || null,
      skills: skills
        ? skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      previousCampExperience: previousCampExperience.trim() || null,
      emergencyContactName: emergencyContactName.trim() || null,
      emergencyContactPhone: emergencyContactPhone.trim() || null,
      emergencyContactRelationship: emergencyContactRelationship.trim() || null,
      allergies: allergies.trim() || null,
      medicalConditions: medicalConditions.trim() || null,
      fieldValues: fieldValuesArray,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Edit ${profile?.type === "TEACHER" ? "Teacher" : "Volunteer"} Details`}
      className="max-w-3xl"
    >
      <div className="space-y-5">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-border-default pb-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("personal")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition",
              activeTab === "personal"
                ? "bg-accent-600 text-white"
                : "text-txt-secondary hover:text-txt-primary hover:bg-surface-raised"
            )}
          >
            <UserIcon className="h-4 w-4" /> Personal & Contact
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("church")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition",
              activeTab === "church"
                ? "bg-accent-600 text-white"
                : "text-txt-secondary hover:text-txt-primary hover:bg-surface-raised"
            )}
          >
            <BuildingOfficeIcon className="h-4 w-4" /> Church & Role
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("medical")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition",
              activeTab === "medical"
                ? "bg-accent-600 text-white"
                : "text-txt-secondary hover:text-txt-primary hover:bg-surface-raised"
            )}
          >
            <HeartIcon className="h-4 w-4" /> Medical & Emergency
          </button>
          {formFields.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("custom")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition",
                activeTab === "custom"
                  ? "bg-accent-600 text-white"
                  : "text-txt-secondary hover:text-txt-primary hover:bg-surface-raised"
              )}
            >
              <ClipboardDocumentCheckIcon className="h-4 w-4" /> Form Questions ({formFields.length})
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-txt-secondary">Loading profile details…</div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {/* 1. PERSONAL & CONTACT */}
            {activeTab === "personal" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="First Name *" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  <Input label="Last Name *" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Preferred Name / Alias"
                    value={preferredName}
                    onChange={(e) => setPreferredName(e.target.value)}
                    placeholder="Optional"
                  />
                  <Select label="Gender" value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="">Select gender</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <Input label="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Date of Birth"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* 2. CHURCH & ROLE */}
            {activeTab === "church" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Home Church / Assembly" value={church} onChange={(e) => setChurch(e.target.value)} />
                  <Input
                    label="Church Department / Ministry"
                    value={churchDepartment}
                    onChange={(e) => setChurchDepartment(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Years Serving in Ministry"
                    value={yearsServing}
                    onChange={(e) => setYearsServing(e.target.value)}
                  />
                  <Input
                    label="Worker Status (e.g. Deacon, Pastor, Worker)"
                    value={workerStatus}
                    onChange={(e) => setWorkerStatus(e.target.value)}
                  />
                </div>

                {profile?.type === "TEACHER" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Preferred Age Group"
                      value={preferredAgeGroup}
                      onChange={(e) => setPreferredAgeGroup(e.target.value)}
                    />
                    <Input
                      label="Areas of Strength"
                      value={areasOfStrength}
                      onChange={(e) => setAreasOfStrength(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Volunteer Category"
                      value={volunteerCategory}
                      onChange={(e) => setVolunteerCategory(e.target.value)}
                    />
                  </div>
                )}

                <Input
                  label="Skills (comma-separated)"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="e.g. First Aid, Sound Engineering, Cooking"
                />
                <Textarea
                  label="Previous Camp Experience"
                  value={previousCampExperience}
                  onChange={(e) => setPreviousCampExperience(e.target.value)}
                  rows={2}
                />
              </div>
            )}

            {/* 3. MEDICAL & EMERGENCY */}
            {activeTab === "medical" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Emergency Contact Name"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                  />
                  <Input
                    label="Emergency Contact Phone"
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  />
                </div>
                <Input
                  label="Relationship to Contact"
                  value={emergencyContactRelationship}
                  onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                  placeholder="e.g. Spouse, Parent, Sibling"
                />
                <Textarea
                  label="Known Allergies & Dietary Restrictions"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  rows={2}
                  placeholder="e.g. Peanuts, Penicillin, Lactose intolerant"
                />
                <Textarea
                  label="Medical Conditions / Medications"
                  value={medicalConditions}
                  onChange={(e) => setMedicalConditions(e.target.value)}
                  rows={2}
                  placeholder="e.g. Asthma, High Blood Pressure"
                />
              </div>
            )}

            {/* 4. CUSTOM FORM QUESTIONS */}
            {activeTab === "custom" && (
              <div className="space-y-4">
                {formFields.length === 0 ? (
                  <p className="text-xs text-txt-secondary">No custom form fields configured for this role.</p>
                ) : (
                  formFields.map((field: any) => (
                    <div key={field.id}>
                      <Input
                        label={field.label}
                        value={customFieldValues[field.id] || ""}
                        onChange={(e) =>
                          setCustomFieldValues((prev) => ({
                            ...prev,
                            [field.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-border-default pt-4">
          <Button variant="secondary" onClick={onClose} disabled={updateMutation.isPending}>
            Cancel
          </Button>
          <Button loading={updateMutation.isPending} onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
