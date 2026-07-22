"use client";

import React, { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { CamperPhotoCropperModal } from "./CamperPhotoCropperModal";

interface CamperProfileViewProps {
  registration?: {
    id?: string;
    registrationNumber?: string | null;
    status?: string | null;
    camp?: { id: string; name: string } | null;
    campus?: { id: string; name: string } | null;
    venue?: { id: string; name: string } | null;
    tribe?: { id: string; name: string } | null;
  } | null;
  formFields?: Array<{
    id: string;
    name: string;
    label: string;
    type: string;
    source: string;
    systemKey?: string | null;
    groupLabel?: string | null;
  }> | null;
  camper: {
    id: string;
    name: string;
    firstName?: string | null;
    lastName?: string | null;
    preferredName?: string | null;
    dateOfBirth?: Date | string | null;
    gender?: string | null;
    photoUrl?: string | null;
    dobApproved?: boolean;
    birthCert?: string | null;

    // Medical / Emergency
    allergies?: string | null;
    medicalConditions?: string | null;
    medications?: string | null;
    dietaryRestrictions?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    relationship?: string | null;

    // Contact Details
    parentPhone?: string | null;
    teenPhone?: string | null;
    homeAddressStreet?: string | null;
    homeAddressCity?: string | null;
    homeAddressState?: string | null;
    homeAddressZip?: string | null;

    // Education / Church
    school?: string | null;
    currentClass?: string | null;
    church?: string | null;
    pastor?: string | null;

    user?: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    } | null;
    homeCampus?: {
      id: string;
      name: string;
    } | null;
    fieldValues?: Array<{
      id: string;
      value: string;
      fieldId: string;
      field: {
        id: string;
        name: string;
        label: string;
        type: string;
      };
    }> | null;
  };
}

function age(dob: string | Date | null | undefined) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function formatDate(dob: string | Date | null | undefined) {
  if (!dob) return "—";
  return new Date(dob).toLocaleDateString();
}

export function CamperProfileView({ camper, registration, formFields }: CamperProfileViewProps) {
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);

  // Helper to format raw values (resolving campus CUIDs if matched)
  const formatVal = (rawVal: any) => {
    if (rawVal === null || rawVal === undefined) return null;
    const s = String(rawVal);
    if (registration?.campus?.id === s) return registration.campus.name;
    if (camper.homeCampus?.id === s) return camper.homeCampus.name;
    return s;
  };

  // Helper to resolve answer for a FormField
  const resolveFieldValue = (field: any) => {
    if (field.source === "CUSTOM") {
      const fv = camper.fieldValues?.find((f: any) => f.fieldId === field.id || f.field?.name === field.name);
      return formatVal(fv?.value);
    }
    if (field.systemKey) {
      if (field.systemKey === "campusId") {
        return registration?.campus?.name || camper.homeCampus?.name || null;
      }
      const val = (camper as any)[field.systemKey] ?? (registration as any)?.[field.systemKey];
      if (val instanceof Date) return val.toLocaleDateString();
      return formatVal(val);
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Photo and Header Card */}
      <Card>
        <CardBody>
          <div className="flex items-center gap-4">
            {camper.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={camper.photoUrl}
                alt=""
                className="h-16 w-16 rounded-full object-cover cursor-pointer border border-border-default hover:scale-105 transition-transform"
                onClick={() => setIsPhotoOpen(true)}
                title="Click to view/crop photo"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsPhotoOpen(true)}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-100 text-xl font-semibold text-accent-700 cursor-pointer hover:scale-105 transition-transform"
                title="Click to view/crop photo"
              >
                {camper.name?.[0]}
              </button>
            )}
            <div>
              <h3 className="text-xl font-bold text-neutral-900">{camper.name}</h3>
              <div className="text-sm text-neutral-500">
                {[
                  age(camper.dateOfBirth) ? `${age(camper.dateOfBirth)} years old` : null,
                  camper.gender,
                  registration?.campus?.name || camper.homeCampus?.name ? `Campus: ${registration?.campus?.name || camper.homeCampus?.name}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Campus & Registration Card */}
      <Card>
        <CardBody>
          <h4 className="mb-3 text-sm font-semibold text-neutral-900 border-b border-border-subtle pb-1.5">
            Campus & Registration Details
          </h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Selected Campus</span>
              <span className="text-neutral-900 font-semibold text-accent-700">
                {registration?.campus?.name || camper.homeCampus?.name || "—"}
              </span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Registration Number</span>
              <span className="text-neutral-900 font-mono font-medium">{registration?.registrationNumber || "—"}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Camp</span>
              <span className="text-neutral-900 font-medium">{registration?.camp?.name || "—"}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Assigned Tribe</span>
              <span className="text-neutral-900 font-medium">{registration?.tribe?.name || "Unassigned"}</span>
            </div>
            {registration?.venue && (
              <div>
                <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Venue</span>
                <span className="text-neutral-900 font-medium">{registration.venue.name}</span>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Personal Info Grid */}
      <Card>
        <CardBody>
          <h4 className="mb-3 text-sm font-semibold text-neutral-900 border-b border-border-subtle pb-1.5">
            Personal Information
          </h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">First Name</span>
              <span className="text-neutral-900 font-medium">{camper.firstName || "—"}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Last Name</span>
              <span className="text-neutral-900 font-medium">{camper.lastName || "—"}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Preferred Name</span>
              <span className="text-neutral-900 font-medium">{camper.preferredName || "—"}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Gender</span>
              <span className="text-neutral-900 font-medium">{camper.gender || "—"}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Date of Birth</span>
              <span className="text-neutral-900 font-medium">{formatDate(camper.dateOfBirth)}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Birth Certificate</span>
              {camper.birthCert ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <a
                    href={camper.birthCert}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-accent-600 hover:underline font-medium"
                  >
                    View Document
                  </a>
                  <Badge tone={camper.dobApproved ? "success" : "neutral"}>
                    {camper.dobApproved ? "Verified" : "Pending Verification"}
                  </Badge>
                </div>
              ) : (
                <span className="text-neutral-500 italic">Not Uploaded</span>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Contact Details Card */}
      <Card>
        <CardBody>
          <h4 className="mb-3 text-sm font-semibold text-neutral-900 border-b border-border-subtle pb-1.5">
            Contact & Address Details
          </h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Parent Phone</span>
              <span className="text-neutral-900 font-medium">{camper.parentPhone || "—"}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Teen Phone</span>
              <span className="text-neutral-900 font-medium">{camper.teenPhone || "—"}</span>
            </div>
            <div className="col-span-2">
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Street Address</span>
              <span className="text-neutral-900 font-medium">{camper.homeAddressStreet || "—"}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">City</span>
              <span className="text-neutral-900 font-medium">{camper.homeAddressCity || "—"}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">State</span>
              <span className="text-neutral-900 font-medium">{camper.homeAddressState || "—"}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Zip Code</span>
              <span className="text-neutral-900 font-medium">{camper.homeAddressZip || "—"}</span>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Medical / Emergency Card */}
      <Card>
        <CardBody>
          <h4 className="mb-3 text-sm font-semibold text-neutral-900 border-b border-border-subtle pb-1.5">
            Medical & Emergency
          </h4>
          <div className="space-y-3 text-sm">
            {camper.allergies && (
              <div className="rounded-md bg-danger-50 p-2.5 text-danger-800 border border-danger-100">
                <span className="block text-[10px] uppercase font-bold text-danger-700">Allergies</span>
                <span className="font-medium">{camper.allergies}</span>
              </div>
            )}
            {camper.medicalConditions && (
              <div className="rounded-md bg-danger-50 p-2.5 text-danger-800 border border-danger-100">
                <span className="block text-[10px] uppercase font-bold text-danger-700">Medical Conditions</span>
                <span className="font-medium">{camper.medicalConditions}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Medications</span>
                <span className="text-neutral-900 font-medium">{camper.medications || "—"}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Dietary Restrictions</span>
                <span className="text-neutral-900 font-medium">{camper.dietaryRestrictions || "—"}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Emergency Contact Name</span>
                <span className="text-neutral-900 font-medium">{camper.emergencyContactName || "—"}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Emergency Phone</span>
                <span className="text-neutral-900 font-medium">{camper.emergencyContactPhone || "—"}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Relationship</span>
                <span className="text-neutral-900 font-medium">{camper.relationship || "—"}</span>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Education & Church Card */}
      <Card>
        <CardBody>
          <h4 className="mb-3 text-sm font-semibold text-neutral-900 border-b border-border-subtle pb-1.5">
            Education & Church
          </h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">School</span>
              <span className="text-neutral-900 font-medium">{camper.school || "—"}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Current Class</span>
              <span className="text-neutral-900 font-medium">{camper.currentClass || "—"}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Church</span>
              <span className="text-neutral-900 font-medium">{camper.church || "—"}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Pastor</span>
              <span className="text-neutral-900 font-medium">{camper.pastor || "—"}</span>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Parent / Guardian Card */}
      <Card>
        <CardBody>
          <h4 className="mb-3 text-sm font-semibold text-neutral-900 border-b border-border-subtle pb-1.5">
            Parent / Guardian Account
          </h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Name</span>
              <span className="text-neutral-900 font-medium">
                {camper.user?.firstName} {camper.user?.lastName}
              </span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[11px] uppercase font-semibold">Email</span>
              <span className="text-neutral-900 font-medium">{camper.user?.email || "—"}</span>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* All Dynamic Wizard Form Responses Card */}
      {formFields && formFields.length > 0 && (
        <Card>
          <CardBody>
            <h4 className="mb-3 text-sm font-semibold text-neutral-900 border-b border-border-subtle pb-1.5 flex items-center justify-between">
              <span>Dynamic Wizard Form Responses</span>
              <span className="text-xs text-neutral-400 font-normal">{formFields.length} configured fields</span>
            </h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {formFields.map((field) => {
                const val = resolveFieldValue(field);
                return (
                  <div key={field.id} className="space-y-0.5">
                    <span className="text-neutral-500 block text-[11px] uppercase font-semibold">
                      {field.label || field.name}
                    </span>
                    <span className={`font-medium ${val ? "text-neutral-900" : "text-neutral-400 italic"}`}>
                      {val || "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Custom Profile Details Card */}
      {camper.fieldValues && camper.fieldValues.length > 0 && (
        <Card>
          <CardBody>
            <h4 className="mb-3 text-sm font-semibold text-neutral-900 border-b border-border-subtle pb-1.5">
              Additional Custom Fields
            </h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {camper.fieldValues.map((fv: any) => (
                <div key={fv.id}>
                  <span className="text-neutral-500 block text-[11px] uppercase font-semibold">
                    {fv.field?.label || fv.field?.name || "Field"}
                  </span>
                  <span className="text-neutral-850 font-medium">{fv.value || "—"}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Full Photo & Cropper Modal */}
      <CamperPhotoCropperModal
        open={isPhotoOpen}
        onClose={() => setIsPhotoOpen(false)}
        camperId={camper.id}
        camperName={camper.name}
        photoUrl={camper.photoUrl}
      />
    </div>
  );
}
