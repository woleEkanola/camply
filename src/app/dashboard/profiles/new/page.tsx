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
  
  const [formData, setFormData] = useState({
    name: "",
    locationId: "",
  });
  
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
  
  // Get all locations for the dropdown
  const { data: locations, isLoading: isLoadingLocations, error: locationsError } = api.location.getAll.useQuery(
    undefined,
    {
      enabled: !!session?.user?.id,
    }
  );
  
  // Handle errors with useEffect
  useEffect(() => {
    if (locationsError) {
      console.error("Error fetching locations:", locationsError);
    }
  }, [locationsError]);
  
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
    
    if (!formData.locationId) {
      setError("Location is required");
      setIsSubmitting(false);
      return;
    }
    
    if (!session?.user?.id) {
      setError("You must be logged in to create a profile");
      setIsSubmitting(false);
      return;
    }
    
    // Get the organization ID from the selected location
    const selectedLocation = locations?.find(loc => loc.id === formData.locationId);
    if (!selectedLocation) {
      setError("Invalid location selected");
      setIsSubmitting(false);
      return;
    }
    
    try {
      createProfileMutation.mutate({
        profile: {
          name: formData.name,
          locationId: formData.locationId,
          organizationId: selectedLocation.organizationId,
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
  
  if (status === "loading" || isLoadingLocations) {
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
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">Create New Camper Profile</h1>
            <Link
              href="/dashboard"
              className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>
      
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="md:grid md:grid-cols-3 md:gap-6">
          <div className="md:col-span-1">
            <div className="px-4 sm:px-0">
              <h3 className="text-lg font-medium leading-6 text-gray-900">Profile Information</h3>
              <p className="mt-1 text-sm text-gray-600">
                Create a new camper profile. You can add multiple profiles for different campers.
              </p>
            </div>
          </div>
          
          <div className="mt-5 md:col-span-2 md:mt-0">
            {error && (
              <div className="mb-4 rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {success && (
              <div className="mb-4 rounded-md bg-green-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">Success</h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p>{success}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <form onSubmit={handleSubmit}>
              <div className="overflow-hidden shadow sm:rounded-md">
                <div className="bg-white px-4 py-5 sm:p-6">
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
                      <label htmlFor="locationId" className="block text-sm font-medium text-gray-700">
                        Location
                      </label>
                      <select
                        id="locationId"
                        name="locationId"
                        value={formData.locationId}
                        onChange={handleInputChange}
                        className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-emerald-500 sm:text-sm"
                        required
                      >
                        <option value="">Select a location</option>
                        {locations?.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 px-4 py-3 text-right sm:px-6">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex justify-center rounded-md border border-transparent bg-emerald-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    {isSubmitting ? "Creating..." : "Create Profile"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
