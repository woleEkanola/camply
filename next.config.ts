import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@next-auth/prisma-adapter"],
};

export default nextConfig;
