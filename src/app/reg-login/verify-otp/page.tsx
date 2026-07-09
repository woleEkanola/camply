"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function VerifyOtpPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      // Skip custom OTP verification API. Let NextAuth handle OTP verification and session creation directly.
      const authRes = await signIn("credentials", {
        redirect: true,
        email,
        otp,
        callbackUrl: "/dashboard"
      });
      // Optionally handle authRes if needed
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50">
      <Card className="w-full max-w-md">
        <CardBody>
          <h2 className="mb-6 text-center text-xl font-semibold text-neutral-900">Verify OTP</h2>
          <form onSubmit={handleVerify} className="space-y-4">
            <Input
              label="Email Address"
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <Input
              label="OTP Code"
              id="otp"
              type="text"
              value={otp}
              onChange={e => setOtp(e.target.value)}
              required
              maxLength={6}
            />
            {error && <div className="text-sm text-danger-600">{error}</div>}
            {success && <div className="text-sm text-success-600">{success}</div>}
            <Button type="submit" className="w-full" loading={loading}>Verify OTP</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
