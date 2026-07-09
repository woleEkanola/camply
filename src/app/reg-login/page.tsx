"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function RegLoginPage() {
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetch("/api/base-user/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setOtpSent(true);
        setSuccess("OTP sent to your email if the email is correct.");
        router.push(`/reg-login/verify-otp?email=${encodeURIComponent(email)}`);
      } else {
        setError(data.message || "Failed to send OTP");
      }
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
          <h2 className="mb-6 text-center text-xl font-semibold text-neutral-900">Base User Login</h2>
          {!otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <Input
                label="Email Address"
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
              {error && <div className="text-sm text-danger-600">{error}</div>}
              {success && <div className="text-sm text-success-600">{success}</div>}
              <Button type="submit" className="w-full" loading={loading}>Send OTP</Button>
            </form>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
