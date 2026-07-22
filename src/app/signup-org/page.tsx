"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/utils/trpc";

export default function SignupOrgPage() {
  const [churchName, setChurchName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const registerMutation = api.auth.registerOrganization.useMutation({
    onSuccess: async () => {
      setSuccess("Church registered successfully! Logging you in...");
      // Auto login the newly registered user
      try {
        const loginRes = await signIn("credentials", {
          redirect: false,
          email,
          password,
        });

        if (loginRes?.error) {
          router.push("/login");
        } else {
          router.push("/admin");
        }
      } catch {
        router.push("/login");
      }
    },
    onError: (err) => {
      setError(err.message || "Failed to register. Please check your inputs and try again.");
      setLoading(false);
    }
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (!churchName || !firstName || !lastName || !email || !password) {
      setError("All fields are required");
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      setLoading(false);
      return;
    }

    registerMutation.mutate({
      churchName,
      firstName,
      lastName,
      email,
      password,
    });
  }

  return (
    <>
      {/* Mobile View */}
      <div className="md:hidden relative min-h-screen font-sans bg-accent-600 flex flex-col justify-between py-6">
        <div className="flex flex-col items-center">
          <div className="mt-4 mb-4">
            <Image src="/logo.png" alt="Logo" width={80} height={80} />
          </div>
          
          <div className="w-[90%] bg-white p-6 rounded-2xl shadow-lg mt-2 mb-6">
            <h2 className="text-xl font-bold text-center mb-4 text-gray-800">Register Your Church</h2>

            {error && (
              <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 rounded-md bg-success-50 p-3 text-sm text-success-700">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                placeholder="Church / Organisation Name"
                value={churchName}
                onChange={(e) => setChurchName(e.target.value)}
                required
                className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-accent-500 focus:ring-accent-500 focus:outline-none shadow-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-accent-500 focus:ring-accent-500 focus:outline-none shadow-sm"
                />
                <input
                  type="text"
                  placeholder="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-accent-500 focus:ring-accent-500 focus:outline-none shadow-sm"
                />
              </div>
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-accent-500 focus:ring-accent-500 focus:outline-none shadow-sm"
              />
              <input
                type="password"
                placeholder="Password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-accent-500 focus:ring-accent-500 focus:outline-none shadow-sm"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-accent-600 text-white py-2.5 font-medium hover:bg-accent-700 transition disabled:opacity-50 text-sm shadow"
              >
                {loading ? "Registering..." : "Create Account"}
              </button>
            </form>
            <div className="mt-4 text-center text-xs text-neutral-500">
              Already have an account?{" "}
              <Link href="/login" className="text-accent-600 hover:underline font-semibold">
                Login here
              </Link>
            </div>
          </div>
        </div>

        <div className="text-center mt-2">
          <h1 className="text-xl font-bold tracking-wide text-white">JESUS TRIBE</h1>
          <h2 className="text-sm font-medium mt-0.5 text-white">Teens Camp</h2>
        </div>
      </div>

      {/* Desktop View */}
      <div className="hidden md:flex h-screen overflow-hidden font-sans">
        {/* Left Panel */}
        <div className="w-[50%] h-full flex items-center justify-center p-4">
          <div className="ml-[5%] w-[76%] h-[90vh] bg-accent-600 flex flex-col items-center justify-center p-6 text-white rounded-2xl shadow">
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
        <div className="w-[44%] h-full flex items-center justify-center bg-neutral-50 p-4">
          <div className="w-full max-w-md bg-white p-6 md:p-8 rounded-2xl shadow-lg">
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Register Your Church</h2>

            {error && (
              <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 rounded-md bg-success-50 p-3 text-sm text-success-700">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 ml-3">CHURCH / ORGANISATION NAME</label>
                <input
                  type="text"
                  placeholder="e.g. Grace Fellowship"
                  value={churchName}
                  onChange={(e) => setChurchName(e.target.value)}
                  required
                  className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-accent-500 focus:ring-accent-500 focus:outline-none shadow-sm"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1 ml-3">FIRST NAME</label>
                  <input
                    type="text"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-accent-500 focus:ring-accent-500 focus:outline-none shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1 ml-3">LAST NAME</label>
                  <input
                    type="text"
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-accent-500 focus:ring-accent-500 focus:outline-none shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 ml-3">EMAIL ADDRESS</label>
                <input
                  type="email"
                  placeholder="pastor@church.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-accent-500 focus:ring-accent-500 focus:outline-none shadow-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1 ml-3">PASSWORD</label>
                <input
                  type="password"
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-accent-500 focus:ring-accent-500 focus:outline-none shadow-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-accent-600 text-white py-3 font-medium hover:bg-accent-700 transition disabled:opacity-50 shadow mt-2"
              >
                {loading ? "Registering..." : "Create Account"}
              </button>
            </form>
            <div className="mt-6 text-center text-sm text-neutral-500">
              Already have an account?{" "}
              <Link href="/login" className="text-accent-600 hover:underline font-semibold">
                Login here
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
