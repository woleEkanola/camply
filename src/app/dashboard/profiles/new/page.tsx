"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/api";
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
  
  // Get the location for the new profile from the current user's connected camper profile
  const { data: userProfiles } = api.camperProfile.getByUser.useQuery(
    { userId: session?.user?.id ?? "" },
    { enabled: !!session?.user?.id }
  );

  // Fetch the main user record to get locationId
  const { data: userRecord } = api.user.getById.useQuery(
    { id: session?.user?.id ?? "" },
    { enabled: !!session?.user?.id }
  );

  // Use the user's main locationId from their user record
  const userLocationId = userRecord?.locationId || "";

  const [formData, setFormData] = useState({
    name: "",
    dateOfBirth: "",
    gender: "",
    locationId: userLocationId,
  });

  // Keep formData.locationId in sync if userLocationId changes
  useEffect(() => {
    if (userLocationId && formData.locationId !== userLocationId) {
      setFormData(prev => ({ ...prev, locationId: userLocationId }));
    }
  }, [userLocationId]);

  // Redirect if not authenticated or not a BASE_USER
  useEffect(() => {
    if (status === "loading") return;
    
    if (!session) {
      router.push("/login");
    } else if (session.user.role !== "ADMIN") {
      // If not a base user, redirect to appropriate dashboard
      if (session.user.role === "SUPER_ADMIN") {
        router.push("/super-admin");
      } else if (session.user.role === "OWNER") {
        router.push("/admin");
      }
    }
  }, [session, status, router]);
  
  // Create profile mutation (no registration will be created here)
  const createProfileMutation = api.camperProfile.create.useMutation({
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
    
    if (!formData.name) {
      setError("Name is required");
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
    
    try {
      createProfileMutation.mutate({
        profile: {
          name: formData.name,
          dateOfBirth: formData.dateOfBirth,
          gender: formData.gender,
          // Always use user's main locationId for profile creation
          locationId: userLocationId,
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
        <PageHeader title="Create Camper Profile" />
        <Card>
          <CardBody>
            {error && <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700">{error}</div>}
            {success && <div className="mb-4 rounded-md bg-success-50 p-4 text-sm text-success-700">{success}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Camper Name" name="name" value={formData.name} onChange={handleInputChange} required />
              <Input label="Date of Birth" type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleInputChange} required />
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Gender</label>
                <div className="mt-1 flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-neutral-700">
                    <input type="radio" name="gender" value="Male" checked={formData.gender === 'Male'} onChange={handleInputChange} required />
                    Male
                  </label>
                  <label className="flex items-center gap-2 text-sm text-neutral-700">
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
