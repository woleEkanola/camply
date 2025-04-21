"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../utils/api";
import type { UserRole } from "@prisma/client";
import Link from "next/link";
import React from "react";

// This is a debug component to test if the token is being passed correctly
function DebugComponent({ token }: { token: string }) {
  const [debugState, setDebugState] = useState<string>(`Token received: ${token}`);
  
  // Use tRPC client directly for debugging
  const { data, isLoading, error } = api.signupLink.validateToken.useQuery(
    { token },
    {
      retry: false,
    }
  );
  
  useEffect(() => {
    console.log("DEBUG COMPONENT MOUNTED");
    console.log("Token in debug component:", token);
    
    // Log the current state for debugging
    if (isLoading) {
      console.log("Token validation is loading...");
    }
    if (error) {
      console.error("Token validation error:", error);
      setDebugState(prev => `${prev}\nToken validation error: ${error.message}`);
    }
    if (data) {
      console.log("Token validation data:", data);
      setDebugState(prev => `${prev}\nToken validation success: ${JSON.stringify(data, null, 2)}`);
    }
  }, [token, isLoading, error, data]);
  
  return (
    <div className="bg-white p-6 rounded-lg shadow-md my-4">
      <h2 className="text-xl font-semibold mb-4">Debug Information</h2>
      <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-sm">
        {debugState}
      </pre>
      <div className="mt-4">
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}

// Interface for form data
interface SignupFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  camperName: string;
}

// Client component that handles all the actual logic
function SignupForm({ token }: { token: string }) {
  console.log("SignupForm rendering with token:", token);
  const router = useRouter();
  
  const [formData, setFormData] = useState<SignupFormData>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    camperName: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkDetails, setLinkDetails] = useState<{
    locationId: string;
    locationName: string;
    organizationId: string;
    organizationName: string;
    yearId: string;
    yearName: string;
  } | null>(null);
  const [isLinkValid, setIsLinkValid] = useState<boolean | null>(null);

  useEffect(() => {
    console.log("Component mounted with token:", token);
  }, [token]);

  // Use tRPC client directly
  const { 
    data: tokenData, 
    isLoading: isValidatingToken,
    error: tokenError
  } = api.signupLink.validateToken.useQuery(
    { token },
    {
      retry: false,
    }
  );

  // Handle token validation results
  useEffect(() => {
    if (tokenData) {
      console.log('Token validation success:', tokenData);
      if (!tokenData.organizationId) {
        console.error("organizationId is missing from tRPC response", tokenData);
        setIsLinkValid(false);
        setError("Organization ID is missing from the signup link");
        return;
      }
      setLinkDetails(tokenData);
      setIsLinkValid(true);
    }
    
    // Handle token validation errors
    if (tokenError) {
      console.error('Token validation error:', tokenError);
      setIsLinkValid(false);
      setError(tokenError.message || "Invalid or inactive signup link");
    }
  }, [tokenData, tokenError]);

  // Create user mutation
  const createUserMutation = api.auth.signup.useMutation({
    onSuccess: async (data) => {
      if (data.success) {
        setSuccess("Account created successfully! Creating camper profile and registration...");
        
        // Create camper profile using the public procedure
        try {
          const profile = await createCamperProfileMutation.mutateAsync({
            name: formData.camperName,
            userId: data.userId!,
            organizationId: linkDetails!.organizationId,
            locationId: linkDetails!.locationId,
          });
          
          // Create registration using the public procedure
          if (profile) {
            await createRegistrationMutation.mutateAsync({
              camperProfileId: profile.id,
              yearId: linkDetails!.yearId,
              locationId: linkDetails!.locationId,
              status: "PENDING",
            });
            
            setSuccess("Registration complete! You can now login.");
            setTimeout(() => {
              router.push("/login");
            }, 3000);
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
          setError(`Error creating profile: ${errorMessage}`);
        }
        
        setIsSubmitting(false);
      } else {
        setError(data.message || "Failed to create account");
        setIsSubmitting(false);
      }
    },
    onError: (error) => {
      setError(`Error creating account: ${error.message}`);
      setIsSubmitting(false);
    }
  });
  
  // Create camper profile mutation (using the public procedure)
  const createCamperProfileMutation = api.camperProfile.createDuringSignup.useMutation();
  
  // Create registration mutation (using the public procedure)
  const createRegistrationMutation = api.registration.createDuringSignup.useMutation();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    // Validate form data
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password || !formData.camperName) {
      setError("All fields are required");
      setIsSubmitting(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setIsSubmitting(false);
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters long");
      setIsSubmitting(false);
      return;
    }

    if (!linkDetails) {
      setError("Invalid signup link");
      setIsSubmitting(false);
      return;
    }

    console.log("Link details before submission:", JSON.stringify(linkDetails, null, 2));
    
    if (!linkDetails.organizationId) {
      setError("Organization ID is missing from the signup link");
      setIsSubmitting(false);
      return;
    }

    console.log("Creating user with organization:", linkDetails.organizationId);
    
    try {
      // Create user with BASE_USER role
      const userData = {
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: "BASE_USER" as UserRole,
        organizationId: linkDetails.organizationId,
      };
      
      console.log("User data before submission:", JSON.stringify(userData, null, 2));
      
      if (!userData.organizationId) {
        throw new Error("Organization ID is undefined. Cannot create user without organization.");
      }
      
      console.log("Submitting user data:", userData);
      
      createUserMutation.mutate(userData, {
        onError: (error) => {
          console.error("Mutation error:", error);
          setError(`Error creating account: ${error.message}`);
          setIsSubmitting(false);
        }
      });
    } catch (err) {
      console.error("Submit error:", err);
      setError(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setIsSubmitting(false);
    }
  };

  if (isValidatingToken) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="mt-6 text-3xl font-extrabold text-gray-900">Validating signup link...</h2>
            <div className="mt-4 flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-emerald-500"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLinkValid === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="mt-6 text-3xl font-extrabold text-gray-900">Invalid Signup Link</h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              This signup link is invalid or has expired.
            </p>
            <div className="mt-4">
              <Link href="/login" className="text-emerald-600 hover:text-emerald-500">
                Go to Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      {/* Add the debug component at the top */}
      <DebugComponent token={token} />
      
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign up for {linkDetails?.organizationName || "..."}
          </h2>
          {linkDetails && (
            <p className="mt-2 text-center text-sm text-gray-600">
              {linkDetails.locationName} - {linkDetails.yearName}
            </p>
          )}
        </div>
        
        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
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
          <div className="rounded-md bg-green-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">Success</h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>{success}</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {isLinkValid && (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4 rounded-md shadow-sm">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                  First Name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-emerald-500 sm:text-sm"
                  value={formData.firstName}
                  onChange={handleInputChange}
                />
              </div>
              
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                  Last Name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-emerald-500 sm:text-sm"
                  value={formData.lastName}
                  onChange={handleInputChange}
                />
              </div>
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-emerald-500 sm:text-sm"
                  value={formData.email}
                  onChange={handleInputChange}
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-emerald-500 sm:text-sm"
                  value={formData.password}
                  onChange={handleInputChange}
                />
                <p className="mt-1 text-xs text-gray-500">Password must be at least 8 characters long</p>
              </div>
              
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-emerald-500 sm:text-sm"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                />
              </div>
              
              <div>
                <label htmlFor="camperName" className="block text-sm font-medium text-gray-700">
                  Camper Name
                </label>
                <input
                  id="camperName"
                  name="camperName"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-emerald-500 sm:text-sm"
                  value={formData.camperName}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            
            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="group relative flex w-full justify-center rounded-md border border-transparent bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-75"
              >
                {isSubmitting ? 'Creating Account...' : 'Sign Up'}
              </button>
            </div>
            
            <div className="text-center text-sm">
              <Link href="/login" className="text-emerald-600 hover:text-emerald-500">
                Already have an account? Log in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Page component that handles the React.use() and passes the token
export default function SignupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = React.use(params);
  console.log("SignupPage received token:", token);
  return <SignupForm token={token} />;
}
