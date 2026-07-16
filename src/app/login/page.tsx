"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { normalizeEmail } from "@/lib/email";
import { OtpInput } from "@/components/ui/OtpInput";

const RESEND_COOLDOWN_SECONDS = 30;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loginType, setLoginType] = useState<"otp" | "password">("password");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(false);
  
  // States for verification code (OTP) and password
  const [authValue, setAuthValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const router = useRouter();

  // Resend-code cooldown, step 2.
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  // Forgot-password / reset-password, step 3.
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [forgotResendCooldown, setForgotResendCooldown] = useState(0);
  useEffect(() => {
    if (forgotResendCooldown <= 0) return;
    const id = setInterval(() => setForgotResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [forgotResendCooldown]);

  async function sendCode(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch("/api/base-user/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(email) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, message: data.message || "Couldn't send a verification code. Please try again." };
      }
      return { ok: true, message: data.message || "If this email is registered, we've sent a code — check your inbox." };
    } catch {
      return { ok: false, message: "Couldn't reach the server. Check your connection and try again." };
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setHint("");
    setLoading(true);
    const result = await sendCode();
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setInfo(result.message);
    setStep(2);
  }

  async function handleResendCode() {
    if (resendCooldown > 0 || resending) return;
    setError("");
    setInfo("");
    setResending(true);
    const result = await sendCode();
    setResending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setInfo(result.message);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
  }

  function handleBackToEmail() {
    setStep(1);
    setAuthValue("");
    setPasswordValue("");
    setError("");
    setInfo("");
    setHint("");
  }

  async function handleRedirectAfterLogin() {
    const sessionRes = await fetch("/api/auth/session");
    const session = await sessionRes.json();
    const role = session?.user?.role;

    switch (role) {
      case "PARENT":
        router.push("/dashboard");
        break;
      case "OWNER":
      case "ADMIN":
        router.push("/admin");
        break;
      case "CAMPUS_REPRESENTATIVE":
        router.push("/campus-rep-dashboard");
        break;
      case "SUPER_ADMIN":
        router.push("/super-admin");
        break;
      default:
        router.push("/");
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const authRes = await signIn("credentials", { redirect: false, email: normalizeEmail(email), password: passwordValue });
      if (authRes?.error) {
        setError("Incorrect email or password.");
        setHint("If you registered with a verification code, use Email OTP or reset your password.");
      } else {
        await handleRedirectAfterLogin();
      }
    } catch {
      setError("Authentication failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setHint("");
    setLoading(true);
    try {
      const authRes = await signIn("credentials", { redirect: false, email: normalizeEmail(email), otp: authValue });
      if (authRes?.error) {
        setError("Incorrect verification code.");
      } else {
        await handleRedirectAfterLogin();
      }
    } catch {
      setError("Authentication failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (forgotResendCooldown > 0) return;
    if (!email) {
      setError("Please enter your email address first.");
      return;
    }
    setError("");
    setInfo("");
    setHint("");
    setForgotLoading(true);
    try {
      const res = await fetch("/api/base-user/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(email) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Couldn't send a reset code. Please try again.");
        setForgotLoading(false);
        return;
      }
      setInfo(data.message || "If an account exists for this email, we've sent a password reset code.");
      setResetOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setStep(3);
      setForgotResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setHint("");
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setResetLoading(true);
    try {
      const res = await fetch("/api/base-user/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(email), otp: resetOtp, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Couldn't reset the password. Please try again.");
        setResetLoading(false);
        return;
      }
      setAuthValue("");
      setPasswordValue("");
      setResetOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setInfo("Password updated — log in with your new password.");
      setLoginType("password");
      setStep(1);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setResetLoading(false);
    }
  }

  const emailStepForm = (
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
        className="w-full rounded-full bg-[#E67E22] text-white py-3 font-medium hover:bg-[#D35400] transition disabled:opacity-50 cursor-pointer"
      >
        {loading ? "Sending..." : "Next"}
      </button>
    </form>
  );

  const passwordStepForm = (
    <form onSubmit={handlePasswordSubmit}>
      <div className="mb-4">
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-[#E67E22] focus:ring-[#E67E22] focus:outline-none shadow-sm"
        />
      </div>
      <div className="mb-4">
        <input
          type="password"
          placeholder="Enter Password"
          value={passwordValue}
          onChange={(e) => setPasswordValue(e.target.value)}
          required
          className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-[#E67E22] focus:ring-[#E67E22] focus:outline-none shadow-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-[#E67E22] text-white py-3 font-medium hover:bg-[#D35400] transition disabled:opacity-50 cursor-pointer"
      >
        {loading ? "Logging in..." : "Login"}
      </button>
      <div className="mt-4 flex justify-end text-sm">
        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={forgotLoading || forgotResendCooldown > 0}
          className="text-[#E67E22] hover:underline font-medium disabled:opacity-50 cursor-pointer"
        >
          {forgotLoading ? "Sending..." : forgotResendCooldown > 0 ? `Try again in ${forgotResendCooldown}s` : "Forgot password?"}
        </button>
      </div>
    </form>
  );

  const authStepForm = (
    <form onSubmit={handleOtpSubmit}>
      <div className="mb-5">
        <OtpInput disabled={loading} onComplete={setAuthValue} />
        <p className="mt-2 text-center text-xs text-gray-500">
          Enter the 6-digit verification code emailed to you.
        </p>
      </div>
      <button
        type="submit"
        disabled={loading || authValue.length !== 6}
        className="w-full rounded-full bg-[#E67E22] text-white py-3 font-medium hover:bg-[#D35400] transition disabled:opacity-50 cursor-pointer"
      >
        {loading ? "Logging in..." : "Login"}
      </button>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={handleBackToEmail}
          className="text-gray-500 hover:text-gray-700 hover:underline cursor-pointer"
        >
          &larr; Back
        </button>
      </div>
      <div className="mt-2 text-center text-sm">
        <button
          type="button"
          onClick={handleResendCode}
          disabled={resending || resendCooldown > 0}
          className="text-gray-500 hover:text-gray-700 hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
        >
          {resending ? "Resending..." : resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code to email"}
        </button>
      </div>
    </form>
  );

  const resetPasswordForm = (
    <form onSubmit={handleResetPassword}>
      <p className="mb-4 text-sm text-gray-600">
        Enter the verification code we sent to <span className="font-medium">{email}</span> and choose a new password.
      </p>
      <div className="mb-4">
        <OtpInput disabled={resetLoading} onComplete={setResetOtp} />
      </div>
      <div className="mb-4">
        <input
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-[#E67E22] focus:ring-[#E67E22] focus:outline-none shadow-sm"
        />
      </div>
      <div className="mb-5">
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          className="w-full rounded-full border border-gray-300 px-4 py-3 focus:border-[#E67E22] focus:ring-[#E67E22] focus:outline-none shadow-sm"
        />
      </div>
      <button
        type="submit"
        disabled={resetLoading || resetOtp.length !== 6}
        className="w-full rounded-full bg-[#E67E22] text-white py-3 font-medium hover:bg-[#D35400] transition disabled:opacity-50 cursor-pointer"
      >
        {resetLoading ? "Updating..." : "Reset Password"}
      </button>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => { setStep(1); setLoginType("password"); setError(""); setInfo(""); setHint(""); }}
          className="text-gray-500 hover:text-gray-700 hover:underline cursor-pointer"
        >
          &larr; Back
        </button>
        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={forgotLoading || forgotResendCooldown > 0}
          className="text-[#E67E22] hover:underline font-medium disabled:opacity-50 cursor-pointer"
        >
          {forgotLoading ? "Resending..." : forgotResendCooldown > 0 ? `Resend code (${forgotResendCooldown}s)` : "Resend code"}
        </button>
      </div>
    </form>
  );

  const stepForm = 
    step === 1 
      ? (loginType === "otp" ? emailStepForm : passwordStepForm) 
      : step === 2 
        ? authStepForm 
        : resetPasswordForm;
        
  const heading = step === 3 ? "Reset Password" : "Login";

  const tabsHeader = step === 1 && (
    <div className="flex border-b border-gray-200 mb-6">
      <button
        type="button"
        onClick={() => {
          setLoginType("password");
          setError("");
          setInfo("");
          setHint("");
        }}
        className={`flex-1 pb-3 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
          loginType === "password"
            ? "border-[#E67E22] text-[#E67E22]"
            : "border-transparent text-gray-500 hover:text-gray-900"
        }`}
      >
        Password
      </button>
      <button
        type="button"
        onClick={() => {
          setLoginType("otp");
          setError("");
          setInfo("");
          setHint("");
        }}
        className={`flex-1 pb-3 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
          loginType === "otp"
            ? "border-[#E67E22] text-[#E67E22]"
            : "border-transparent text-gray-500 hover:text-gray-900"
        }`}
      >
        Email OTP
      </button>
    </div>
  );

  const messages = (
    <>
      {error && (
        <div className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {!error && info && (
        <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
          {info}
        </div>
      )}
      {hint && (
        <div className="mb-4 rounded-md bg-blue-50 p-3 text-sm text-blue-700">
          {hint}
        </div>
      )}
    </>
  );

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
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">{heading}</h2>

            {tabsHeader}
            {messages}
            {stepForm}

            {step !== 3 && (
              <div className="mt-4 text-center text-sm text-neutral-500">
                Are you a church owner?{" "}
                <Link href="/signup-org" className="text-[#E67E22] hover:underline font-semibold">
                  Register your church
                </Link>
              </div>
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
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">{heading}</h2>

            {tabsHeader}
            {messages}
            {stepForm}

            {step !== 3 && (
              <div className="mt-5 text-center text-sm text-neutral-500">
                Are you a church owner?{" "}
                <Link href="/signup-org" className="text-[#E67E22] hover:underline font-semibold">
                  Register your church
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
