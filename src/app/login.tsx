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
          redirect: true,
          email,
          otp,
          callbackUrl: "/dashboard"
        });
      } else {
        // Password login
        const authRes = await signIn("credentials", {
          redirect: true,
          email,
          password,
          callbackUrl: "/admin"
        });
      }
    } catch (err) {
      setError("Authentication failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "auto", marginTop: 80 }}>
      <h2>Login</h2>
      {step === 1 && (
        <form onSubmit={handleEmailSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ width: "100%", marginBottom: 8 }}
          />
          <button type="submit" style={{ width: "100%" }} disabled={loading}>
            {loading ? "Sending..." : "Next"}
          </button>
          {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}
        </form>
      )}
      {step === 2 && (
        <form onSubmit={handleAuthSubmit}>
          {isBaseUser ? (
            <>
              <input
                type="text"
                placeholder="OTP"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                required
                style={{ width: "100%", marginBottom: 8 }}
              />
              <button type="submit" style={{ width: "100%" }} disabled={loading}>
                {loading ? "Verifying..." : "Verify OTP"}
              </button>
            </>
          ) : (
            <>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ width: "100%", marginBottom: 8 }}
              />
              <button type="submit" style={{ width: "100%" }} disabled={loading}>
                {loading ? "Logging in..." : "Login"}
              </button>
            </>
          )}
          {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}
        </form>
      )}
    </div>
  );
}
