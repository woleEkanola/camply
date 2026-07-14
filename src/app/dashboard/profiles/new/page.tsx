"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function NewProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Get the campus for the new profile from the current user's connected camper
  const { data: userProfiles } = api.camper.getByUser.useQuery(
    { userId: session?.user?.id ?? "" },
    { enabled: !!session?.user?.id }
  );

  // Fetch the main user record to get homeCampusId
  const { data: userRecord } = api.user.getById.useQuery(
    { id: session?.user?.id ?? "" },
    { enabled: !!session?.user?.id }
  );

  // Use the user's main homeCampusId from their user record
  const userHomeCampusId = userRecord?.homeCampusId || "";

  const [formData, setFormData] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
    homeCampusId: userHomeCampusId,
  });

  // Keep formData.homeCampusId in sync if userHomeCampusId changes
  useEffect(() => {
    if (userHomeCampusId && formData.homeCampusId !== userHomeCampusId) {
      setFormData(prev => ({ ...prev, homeCampusId: userHomeCampusId }));
    }
  }, [userHomeCampusId]);

  // Redirect if not authenticated or not a PARENT
  useEffect(() => {
    if (status === "loading") return;
    
    if (!session) {
      router.push("/login");
    } else if (session.user.role !== "PARENT" && session.user.role !== "ADMIN") {
      // If not a parent, redirect to appropriate dashboard
      if (session.user.role === "SUPER_ADMIN") {
        router.push("/super-admin");
      } else if (session.user.role === "OWNER") {
        router.push("/admin");
      }
    }
  }, [session, status, router]);
  
  // Create profile mutation (no registration will be created here)
  const createProfileMutation = api.camper.create.useMutation({
    onSuccess: (data) => {
      setSuccess("Profile created successfully!");
      setIsSubmitting(false);
      // Redirect to the profile page after a short delay
      setTimeout(() => {
        router.push(`/dashboard/profiles/${data.id}`);
      }, 2000);
    },
    onError: (error) => {
      // Enhanced error handling for age validation
      let msg = 'Unknown error';
      if ('message' in error) {
        // Try to detect age validation error
        if (typeof error.message === 'string' && error.message.includes('Camper age')) {
          msg = error.message;
        } else {
          msg = error.message;
        }
      }
      setError(msg);
      setIsSubmitting(false);
    }
  });
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);
    
    if (!formData.firstName.trim()) {
      setError("First Name is required");
      setIsSubmitting(false);
      return;
    }
    
    if (!formData.lastName.trim()) {
      setError("Last Name is required");
      setIsSubmitting(false);
      return;
    }
    
    if (!formData.dateOfBirth) {
      setError("Date of birth is required");
      setIsSubmitting(false);
      return;
    }
    
    if (!formData.gender) {
      setError("Gender is required");
      setIsSubmitting(false);
      return;
    }
    
    if (!session?.user?.id) {
      setError("You must be logged in to create a profile");
      setIsSubmitting(false);
      return;
    }
    
    const combinedName = `${formData.firstName.trim()} ${formData.middleName.trim()} ${formData.lastName.trim()}`
      .trim()
      .replace(/\s+/g, ' ');

    try {
      createProfileMutation.mutate({
        profile: {
          name: combinedName,
          firstName: formData.firstName.trim(),
          middleName: formData.middleName.trim() || undefined,
          lastName: formData.lastName.trim(),
          dateOfBirth: formData.dateOfBirth,
          gender: formData.gender,
          // Always use user's main homeCampusId for profile creation
          homeCampusId: userHomeCampusId,
          organizationId: session.user.organizationId ?? "",
          userId: session.user.id,
        },
        fieldValues: []
      });
    } catch (err) {
      console.error("Submit error:", err);
      setError(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setIsSubmitting(false);
    }
  };
  
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-emerald-500"></div>
      </div>
    );
  }
  
  if (!session) {
    return null; // Will be redirected by useEffect
  }
  
  return (
    <AppShell area="dashboard">
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Create Camper" />
        <Card>
          <CardBody>
            {error && <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700">{error}</div>}
            {success && <div className="mb-4 rounded-md bg-success-50 p-4 text-sm text-success-700">{success}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="First Name" name="firstName" value={formData.firstName} onChange={handleInputChange} required />
                <Input label="Middle Name" name="middleName" value={formData.middleName} onChange={handleInputChange} />
                <Input label="Last Name" name="lastName" value={formData.lastName} onChange={handleInputChange} required />
              </div>
              <Input label="Date of Birth" type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleInputChange} required />
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Gender</label>
                <div className="mt-1 flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input type="radio" name="gender" value="Male" checked={formData.gender === 'Male'} onChange={handleInputChange} required />
                    Male
                  </label>
                  <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input type="radio" name="gender" value="Female" checked={formData.gender === 'Female'} onChange={handleInputChange} required />
                    Female
                  </label>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" loading={isSubmitting}>Create Profile</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
