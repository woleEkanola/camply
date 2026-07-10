"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../utils/trpc";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { DynamicFieldGroup } from "@/components/forms/DynamicFieldGroup";
import type { FormFieldDTO } from "@/components/forms/types";
// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "CAMPUS_REPRESENTATIVE";
import Link from "next/link";
import React from "react";
import { useQuery } from '@tanstack/react-query';

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
interface CamperData {
  name: string;
  dob: string;
  gender: string;
}

// Client component that handles all the actual logic
function SignupForm({ token }: { token: string }) {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'otp' | 'profile'>('email');
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Use tRPC to validate the signup link token
  const {
    data: signupLinkData,
    isLoading: isSignupLinkLoading,
    error: signupLinkError
  } = api.signupLink.validateToken.useQuery({ token }, { retry: false });

  const createDraft = api.registration.createDraft.useMutation();

  const organizationId = signupLinkData?.organizationId ?? "";
  const { data: fields = [] } = api.formField.list.useQuery(
    { organizationId, audience: "CAMPER" },
    { enabled: !!organizationId && step === 'profile' }
  );
  const visibleFields = fields.filter((f: FormFieldDTO) => f.visible);

  function setValue(key: string, value: unknown) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  if (isSignupLinkLoading) {
    return (
      <>
        {/* Mobile View */}
        <div className="md:hidden relative h-screen overflow-hidden font-sans">
          {/* Full screen orange background with image */}
          <div className="absolute inset-0 bg-[#E67E22] flex flex-col items-center">
            {/* Logo and group image positioning */}
            <div className="mt-6 mb-6">
              <Image src="/logo.png" alt="Logo" width={100} height={100} />
            </div>
            
            <div className="w-full relative mt-4">
              <div className="w-full">
                <Image
                  src="/group_pix.png"
                  alt="Group"
                  width={700}
                  height={280}
                  className="w-full object-contain max-h-[35vh]"
                  priority
                />
              </div>
            </div>
          </div>

          {/* Loading indicator with higher z-index */}
          <div className="absolute inset-x-0 bottom-[20%] z-10 flex justify-center">
            <div className="w-[85%] bg-white p-6 rounded-2xl shadow-lg text-center">
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#E67E22]"></div>
              </div>
              <p className="mt-4 text-gray-700">Validating signup link...</p>
            </div>
          </div>
          
          {/* Jesus Tribe text below login form with reduced size */}
          <div className="absolute inset-x-0 bottom-[5%] z-10 flex justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-wide text-white">JESUS TRIBE</h1>
              <h2 className="text-lg font-medium mt-1 text-white">Teens Camp</h2>
            </div>
          </div>
        </div>

        {/* Desktop View */}
        <div className="hidden md:flex h-screen overflow-hidden font-sans">
          <div className="w-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#E67E22] mb-4"></div>
            <p className="ml-3">Validating signup link...</p>
          </div>
        </div>
      </>
    );
  }

  if (signupLinkError) {
    return (
      <>
        {/* Mobile View */}
        <div className="md:hidden relative h-screen overflow-hidden font-sans">
          {/* Full screen orange background with image */}
          <div className="absolute inset-0 bg-[#E67E22] flex flex-col items-center">
            {/* Logo and group image positioning */}
            <div className="mt-6 mb-6">
              <Image src="/logo.png" alt="Logo" width={100} height={100} />
            </div>
            
            <div className="w-full relative mt-4">
              <div className="w-full">
                <Image
                  src="/group_pix.png"
                  alt="Group"
                  width={700}
                  height={280}
                  className="w-full object-contain max-h-[35vh]"
                  priority
                />
              </div>
            </div>
          </div>

          {/* Error message with higher z-index */}
          <div className="absolute inset-x-0 bottom-[20%] z-10 flex justify-center">
            <div className="w-[85%] bg-white p-6 rounded-2xl shadow-lg">
              <h2 className="text-xl font-bold text-center mb-4 text-gray-800">Invalid Signup Link</h2>
              <div className="bg-red-100 p-4 rounded-lg text-red-700 mb-6">
                {signupLinkError.message || "The signup link is invalid or has expired."}
              </div>
              <Link href="/login" className="block w-full text-center py-3 bg-[#E67E22] text-white rounded-full hover:bg-[#D35400] transition">
                Go to Login
              </Link>
            </div>
          </div>
          
          {/* Jesus Tribe text below form with reduced size */}
          <div className="absolute inset-x-0 bottom-[5%] z-10 flex justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-wide text-white">JESUS TRIBE</h1>
              <h2 className="text-lg font-medium mt-1 text-white">Teens Camp</h2>
            </div>
          </div>
        </div>

        {/* Desktop View - Original Layout */}
        <div className="hidden md:flex h-screen overflow-hidden font-sans">
          {/* Left Panel */}
          <div className="w-[50%] h-full flex items-center justify-center p-4">
            <div className="ml-[5%] w-[76%] h-[90vh] bg-[#E67E22] flex flex-col items-center justify-center p-6 text-white rounded-2xl">
              <h1 className="text-4xl md:text-5xl font-bold tracking-wide">JESUS TRIBE</h1>
              <h2 className="text-2xl md:text-3xl font-medium mt-1">Teens Camp</h2>

              <div className="my-4 md:my-6">
                <Image src="/logo.png" alt="Logo" width={120} height={120} />
              </div>

              <div className="w-full flex-grow flex items-center justify-center max-h-[40vh] relative">
                <div className="absolute w-[120%] left-1/2 -translate-x-1/2">
                  <Image
                    src="/group_pix.png"
                    alt="Group"
                    width={700}
                    height={280}
                    className="rounded-lg w-full object-contain"
                    priority
                  />
                </div>
              </div>
            </div>
          </div>
          {/* Right Panel */}
          <div className="w-[44%] h-full flex items-center justify-center bg-[#FDFDFD] p-4">
            <div className="w-full max-w-md bg-white p-6 md:p-8 rounded-2xl shadow-lg">
              <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Invalid Signup Link</h2>
              <div className="bg-red-100 p-4 rounded-lg text-red-700 mb-6">
                {signupLinkError.message || "The signup link is invalid or has expired."}
              </div>
              <Link href="/login" className="block w-full text-center py-3 bg-[#E67E22] text-white rounded-full hover:bg-[#D35400] transition">
                Go to Login
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Step 1: Collect Email and create user, send OTP
  if (step === 'email') {
    return (
      <>
        {/* Mobile View */}
        <div className="md:hidden relative h-screen overflow-hidden font-sans">
          {/* Full screen orange background with image */}
          <div className="absolute inset-0 bg-[#E67E22] flex flex-col items-center">
            {/* Logo and group image positioning */}
            <div className="mt-6 mb-6">
              <Image src="/logo.png" alt="Logo" width={100} height={100} />
            </div>
            
            <div className="w-full relative mt-4">
              <div className="w-full">
                <Image
                  src="/group_pix.png"
                  alt="Group"
                  width={700}
                  height={280}
                  className="w-full object-contain max-h-[35vh]"
                  priority
                />
              </div>
            </div>
          </div>

          {/* Email form with higher z-index */}
          <div className="absolute inset-x-0 bottom-[20%] z-10 flex justify-center">
            <div className="w-[85%] bg-white p-6 rounded-2xl shadow-lg">
              <h2 className="text-xl font-bold text-center mb-6 text-gray-800">Sign Up</h2>
              
              {error && (
                <div className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              
              <form onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setIsLoading(true);
                try {
                  const res = await fetch('/api/base-user/create-and-send-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      email, 
                      organizationId: signupLinkData?.organizationId,
                      campusId: signupLinkData?.campusId,
                      campId: signupLinkData?.campId
                    }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setStep('otp');
                  } else {
                    setError(data.message || 'Failed to create account');
                  }
                } catch (err) {
                  setError('Network error. Please try again.');
                } finally {
                  setIsLoading(false);
                }
              }}>
                <div className="mb-5">
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-[#E67E22] focus:ring-[#E67E22] focus:outline-none shadow-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-full bg-[#E67E22] text-white py-3 font-medium hover:bg-[#D35400] transition disabled:opacity-50"
                >
                  {isLoading ? "Sending..." : "Next"}
                </button>
              </form>
            </div>
          </div>
          
          {/* Jesus Tribe text below form with reduced size */}
          <div className="absolute inset-x-0 bottom-[5%] z-10 flex justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-wide text-white">JESUS TRIBE</h1>
              <h2 className="text-lg font-medium mt-1 text-white">Teens Camp</h2>
            </div>
          </div>
        </div>

        {/* Desktop View - Original Layout */}
        <div className="hidden md:flex h-screen overflow-hidden font-sans">
          {/* Left Panel */}
          <div className="w-[50%] h-full flex items-center justify-center p-4">
            <div className="ml-[5%] w-[76%] h-[90vh] bg-[#E67E22] flex flex-col items-center justify-center p-6 text-white rounded-2xl">
              <h1 className="text-4xl md:text-5xl font-bold tracking-wide">JESUS TRIBE</h1>
              <h2 className="text-2xl md:text-3xl font-medium mt-1">Teens Camp</h2>

              <div className="my-4 md:my-6">
                <Image src="/logo.png" alt="Logo" width={120} height={120} />
              </div>

              <div className="w-full flex-grow flex items-center justify-center max-h-[40vh] relative">
                <div className="absolute w-[120%] left-1/2 -translate-x-1/2">
                  <Image
                    src="/group_pix.png"
                    alt="Group"
                    width={700}
                    height={280}
                    className="rounded-lg w-full object-contain"
                    priority
                  />
                </div>
              </div>
            </div>
          </div>
          {/* Right Panel */}
          <div className="w-[44%] h-full flex items-center justify-center bg-[#FDFDFD] p-4">
            <div className="w-full max-w-md bg-white p-6 md:p-8 rounded-2xl shadow-lg">
              <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Sign Up</h2>
              
              {error && (
                <div className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              
              <form onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setIsLoading(true);
                try {
                  const res = await fetch('/api/base-user/create-and-send-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      email, 
                      organizationId: signupLinkData?.organizationId,
                      campusId: signupLinkData?.campusId,
                      campId: signupLinkData?.campId
                    }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setStep('otp');
                  } else {
                    setError(data.message || 'Failed to create account');
                  }
                } catch (err) {
                  setError('Network error. Please try again.');
                } finally {
                  setIsLoading(false);
                }
              }}>
                <div className="mb-5">
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-[#E67E22] focus:ring-[#E67E22] focus:outline-none shadow-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-full bg-[#E67E22] text-white py-3 font-medium hover:bg-[#D35400] transition disabled:opacity-50"
                >
                  {isLoading ? "Sending..." : "Next"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Step 2: Verify OTP
  if (step === 'otp') {
    return (
      <div className="flex h-screen overflow-hidden font-sans">
        {/* Left Panel */}
        <div className="w-[50%] h-full flex items-center justify-center p-4">
          <div className="ml-[5%] w-[76%] h-[90vh] bg-[#E67E22] flex flex-col items-center justify-center p-6 text-white rounded-2xl">
            <h1 className="text-4xl md:text-5xl font-bold tracking-wide">JESUS TRIBE</h1>
            <h2 className="text-2xl md:text-3xl font-medium mt-1">Teens Camp</h2>

            <div className="my-4 md:my-6">
              <Image src="/logo.png" alt="Logo" width={120} height={120} />
            </div>

            <div className="w-full flex-grow flex items-center justify-center max-h-[40vh] relative">
              <div className="absolute w-[120%] left-1/2 -translate-x-1/2">
                <Image
                  src="/group_pix.png"
                  alt="Group"
                  width={700}
                  height={280}
                  className="rounded-lg w-full object-contain"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
        {/* Right Panel */}
        <div className="w-[44%] h-full flex items-center justify-center bg-[#FDFDFD] p-4">
          <div className="w-full max-w-md bg-white p-6 md:p-8 rounded-2xl shadow-lg">
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Verify OTP</h2>
            
            {error && (
              <div className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              setIsLoading(true);
              setError("");
              try {
                // Verify OTP
                const res = await fetch('/api/base-user/verify-otp', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email, otp }),
                });
                const data = await res.json();
                if (!res.ok) {
                  setError(data.message || 'Invalid OTP');
                  setIsLoading(false);
                  return;
                }
                // Sign in with OTP to establish a session, then proceed to
                // the profile step — do NOT redirect to /dashboard here.
                // (This used to race: signIn+router.push('/dashboard') ran
                // unconditionally right after setStep('profile'), often
                // navigating away before the profile step ever rendered.)
                const signInResult = await signIn("credentials", {
                  redirect: false,
                  email,
                  otp,
                });
                if (!signInResult?.ok) {
                  setError("Failed to sign in after OTP verification.");
                  setIsLoading(false);
                  return;
                }
                setStep('profile');
                setIsLoading(false);
              } catch (err) {
                setError('Network error. Please try again.');
                setIsLoading(false);
              }
            }}>
              <div className="mb-5">
                <input 
                  type="text" 
                  placeholder="Enter OTP code"
                  value={otp} 
                  onChange={e => setOtp(e.target.value)} 
                  required 
                  className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-[#E67E22] focus:ring-[#E67E22] focus:outline-none shadow-sm"
                />
              </div>
              <button 
                className="w-full rounded-full bg-[#E67E22] text-white py-3 font-medium hover:bg-[#D35400] transition disabled:opacity-50" 
                type="submit" 
                disabled={isLoading}
              >
                {isLoading ? 'Verifying...' : 'Verify OTP'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Update Profile (name, dob, gender, dynamic fields)
  if (step === 'profile') {
    return (
      <div className="flex h-screen overflow-hidden font-sans">
        {/* Left Panel */}
        <div className="w-[50%] h-full flex items-center justify-center p-4">
          <div className="ml-[5%] w-[76%] h-[90vh] bg-[#E67E22] flex flex-col items-center justify-center p-6 text-white rounded-2xl">
            <h1 className="text-4xl md:text-5xl font-bold tracking-wide">JESUS TRIBE</h1>
            <h2 className="text-2xl md:text-3xl font-medium mt-1">Teens Camp</h2>

            <div className="my-4 md:my-6">
              <Image src="/logo.png" alt="Logo" width={120} height={120} />
            </div>

            <div className="w-full flex-grow flex items-center justify-center max-h-[40vh] relative">
              <div className="absolute w-[120%] left-1/2 -translate-x-1/2">
                <Image
                  src="/group_pix.png"
                  alt="Group"
                  width={700}
                  height={280}
                  className="rounded-lg w-full object-contain"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
        {/* Right Panel */}
        <div className="w-[44%] h-full flex items-center justify-center bg-[#FDFDFD] p-4">
          <div className="w-full max-w-md bg-white p-6 md:p-8 rounded-2xl shadow-lg overflow-y-auto max-h-[90vh]">
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Complete Your Profile</h2>
            
            {error && (
              <div className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              setIsLoading(true);
              setError("");
              // Split the generic values map back into the signup route's
              // named fields (name/dob/gender) plus fieldValues for CUSTOM fields.
              const fieldValues: { fieldId: string; value: string }[] = [];
              for (const f of fields as FormFieldDTO[]) {
                if (f.source !== "CUSTOM") continue;
                const v = values[f.id];
                if (v !== undefined && v !== null && v !== "") {
                  fieldValues.push({ fieldId: f.id, value: Array.isArray(v) ? JSON.stringify(v) : String(v) });
                }
              }
              const payload = {
                email,
                name: String(values["name"] ?? ""),
                dob: String(values["dateOfBirth"] ?? ""),
                gender: String(values["gender"] ?? ""),
                token,
                fieldValues
              };
              const res = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              const data = await res.json();
              if (!res.ok) {
                setError(data.message || 'Signup failed');
                setIsLoading(false);
                return;
              }

              // Create a draft registration for this camper against the camp/campus
              // encoded in the signup link, then send the parent to finish it.
              try {
                const draft = await createDraft.mutateAsync({
                  camperId: data.camperId,
                  campId: signupLinkData!.campId,
                  campusId: signupLinkData!.campusId,
                });
                setSuccess('Profile created! Continuing to registration...');
                setIsLoading(false);
                router.push(`/dashboard/register/${draft.id}`);
              } catch {
                setIsLoading(false);
                router.push('/dashboard');
              }
            }}>
              <div className="mb-4">
                <DynamicFieldGroup fields={visibleFields} values={values} onChange={setValue} />
              </div>

              <button 
                className="w-full rounded-full bg-[#E67E22] text-white py-3 font-medium hover:bg-[#D35400] transition disabled:opacity-50 mt-4" 
                type="submit" 
                disabled={isLoading}
              >
                {isLoading ? 'Submitting...' : 'Complete Signup'}
              </button>
            </form>
            
            {success && (
              <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-lg text-center">
                {success}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}

// Page component that handles the React.use() and passes the token
export default function SignupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = React.use(params);
  return <SignupForm token={token} />;
}
