"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Image from "next/image";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isBaseUser, setIsBaseUser] = useState(false);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/base-user/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      
      if (res.status === 200) {
        // Success - OTP sent to base user
        setIsBaseUser(true);
        setStep(2);
      } else if (data.message?.includes("not a base user")) {
        // User exists but is an admin type - proceed to password
        setIsBaseUser(false);
        setStep(2);
      } else if (data.message?.includes("No user found")) {
        // No user found with this email
        setError("Email not found. Please check and try again.");
      } else {
        // Other errors
        setError(data.message || "Failed to send OTP");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const authRes = await signIn("credentials", {
        redirect: false,
        email,
        ...(isBaseUser ? { otp } : { password }),
      });

      if (authRes?.error) {
        setError(isBaseUser ? "OTP authentication failed" : "Password authentication failed");
      } else {
        const sessionRes = await fetch("/api/auth/session");
        const session = await sessionRes.json();
        const role = session?.user?.role;

        switch (role) {
          case "BASE_USER":
            router.push("/dashboard");
            break;
          case "OWNER":
          case "ADMIN":
            router.push("/admin");
            break;
          case "LOCATION_ADMIN":
            router.push("/location-admin-dashboard");
            break;
          case "SUPER_ADMIN":
            router.push("/super-admin");
            break;
          default:
            router.push("/");
        }
      }
    } catch {
      setError("Authentication failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

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

        {/* Login form overlay with higher z-index, positioned higher */}
        <div className="absolute inset-x-0 bottom-[20%] z-10 flex justify-center">
          <div className="w-[85%] bg-white p-6 rounded-2xl shadow-lg">
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Login</h2>

            {error && (
              <div className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {step === 1 && (
              <form onSubmit={handleEmailSubmit}>
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
                  disabled={loading}
                  className="w-full rounded-full bg-[#E67E22] text-white py-3 font-medium hover:bg-[#D35400] transition disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Next"}
                </button>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={handleAuthSubmit}>
                <div className="mb-5">
                  <input
                    type={isBaseUser ? "text" : "password"}
                    placeholder={isBaseUser ? "Enter OTP" : "Enter Password"}
                    value={isBaseUser ? otp : password}
                    onChange={(e) =>
                      isBaseUser ? setOtp(e.target.value) : setPassword(e.target.value)
                    }
                    required
                    className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-[#E67E22] focus:ring-[#E67E22] focus:outline-none shadow-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-[#E67E22] text-white py-3 font-medium hover:bg-[#D35400] transition disabled:opacity-50"
                >
                  {loading
                    ? isBaseUser
                      ? "Verifying..."
                      : "Logging in..."
                    : isBaseUser
                    ? "Verify OTP"
                    : "Login"}
                </button>
              </form>
            )}
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
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Login</h2>

            {error && (
              <div className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {step === 1 && (
              <form onSubmit={handleEmailSubmit}>
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
                  disabled={loading}
                  className="w-full rounded-full bg-[#E67E22] text-white py-3 font-medium hover:bg-[#D35400] transition disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Next"}
                </button>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={handleAuthSubmit}>
                <div className="mb-5">
                  <input
                    type={isBaseUser ? "text" : "password"}
                    placeholder={isBaseUser ? "Enter OTP" : "Enter Password"}
                    value={isBaseUser ? otp : password}
                    onChange={(e) =>
                      isBaseUser ? setOtp(e.target.value) : setPassword(e.target.value)
                    }
                    required
                    className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-[#E67E22] focus:ring-[#E67E22] focus:outline-none shadow-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-[#E67E22] text-white py-3 font-medium hover:bg-[#D35400] transition disabled:opacity-50"
                >
                  {loading
                    ? isBaseUser
                      ? "Verifying..."
                      : "Logging in..."
                    : isBaseUser
                    ? "Verify OTP"
                    : "Login"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
