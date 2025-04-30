"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/api";
import Link from "next/link";

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

  // Find the first profile with a locationId
  const connectedLocationId = userProfiles?.find(p => p.locationId)?.locationId || "";

  const [formData, setFormData] = useState({
    name: "",
    dateOfBirth: "",
    gender: "",
    locationId: connectedLocationId,
  });

  // Keep formData.locationId in sync if connectedLocationId changes
  useEffect(() => {
    if (connectedLocationId && formData.locationId !== connectedLocationId) {
      setFormData(prev => ({ ...prev, locationId: connectedLocationId }));
    }
  }, [connectedLocationId]);

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
    onError: (error: Error) => {
      setError(`Error creating profile: ${error.message}`);
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
          locationId: formData.locationId,
          organizationId: session.user.organizationId,
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Create Camper Profile</h1>
        </div>
      </header>
      <main>
        <div className="mx-auto max-w-2xl py-6 sm:px-6 lg:px-8">
          <div className="bg-white p-6 rounded shadow">
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-6 gap-6">
                <div className="col-span-6 sm:col-span-4">
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Camper Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    id="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm"
                    required
                  />
                </div>
                <div className="col-span-6 sm:col-span-4">
                  <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    name="dateOfBirth"
                    id="dateOfBirth"
                    value={formData.dateOfBirth}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm"
                    required
                  />
                </div>
                <div className="col-span-6 sm:col-span-4">
                  <label className="block text-sm font-medium text-gray-700">Gender</label>
                  <div className="flex gap-4 items-center mt-1">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="gender"
                        value="Male"
                        checked={formData.gender === 'Male'}
                        onChange={handleInputChange}
                        required
                      />
                      Male
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="gender"
                        value="Female"
                        checked={formData.gender === 'Female'}
                        onChange={handleInputChange}
                        required
                      />
                      Female
                    </label>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 text-right sm:px-6 mt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex justify-center rounded-md border border-transparent bg-emerald-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
