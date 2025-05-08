"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../utils/api";
import { signIn } from "next-auth/react";
// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "LOCATION_ADMIN";
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
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [dynamicFields, setDynamicFields] = useState<any[]>([]);
  const [dynamicValues, setDynamicValues] = useState<{ [key: string]: any }>({});
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Use tRPC to validate the signup link token
  const {
    data: signupLinkData,
    isLoading: isSignupLinkLoading,
    error: signupLinkError
  } = api.signupLink.validateToken.useQuery({ token }, { retry: false });

  // Fetch organizationId after OTP verified
  useEffect(() => {
    if (step === 'profile' && !organizationId && signupLinkData) {
      // Get organizationId from validated token data
      const orgId = signupLinkData.organizationId;
      setOrganizationId(orgId);
    }
  }, [step, organizationId, signupLinkData]);

  // Fetch dynamic profile fields
  useEffect(() => {
    if (organizationId) {
      (async () => {
        try {
          const res = await fetch('/api/trpc/profileField.getByOrganization?input=' + encodeURIComponent(JSON.stringify({ organizationId })));
          const json = await res.json();
          setDynamicFields(json?.result?.data || []);
        } catch (e) {
          setError('Could not fetch profile fields.');
        }
      })();
    }
  }, [organizationId]);

  if (isSignupLinkLoading) {
    return (
      <div className="max-w-lg mx-auto bg-white p-8 rounded shadow mt-8 flex flex-col items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-600 mb-4"></div>
        <span>Checking registration status...</span>
      </div>
    );
  }

  if (signupLinkError) {
    const closed = signupLinkError.message?.includes("inactive signup link") ||
      signupLinkError.message?.includes("inactive year") ||
      signupLinkError.message?.includes("Invalid") ||
      signupLinkError.message?.includes("not found") ||
      signupLinkError.data?.code === "NOT_FOUND" ||
      signupLinkError.data?.code === "BAD_REQUEST";
    if (closed) {
      return (
        <div className="max-w-lg mx-auto bg-white p-8 rounded shadow mt-8 flex flex-col items-center">
          <span className="text-2xl font-bold mb-4">Registration has closed</span>
          <span className="text-red-600">{signupLinkError.message || 'This registration link is no longer active.'}</span>
        </div>
      );
    }
    return (
      <div className="max-w-lg mx-auto bg-white p-8 rounded shadow mt-8 flex flex-col items-center">
        <span className="text-2xl font-bold mb-4">Error</span>
        <span className="text-red-600">{signupLinkError.message || 'An error occurred while validating the signup link.'}</span>
      </div>
    );
  }

  // Step 1: Collect Email and create user, send OTP
  if (step === 'email') {
    return (
      <div className="max-w-lg mx-auto bg-white p-8 rounded shadow mt-8">
        <h2 className="text-2xl font-bold mb-6">Sign Up</h2>
        {error && <div className="mb-4 text-red-600">{error}</div>}
        <form onSubmit={async (e) => {
          e.preventDefault();
          setIsLoading(true);
          setError("");
          // Create base user and send OTP
          const res = await fetch('/api/base-user/create-and-send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, token }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.message || 'Error creating user or sending OTP');
            setIsLoading(false);
            return;
          }
          setStep('otp');
          setIsLoading(false);
        }}>
          <div className="mb-4">
            <label>Email</label>
            <input className="w-full border rounded p-2" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <button className="bg-emerald-600 text-white px-4 py-2 rounded" type="submit" disabled={isLoading}>{isLoading ? 'Processing...' : 'Continue'}</button>
        </form>
      </div>
    );
  }

  // Step 2: Verify OTP
  if (step === 'otp') {
    return (
      <div className="max-w-lg mx-auto bg-white p-8 rounded shadow mt-8">
        <h2 className="text-2xl font-bold mb-6">Verify Email</h2>
        {error && <div className="mb-4 text-red-600">{error}</div>}
        <form onSubmit={async (e) => {
          e.preventDefault();
          setIsLoading(true);
          setError("");
          const res = await fetch('/api/base-user/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, token }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.message || 'Invalid or expired OTP');
            setIsLoading(false);
            return;
          }
          // Automatically sign in the user using OTP as the 'otp' field
          console.log("Signing in with:", { email, otp });
          const signInResult = await signIn("credentials", {
            redirect: false,
            email,
            otp,
          });
          if (signInResult?.ok) {
            router.push('/dashboard');
          } else {
            setError("Failed to sign in after OTP verification.");
          }
          setIsLoading(false);
        }}>
          <div className="mb-4">
            <label>Enter OTP</label>
            <input className="w-full border rounded p-2" type="text" value={otp} onChange={e => setOtp(e.target.value)} required />
          </div>
          <button className="bg-emerald-600 text-white px-4 py-2 rounded" type="submit" disabled={isLoading}>{isLoading ? 'Verifying...' : 'Verify OTP'}</button>
        </form>
      </div>
    );
  }

  // Step 3: Update Profile (name, dob, gender, dynamic fields)
  if (step === 'profile') {
    return (
      <div className="max-w-lg mx-auto bg-white p-8 rounded shadow mt-8">
        <h2 className="text-2xl font-bold mb-6">Complete Your Profile</h2>
        {error && <div className="mb-4 text-red-600">{error}</div>}
        <form onSubmit={async (e) => {
          e.preventDefault();
          setIsLoading(true);
          setError("");
          // Build dynamic field values array
          const fieldValues = dynamicFields.map(field => ({
            fieldId: field.id,
            value: dynamicValues[field.id] || ""
          }));
          const payload = {
            name,
            dob,
            gender,
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
          setSuccess('Signup complete! Redirecting...');
          setIsLoading(false);
          setTimeout(() => {
            router.push('/login');
          }, 1500);
        }}>
          <div className="mb-4">
            <label>Name</label>
            <input className="w-full border rounded p-2" type="text" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="mb-4">
            <label>Date of Birth</label>
            <input className="w-full border rounded p-2" type="date" value={dob} onChange={e => setDob(e.target.value)} required />
          </div>
          <div className="mb-4">
            <label>Gender</label>
            <select className="w-full border rounded p-2" value={gender} onChange={e => setGender(e.target.value)} required>
              <option value="">Select Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          {dynamicFields.map(field => (
            <div className="mb-4" key={field.id}>
              <label>{field.name}</label>
              <input
                className="w-full border rounded p-2"
                type="text"
                value={dynamicValues[field.id] || ""}
                onChange={e => setDynamicValues(v => ({ ...v, [field.id]: e.target.value }))}
                required={field.required}
              />
            </div>
          ))}
          <button className="bg-emerald-600 text-white px-4 py-2 rounded" type="submit" disabled={isLoading}>{isLoading ? 'Submitting...' : 'Complete Signup'}</button>
        </form>
        {success && <div className="mt-4 text-green-600">{success}</div>}
      </div>
    );
  }
}

// Page component that handles the React.use() and passes the token
export default function SignupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = React.use(params);
  return <SignupForm token={token} />;
}
