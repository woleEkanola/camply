"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { Button } from "@/components/ui/Button";
import { CameraIcon, PhotoIcon, KeyIcon, UserIcon, ShieldCheckIcon, SunIcon } from "@heroicons/react/24/outline";
import { Dialog } from "@/components/ui/Dialog";
import { useUploadThing } from "@/utils/uploadthing-hook";
import { compressImage } from "@/lib/compressImage";
import { ThemeSettingsCard } from "@/components/theme/ThemeSettingsCard";

// Helper function to crop, resize and compress client-side images
const compressAndResizeImage = (fileOrBlob: File | Blob): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(fileOrBlob);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 400; // Standard avatar resolution
        let width = img.width;
        let height = img.height;

        // Crop to square
        const size = Math.min(width, height);
        const offsetX = (width - size) / 2;
        const offsetY = (height - size) / 2;

        canvas.width = MAX_SIZE;
        canvas.height = MAX_SIZE;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, MAX_SIZE, MAX_SIZE);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error("Canvas export failed"));
              }
            },
            "image/jpeg",
            0.85 // Apply 85% quality JPEG compression
          );
        } else {
          reject(new Error("Failed to get canvas context"));
        }
      };
      img.onerror = () => reject(new Error("Image load failed"));
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
  });
};

function formatErrorMessage(message: string): React.ReactNode {
  if (message.startsWith("[") && message.endsWith("]")) {
    try {
      const parsed = JSON.parse(message);
      if (Array.isArray(parsed)) {
        return (
          <ul className="list-disc list-inside space-y-1">
            {parsed.map((item: any, i: number) => (
              <li key={i} className="text-sm font-medium text-red-800">
                {item.message || "Invalid input"}
              </li>
            ))}
          </ul>
        );
      }
    } catch (e) {
      // Fallback
    }
  }
  return <p className="text-sm font-medium text-red-800">{message}</p>;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  // Navigation tabs: 'info' | 'photo' | 'security' | 'staff'
  const [activeTab, setActiveTab] = useState("info");
  
  // States for notifications
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Profile fields state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  
  // Security / Password fields state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Staff details state
  const [preferredName, setPreferredName] = useState("");
  const [gender, setGender] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [church, setChurch] = useState("");
  const [churchDepartment, setChurchDepartment] = useState("");
  const [yearsServing, setYearsServing] = useState("");
  const [workerStatus, setWorkerStatus] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState("");
  const [medicalConditions, setMedicalConditions] = useState("");
  const [allergies, setAllergies] = useState("");

  // Webcam states
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Account Deletion states
  const [deleteConfirmPassword, setDeleteConfirmPassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleteCheckboxChecked, setIsDeleteCheckboxChecked] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Load backend data
  const { data: profile, refetch: refetchProfile, isLoading: isProfileLoading } = api.user.getProfile.useQuery(undefined, {
    enabled: !!session?.user,
  });

  const isStaff = session?.user?.role === "TEACHER" || session?.user?.role === "VOLUNTEER";

  const { data: staffProfile, refetch: refetchStaffProfile } = api.staff.getMyProfile.useQuery(undefined, {
    enabled: isStaff,
  });

  // mutations
  const updateProfileMutation = api.user.updateProfile.useMutation({
    onSuccess: () => {
      setSuccessMsg("Profile details updated successfully.");
      refetchProfile();
      if (isStaff) refetchStaffProfile();
      // Reset password fields
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => {
      setErrorMsg(err.message || "Failed to update profile details.");
    },
  });

  const setPasswordMutation = api.user.setPassword.useMutation({
    onSuccess: () => {
      setSuccessMsg("Password set successfully. You can now log in using your password.");
      refetchProfile();
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => {
      setErrorMsg(err.message || "Failed to set password.");
    },
  });

  const updateStaffMutation = api.staff.updateMyProfile.useMutation({
    onSuccess: () => {
      setSuccessMsg("Staff profile details updated successfully.");
      refetchStaffProfile();
    },
    onError: (err) => {
      setErrorMsg(err.message || "Failed to update staff details.");
    },
  });

  const deleteSelfMutation = api.user.deleteSelf.useMutation({
    onSuccess: () => {
      signOut({ callbackUrl: "/login?deleted=true" });
    },
    onError: (err) => {
      setErrorMsg(err.message || "Failed to delete account.");
      setIsDeleteConfirmOpen(false);
    },
  });

  const { startUpload: startPhotoUpload } = useUploadThing("documentUploader");

  const handleDeleteAccount = () => {
    triggerNotification(null, null);
    if (profile?.passwordSet) {
      if (!deleteConfirmPassword) {
        setErrorMsg("Please enter your password to confirm account deletion.");
        return;
      }
    } else {
      if (!isDeleteCheckboxChecked) {
        setErrorMsg("Please check the confirmation box.");
        return;
      }
      if (deleteConfirmText !== "DELETE") {
        setErrorMsg("Please type 'DELETE' to confirm account deletion.");
        return;
      }
    }
    setIsDeleteConfirmOpen(true);
  };

  const executeDeleteAccount = () => {
    deleteSelfMutation.mutate({
      password: profile?.passwordSet ? deleteConfirmPassword : undefined,
    });
  };


  // Initialize fields once profile loads
  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName || staffProfile?.firstName || "");
      setLastName(profile.lastName || staffProfile?.lastName || "");
      setPhone(profile.phone ?? "");
    }
  }, [profile, staffProfile]);

  // Initialize staff fields
  useEffect(() => {
    if (staffProfile) {
      setPreferredName(staffProfile.preferredName ?? "");
      setGender(staffProfile.gender ?? "");
      if (staffProfile.dateOfBirth) {
        // format dateOfBirth as YYYY-MM-DD for standard date input
        const dobDate = new Date(staffProfile.dateOfBirth);
        setDateOfBirth(dobDate.toISOString().split("T")[0]);
      }
      setChurch(staffProfile.church ?? "");
      setChurchDepartment(staffProfile.churchDepartment ?? "");
      setYearsServing(staffProfile.yearsServing ?? "");
      setWorkerStatus(staffProfile.workerStatus ?? "");
      setEmergencyContactName(staffProfile.emergencyContactName ?? "");
      setEmergencyContactPhone(staffProfile.emergencyContactPhone ?? "");
      setEmergencyContactRelationship(staffProfile.emergencyContactRelationship ?? "");
      setMedicalConditions(staffProfile.medicalConditions ?? "");
      setAllergies(staffProfile.allergies ?? "");
    }
  }, [staffProfile]);

  // Redirect if unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

  if (status === "loading" || isProfileLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50">
        <div className="text-center">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-600 border-t-transparent" />
          <p className="mt-2 text-sm text-neutral-500 font-medium">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!session?.user) return null;

  // Determine AppShell area parameter based on user role
  const role = session.user.role;
  let area: "admin" | "dashboard" | "campus-rep" | "super-admin" | "teacher" | "volunteer" = "dashboard";
  if (role === "SUPER_ADMIN") {
    area = "super-admin";
  } else if (role === "OWNER" || role === "ADMIN") {
    area = "admin";
  } else if (role === "CAMPUS_REPRESENTATIVE") {
    area = "campus-rep";
  } else if (role === "TEACHER") {
    area = "teacher";
  } else if (role === "VOLUNTEER") {
    area = "volunteer";
  }

  // Clear notifications helper
  const triggerNotification = (success: string | null, error: string | null) => {
    setSuccessMsg(success);
    setErrorMsg(error);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Submit base profile details
  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerNotification(null, null);
    
    updateProfileMutation.mutate({
      firstName,
      lastName,
      phone: phone || null,
    });
  };

  // Submit security details
  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerNotification(null, null);

    if (newPassword !== confirmPassword) {
      setErrorMsg("New passwords do not match.");
      return;
    }

    if (profile?.passwordSet) {
      if (!currentPassword) {
        setErrorMsg("Current password is required.");
        return;
      }
      updateProfileMutation.mutate({
        currentPassword,
        newPassword,
      });
    } else {
      setPasswordMutation.mutate({
        password: newPassword,
      });
    }
  };

  // Submit staff details
  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    triggerNotification(null, null);

    updateStaffMutation.mutate({
      preferredName: preferredName || null,
      gender: gender || null,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      church: church || null,
      churchDepartment: churchDepartment || null,
      yearsServing: yearsServing || null,
      workerStatus: workerStatus || null,
      emergencyContactName: emergencyContactName || null,
      emergencyContactPhone: emergencyContactPhone || null,
      emergencyContactRelationship: emergencyContactRelationship || null,
      medicalConditions: medicalConditions || null,
      allergies: allergies || null,
    });
  };

  // Profile Image Upload / capture handlers
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    triggerNotification(null, null);
    try {
      const compressedFile = await compressImage(file);

      const uploaded = await startPhotoUpload([compressedFile]);
      const url = uploaded?.[0]?.ufsUrl ?? uploaded?.[0]?.url;
      if (!url) {
        throw new Error("Upload failed");
      }

      // Update profile picture URL in DB
      updateProfileMutation.mutate({
        photoUrl: url,
      });
    } catch (err) {
      setErrorMsg("Failed to upload and compress image.");
    }
  };

  // Camera integration handlers
  const startCamera = async () => {
    triggerNotification(null, null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      setCameraStream(stream);
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setErrorMsg("Unable to access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            // Apply crop, resize and background compression
            const compressedBlob = await compressAndResizeImage(blob);
            const compressedFile = new File([compressedBlob], "captured-avatar.jpg", { type: "image/jpeg" });

            const uploaded = await startPhotoUpload([compressedFile]);
            const url = uploaded?.[0]?.ufsUrl ?? uploaded?.[0]?.url;
            if (!url) throw new Error("Capture upload failed");

            // Update photo in user record
            updateProfileMutation.mutate({
              photoUrl: url,
            });

            stopCamera();
          } catch (err) {
            setErrorMsg("Failed to process captured image.");
          }
        }
      }, "image/jpeg");
    }
  };



  return (
    <AppShell area={area}>
      <div className="mx-auto max-w-4xl space-y-6 pb-12">
        <PageHeader
          title="My Profile"
          description="Manage your personal account settings, profile photo, and password."
        />

        {/* Notifications */}
        {successMsg && (
          <div className="rounded-md bg-green-50 p-4 border border-green-200">
            <div className="flex">
              <div className="shrink-0">
                <span className="text-green-500 font-semibold">✓</span>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-green-800">{successMsg}</p>
              </div>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-md bg-red-50 p-4 border border-red-200">
            <div className="flex">
              <div className="shrink-0">
                <span className="text-red-500 font-semibold">✕</span>
              </div>
              <div className="ml-3">
                {formatErrorMessage(errorMsg)}
              </div>
            </div>
          </div>
        )}

        {/* Grid layout containing left menu and right settings card */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          {/* Sidebar Navigation */}
          <div className="flex flex-col space-y-1 md:col-span-1">
            <button
              onClick={() => setActiveTab("info")}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === "info"
                  ? "bg-accent-50 text-accent-700"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              }`}
            >
              <UserIcon className="h-5 w-5 shrink-0" />
              Personal Info
            </button>

            <button
              onClick={() => setActiveTab("photo")}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === "photo"
                  ? "bg-accent-50 text-accent-700"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              }`}
            >
              <PhotoIcon className="h-5 w-5 shrink-0" />
              Profile Photo
            </button>

            <button
              onClick={() => setActiveTab("security")}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === "security"
                  ? "bg-accent-50 text-accent-700"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              }`}
            >
              <KeyIcon className="h-5 w-5 shrink-0" />
              Security
            </button>

            <button
              onClick={() => setActiveTab("appearance")}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === "appearance"
                  ? "bg-accent-50 dark:bg-accent-950/70 text-accent-700 dark:text-accent-300"
                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <SunIcon className="h-5 w-5 shrink-0" />
              Appearance
            </button>

            {isStaff && (
              <button
                onClick={() => setActiveTab("staff")}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === "staff"
                    ? "bg-accent-50 dark:bg-accent-950/70 text-accent-700 dark:text-accent-300"
                    : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <ShieldCheckIcon className="h-5 w-5 shrink-0" />
                Staff Details
              </button>
            )}
          </div>

          {/* Core Content Card */}
          <div className="md:col-span-3">
            {activeTab === "info" && (
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                </CardHeader>
                <CardBody>
                  <form onSubmit={handleSaveInfo} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Input
                        label="First Name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                      />
                      <Input
                        label="Last Name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Input
                        label="Email Address"
                        value={profile?.email ?? ""}
                        disabled
                        helpText="Email addresses cannot be modified directly for tenant security."
                      />
                      <PhoneInput
                        label="Phone Number"
                        value={phone}
                        onChange={(v) => setPhone(v)}
                      />
                    </div>

                    <div className="flex justify-end pt-2 border-t border-neutral-100 mt-4">
                      <Button type="submit" loading={updateProfileMutation.isPending}>
                        Save Details
                      </Button>
                    </div>
                  </form>
                </CardBody>
              </Card>
            )}

            {activeTab === "photo" && (
              <Card>
                <CardHeader>
                  <CardTitle>Profile Photo</CardTitle>
                </CardHeader>
                <CardBody className="space-y-6">
                  <div className="flex flex-col items-center gap-6 sm:flex-row">
                    {profile?.photoUrl ? (
                      <img
                        src={profile.photoUrl}
                        alt="Profile avatar"
                        className="h-28 w-28 rounded-full object-cover border border-neutral-200 shadow-sm"
                      />
                    ) : (
                      <span className="flex h-28 w-28 items-center justify-center rounded-full bg-accent-100 text-3xl font-medium text-accent-700 border border-accent-200">
                        {(profile?.email ?? "U").charAt(0).toUpperCase()}
                      </span>
                    )}

                    <div className="space-y-2 text-center sm:text-left">
                      <h4 className="text-sm font-semibold text-neutral-800">Update Profile Avatar</h4>
                      <p className="text-xs text-neutral-500">
                        Supports camera capture or uploading files. The image will be cropped to square and compressed automatically to keep layouts fast.
                      </p>
                      
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
                        <input
                          type="file"
                          accept="image/*"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<PhotoIcon className="h-4 w-4" />}
                          onClick={() => fileInputRef.current?.click()}
                          disabled={cameraActive || updateProfileMutation.isPending}
                        >
                          Upload Image File
                        </Button>

                        {!cameraActive ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<CameraIcon className="h-4 w-4" />}
                            onClick={startCamera}
                            disabled={updateProfileMutation.isPending}
                          >
                            Use Web Camera
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={stopCamera}
                          >
                            Cancel Camera
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Interactive Camera Area */}
                  {cameraActive && (
                    <div className="flex flex-col items-center gap-4 rounded-lg bg-neutral-900 p-4 border border-neutral-800 shadow-inner">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full max-w-sm rounded-md border border-neutral-700 shadow-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={capturePhoto}
                          loading={updateProfileMutation.isPending}
                        >
                          Capture & Resize Photo
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700"
                          onClick={stopCamera}
                        >
                          Close
                        </Button>
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            )}

            {activeTab === "security" && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>{profile?.passwordSet ? "Change Password" : "Set Password"}</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <form onSubmit={handleSaveSecurity} className="space-y-4">
                      {!profile?.passwordSet && (
                        <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3 text-amber-800 text-xs">
                          🔐 You are using OTP verification. Set a password here to unlock standard username/password sign in.
                        </div>
                      )}

                      {profile?.passwordSet && (
                        <Input
                          type="password"
                          label="Current Password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          required
                        />
                      )}

                      <Input
                        type="password"
                        label="New Password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        helpText="Minimum length is 8 characters."
                      />

                      <Input
                        type="password"
                        label="Confirm New Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />

                      <div className="flex justify-end pt-2 border-t border-neutral-100 mt-4">
                        <Button
                          type="submit"
                          loading={updateProfileMutation.isPending || setPasswordMutation.isPending}
                        >
                          {profile?.passwordSet ? "Update Password" : "Set Password"}
                        </Button>
                      </div>
                    </form>
                  </CardBody>
                </Card>

                {/* Danger Zone */}
                <Card className="mt-6 border-red-200 bg-red-50/5">
                  <CardHeader className="border-b border-red-100 bg-red-50/20">
                    <CardTitle className="text-red-800 font-semibold flex items-center gap-2">
                      <span>⚠️</span> Danger Zone
                    </CardTitle>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    <p className="text-sm text-neutral-600 font-medium">
                      Deleting your account is a permanent action. All your profile details, registrations, and camper profiles will be soft-deleted and placed in the trash.
                    </p>
                    <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-800 font-medium">
                      Note: You will have 60 days to contact support to restore your account before the data is permanently purged.
                    </div>
                    
                    <div className="pt-2 space-y-4">
                      {profile?.passwordSet ? (
                        <Input
                          type="password"
                          label="Enter Password to Confirm Deletion"
                          value={deleteConfirmPassword}
                          onChange={(e) => setDeleteConfirmPassword(e.target.value)}
                          placeholder="Your current password"
                        />
                      ) : (
                        <div className="space-y-3">
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isDeleteCheckboxChecked}
                              onChange={(e) => setIsDeleteCheckboxChecked(e.target.checked)}
                              className="mt-1 h-4 w-4 rounded border-neutral-300 text-red-600 focus:ring-red-500"
                            />
                            <span className="text-xs text-neutral-700 font-medium select-none">
                              I confirm that I want to delete my account and all associated camper registrations.
                            </span>
                          </label>
                          <Input
                            label="Type 'DELETE' to confirm"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            placeholder="DELETE"
                          />
                        </div>
                      )}
                      
                      <div className="flex justify-start">
                        <Button
                          variant="danger"
                          onClick={handleDeleteAccount}
                        >
                          Delete Account Permanently
                        </Button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </>
            )}

            {activeTab === "appearance" && <ThemeSettingsCard />}

            {activeTab === "staff" && isStaff && (
              <Card>
                <CardHeader>
                  <CardTitle>Staff Profile & Details</CardTitle>
                </CardHeader>
                <CardBody>
                  <form onSubmit={handleSaveStaff} className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-100 pb-1 mb-2">Personal Settings</h4>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <Input
                        label="Preferred Name"
                        value={preferredName}
                        onChange={(e) => setPreferredName(e.target.value)}
                      />
                      <Select
                        label="Gender"
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                      >
                        <option value="">Select...</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                      </Select>
                      <Input
                        type="date"
                        label="Date of Birth"
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                      />
                    </div>

                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-100 pb-1 pt-4 mb-2">Church Information</h4>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Input
                        label="Home Church"
                        value={church}
                        onChange={(e) => setChurch(e.target.value)}
                      />
                      <Input
                        label="Church Department"
                        value={churchDepartment}
                        onChange={(e) => setChurchDepartment(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Input
                        label="Years Serving"
                        value={yearsServing}
                        onChange={(e) => setYearsServing(e.target.value)}
                      />
                      <Input
                        label="Worker Status"
                        value={workerStatus}
                        onChange={(e) => setWorkerStatus(e.target.value)}
                      />
                    </div>

                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-100 pb-1 pt-4 mb-2">Emergency Contact</h4>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <Input
                        label="Emergency Contact Name"
                        value={emergencyContactName}
                        onChange={(e) => setEmergencyContactName(e.target.value)}
                      />
                      <PhoneInput
                        label="Emergency Phone"
                        value={emergencyContactPhone}
                        onChange={(v) => setEmergencyContactPhone(v)}
                      />
                      <Input
                        label="Relationship"
                        value={emergencyContactRelationship}
                        onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                      />
                    </div>

                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-100 pb-1 pt-4 mb-2">Medical Notes</h4>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Input
                        label="Allergies"
                        value={allergies}
                        onChange={(e) => setAllergies(e.target.value)}
                      />
                      <Input
                        label="Medical Conditions"
                        value={medicalConditions}
                        onChange={(e) => setMedicalConditions(e.target.value)}
                      />
                    </div>

                    <div className="flex justify-end pt-2 border-t border-neutral-100 mt-4">
                      <Button type="submit" loading={updateStaffMutation.isPending}>
                        Save Staff Details
                      </Button>
                    </div>
                  </form>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Delete Account Confirmation Dialog */}
      <Dialog
        open={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        title="Confirm Account Deletion"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Are you absolutely sure you want to delete your account? This action is highly destructive and will log you out immediately.
          </p>
          <p className="text-xs text-red-600 font-semibold bg-red-50 p-2.5 rounded border border-red-200">
            ⚠️ WARNING: All your registered campers, applications, and documents will be soft-deleted.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsDeleteConfirmOpen(false)}
              disabled={deleteSelfMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleteSelfMutation.isPending}
              onClick={executeDeleteAccount}
            >
              Confirm Delete
            </Button>
          </div>
        </div>
      </Dialog>
    </AppShell>
  );
}
