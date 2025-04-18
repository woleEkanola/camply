"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OwnerDashboard() {
  const router = useRouter();

  useEffect(() => {
    const user = JSON.parse(window.localStorage.getItem("user") || "null");
    if (!user || user.role !== "OWNER") {
      router.push("/login");
    }
  }, []);

  return (
    <div style={{ maxWidth: 400, margin: "auto", marginTop: 80 }}>
      <h2>Owner Admin Dashboard</h2>
      <p>Welcome! You are logged in as an Organization Owner.</p>
    </div>
  );
}
