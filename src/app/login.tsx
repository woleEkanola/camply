"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/trpc/auth.login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { email, password } })
    });
    const data = await res.json();
    if (data.error) {
      setError(data.error.message || "Login failed");
      return;
    }
    const user = data.result.data;
    // Store user in localStorage for demo; replace with real session in prod
    window.localStorage.setItem("user", JSON.stringify(user));
    if (user.role === "SUPER_ADMIN") router.push("/super-admin");
    else if (user.role === "OWNER") router.push("/admin");
    else setError("Unknown role");
  }

  return (
    <div style={{ maxWidth: 400, margin: "auto", marginTop: 80 }}>
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ width: "100%", marginBottom: 8 }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{ width: "100%", marginBottom: 8 }}
        />
        <button type="submit" style={{ width: "100%" }}>Login</button>
        {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}
      </form>
    </div>
  );
}
