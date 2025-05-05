"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState(1); // 1: email, 2: otp/password
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
      // Check if email exists and is base_user
      const res = await fetch("/api/base-user/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.status === 200) {
        setIsBaseUser(true);
        setStep(2);
      } else if (data.message && data.message.includes("No user found") || data.message?.includes("not a base user")) {
        setError("No base user found with this email. If you are an admin, please use your password.");
        setIsBaseUser(false);
        setStep(2);
      } else {
        setError(data.message || "Failed to send OTP");
      }
    } catch (err) {
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
      if (isBaseUser) {
        // OTP login
        const authRes = await signIn("credentials", {
          redirect: false,
          email,
          otp,
        });
        if (authRes?.error) {
          setError("OTP authentication failed");
        } else {
          // Fetch session to get user role
          const sessionRes = await fetch("/api/auth/session");
          const session = await sessionRes.json();
          const role = session?.user?.role;
          if (role === "BASE_USER") router.push("/dashboard");
          else if (role === "OWNER" || role === "ADMIN") router.push("/admin");
          else if (role === "LOCATION_ADMIN") router.push("/location-admin-dashboard");
          else if (role === "SUPER_ADMIN") router.push("/super-admin");
          else router.push("/");
        }
      } else {
        // Password login
        const authRes = await signIn("credentials", {
          redirect: false,
          email,
          password,
        });
        if (authRes?.error) {
          setError("Password authentication failed");
        } else {
          // Fetch session to get user role
          const sessionRes = await fetch("/api/auth/session");
          const session = await sessionRes.json();
          const role = session?.user?.role;
          if (role === "OWNER" || role === "ADMIN") router.push("/admin");
          else if (role === "LOCATION_ADMIN") router.push("/location-admin-dashboard");
          else if (role === "SUPER_ADMIN") router.push("/super-admin");
          else if (role === "BASE_USER") router.push("/dashboard");
          else router.push("/");
        }
      }
    } catch (err) {
      setError("Authentication failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-800">Login to Camply</h1>
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        {step === 1 && (
          <form onSubmit={handleEmailSubmit}>
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Next"}
            </button>
          </form>
        )}
        {step === 2 && (
          <form onSubmit={handleAuthSubmit}>
            {isBaseUser ? (
              <>
                <div className="mb-6">
                  <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
                    OTP
                  </label>
                  <input
                    type="text"
                    id="otp"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {loading ? "Verifying..." : "Verify OTP"}
                </button>
              </>
            ) : (
              <>
                <div className="mb-6">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {loading ? "Logging in..." : "Login"}
                </button>
              </>
            )}
          </form>
        )}
        <div className="mt-4 text-center text-sm text-gray-600">
          <p>Super Admin: superadmin@camply.com / password123</p>
        </div>
      </div>
    </div>
  );
}
