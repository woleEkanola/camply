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
interface CamperData {
  name: string;
  dob: string;
  gender: string;
}

// Client component that handles all the actual logic
function SignupForm({ token }: { token: string }) {
  console.log("SignupForm rendering with token:", token);
  const router = useRouter();
  
  // Multistep state
  const [step, setStep] = useState(1);
  // Step 1: account info
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Step 2: campers
  const [campers, setCampers] = useState<CamperData[]>([{ name: "", dob: "", gender: "" }]);
  // Step 3: confirmation
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkDetails, setLinkDetails] = useState<any>(null);
  const [isLinkValid, setIsLinkValid] = useState<boolean | null>(null);

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

  // Handlers for steps
  function handleNextStep1() {
    setError("");
    if (!email || !password || !confirmPassword) {
      setError("All fields are required");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }
    setStep(2);
  }
  function handleAddCamper() {
    setCampers([...campers, { name: "", dob: "", gender: "" }]);
  }
  function handleRemoveCamper(idx: number) {
    setCampers(campers.filter((_, i) => i !== idx));
  }
  function handleCampersChange(idx: number, field: keyof CamperData, value: string) {
    setCampers(campers.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }
  function handleNextStep2() {
    setError("");
    if (campers.some(c => !c.name || !c.dob || !c.gender)) {
      setError("All campers must have name, date of birth, and gender");
      return;
    }
    setStep(3);
  }
  function handleBack() {
    setStep(s => Math.max(1, s - 1));
  }
  const createUserMutation = api.auth.signup.useMutation();
  const createCamperProfileMutation = api.camperProfile.createDuringSignup.useMutation();
  async function handleSubmitFinal() {
    setError(""); setSuccess(""); setIsSubmitting(true);
    try {
      const userData = {
        email, password,
        firstName: "", lastName: "",
        role: "BASE_USER", // Ensure BASE_USER is used for signup
        organizationId: linkDetails.organizationId,
      };
      const userResp = await createUserMutation.mutateAsync(userData);
      if (!userResp.success) throw new Error(userResp.message || "Signup failed");
      for (const camper of campers) {
        await createCamperProfileMutation.mutateAsync({
          name: camper.name,
          userId: userResp.userId,
          organizationId: linkDetails.organizationId,
          locationId: linkDetails.locationId,
          dateOfBirth: camper.dob, // Pass as ISO string
          gender: camper.gender,
        });
      }
      setSuccess("Signup complete! You can now log in.");
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setIsSubmitting(false);
  }

  // --- Render ---
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
    <div className="max-w-lg mx-auto bg-white p-8 rounded shadow mt-8">
      <h2 className="text-2xl font-bold mb-6">Sign Up</h2>
      {error && <div className="mb-4 text-red-600">{error}</div>}
      {success && <div className="mb-4 text-green-600">{success}</div>}
      {step === 1 && (
        <div>
          <div className="mb-4">
            <label>Email</label>
            <input className="w-full border rounded p-2" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="mb-4">
            <label>Password</label>
            <input className="w-full border rounded p-2" type="password" value={password} onChange={e => setPassword(e.target.value)} />
            <p className="text-xs text-gray-500">Password must be at least 8 characters</p>
          </div>
          <div className="mb-4">
            <label>Confirm Password</label>
            <input className="w-full border rounded p-2" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          </div>
          <button className="bg-emerald-600 text-white px-4 py-2 rounded" onClick={handleNextStep1}>Next</button>
        </div>
      )}
      {step === 2 && (
        <div>
          {campers.map((camper, idx) => (
            <div key={idx} className="mb-4 border-b pb-4">
              <div className="mb-2">
                <label>Camper Name</label>
                <input className="w-full border rounded p-2" type="text" value={camper.name} onChange={e => handleCampersChange(idx, "name", e.target.value)} />
              </div>
              <div className="mb-2">
                <label>Date of Birth</label>
                <input className="w-full border rounded p-2" type="date" value={camper.dob} onChange={e => handleCampersChange(idx, "dob", e.target.value)} />
              </div>
              <div className="mb-2">
                <label>Gender</label>
                <select className="w-full border rounded p-2" value={camper.gender} onChange={e => handleCampersChange(idx, "gender", e.target.value)}>
                  <option value="">Select Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              {campers.length > 1 && (
                <button className="text-red-600 text-xs" onClick={() => handleRemoveCamper(idx)}>Remove</button>
              )}
            </div>
          ))}
          <button className="bg-blue-500 text-white px-3 py-1 rounded mr-2" onClick={handleAddCamper}>Add Another Camper</button>
          <button className="bg-emerald-600 text-white px-4 py-2 rounded ml-2" onClick={handleNextStep2}>Next</button>
          <button className="ml-2 text-gray-700 underline" onClick={handleBack}>Back</button>
        </div>
      )}
      {step === 3 && (
        <div>
          <h3 className="font-semibold mb-2">Confirm Information</h3>
          <div className="mb-2">Email: {email}</div>
          <div className="mb-2">Campers:</div>
          <ul className="mb-4">
            {campers.map((c, i) => (
              <li key={i} className="ml-4">{c.name} (DOB: {c.dob}, Gender: {c.gender})</li>
            ))}
          </ul>
          <button className="bg-emerald-600 text-white px-4 py-2 rounded" onClick={handleSubmitFinal} disabled={isSubmitting}>{isSubmitting ? 'Submitting...' : 'Submit'}</button>
          <button className="ml-2 text-gray-700 underline" onClick={handleBack}>Back</button>
        </div>
      )}
    </div>
  );
}

// Page component that handles the React.use() and passes the token
export default function SignupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = React.use(params);
  console.log("SignupPage received token:", token);
  return <SignupForm token={token} />;
}
