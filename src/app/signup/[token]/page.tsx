"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../utils/api";
import { signIn } from "next-auth/react";
import Image from "next/image";
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
      <div className="flex h-screen overflow-hidden font-sans">
        <div className="w-full flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#E67E22] mb-4"></div>
          <p className="ml-3">Validating signup link...</p>
        </div>
      </div>
    );
  }

  if (signupLinkError) {
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
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Signup Error</h2>
            <div className="text-red-600 mb-4 p-3 bg-red-100 rounded-lg">Invalid or expired signup link.</div>
            <div className="text-center mt-4">
              <Link href="/login" className="text-[#E67E22] hover:underline font-medium">Return to login</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Collect Email and create user, send OTP
  if (step === 'email') {
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
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Sign Up</h2>
            
            {error && (
              <div className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            
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
              <div className="mb-5">
                <input 
                  type="email" 
                  placeholder="Email"
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                  className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-[#E67E22] focus:ring-[#E67E22] focus:outline-none shadow-sm"
                />
              </div>
              <button 
                className="w-full rounded-full bg-[#E67E22] text-white py-3 font-medium hover:bg-[#D35400] transition disabled:opacity-50" 
                type="submit" 
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : 'Continue'}
              </button>
            </form>
          </div>
        </div>
      </div>
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
                // Proceed to profile step
                setStep('profile');
              } catch (err) {
                setError('Network error. Please try again.');
                setIsLoading(false);
              }
              // Sign in with OTP for session
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
                <input 
                  className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-[#E67E22] focus:ring-[#E67E22] focus:outline-none shadow-sm" 
                  type="text" 
                  placeholder="Full Name"
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  required 
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1 ml-2">Date of Birth</label>
                <input 
                  className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-[#E67E22] focus:ring-[#E67E22] focus:outline-none shadow-sm" 
                  type="date" 
                  value={dob} 
                  onChange={e => setDob(e.target.value)} 
                  required 
                />
              </div>
              <div className="mb-4">
                <select 
                  className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-[#E67E22] focus:ring-[#E67E22] focus:outline-none shadow-sm" 
                  value={gender} 
                  onChange={e => setGender(e.target.value)} 
                  required
                >
                  <option value="">Select Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              
              {dynamicFields.length > 0 && (
                <div className="mt-6 mb-4">
                  <h3 className="text-lg font-medium text-gray-800 mb-3">Additional Information</h3>
                  <div className="space-y-4">
                    {dynamicFields.map(field => (
                      <div key={field.id}>
                        <label className="block text-sm font-medium text-gray-700 mb-1 ml-2">{field.name}</label>
                        <input
                          className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-[#E67E22] focus:ring-[#E67E22] focus:outline-none shadow-sm"
                          type="text"
                          placeholder={field.name}
                          value={dynamicValues[field.id] || ""}
                          onChange={e => setDynamicValues(v => ({ ...v, [field.id]: e.target.value }))}
                          required={field.required}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
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
